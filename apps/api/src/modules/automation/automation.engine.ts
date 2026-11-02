import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  actionOf,
  definitionSchema,
  describeStep,
  evalGate,
  formatMinutes,
  RUNS_PER_HOUR_LIMIT,
  renderTemplate,
  triggerOf,
  type Context,
  type Definition,
  type Step,
} from '@torio/contracts';
import { PrismaService } from '../../database/prisma.service';
import { computeLeadScore } from '../leads/lead-score';
import {
  conversationContext,
  customerContext,
  leadContext,
  orderContext,
} from './automation.context';

const MAX_ATTEMPTS = 3;
const TICK_MS = 10_000;
const STUCK_MS = 2 * 60_000;
const HOUR = 3_600_000;
/** Prisma stores timestamps as UTC `timestamp` columns, so raw SQL must compare against UTC, not the server's zone. */
const NOW = Prisma.sql`timezone('UTC', now())`;

/** Wrong configuration or missing/foreign data: retrying can't help, so the run fails once and says why. */
class PermanentError extends Error {}

export type EntityKind = 'lead' | 'customer' | 'order' | 'conversation';
export type StepLog = {
  stepId: string;
  type: string;
  status: 'ok' | 'failed' | 'skipped' | 'waiting' | 'simulated';
  message: string;
  at: string;
};

/**
 * Event intake and execution.
 *
 * Intake: domain services call `emitEvent` after their own transaction commits. For each ACTIVE automation with a
 * matching trigger it inserts an execution row (unique per automation + event key, so replays and retries can't
 * start a second run). Nothing here can break the domain request: all errors are logged and swallowed.
 *
 * Execution: runs are claimed from the database (`FOR UPDATE SKIP LOCKED`), so queued and waiting runs survive
 * restarts and several API instances never run the same step twice. Each action commits together with the
 * progress marker (guarded on the current step), so a crash can't repeat a side effect. Automation changes never
 * emit events, so automations cannot trigger one another or loop.
 */
@Injectable()
export class AutomationEngine implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(AutomationEngine.name);
  private timer?: NodeJS.Timeout;
  private ticking = false;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Tests drive `tick()` themselves; a scheduler thread would make them nondeterministic.
    if (process.env.NODE_ENV === 'test' || process.env.AUTOMATION_SCHEDULER === 'off') return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref();
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ---------- intake ----------

  /** Builds the redacted context from fresh data, then queues matching runs. Never throws. */
  async emitEvent(
    type: string,
    workspaceId: string,
    kind: EntityKind,
    id: string,
    discriminator: string,
    extra: { previousStage?: string } = {},
  ): Promise<void> {
    try {
      const active = await this.prisma.client.automation.count({
        where: { workspaceId, status: 'ACTIVE', triggerType: type },
      });
      if (!active) return;
      const ctx = await this.buildContext(workspaceId, kind, id, extra);
      if (!ctx) return;
      await this.queue(type, workspaceId, kind, id, `${type}:${id}:${discriminator}`, ctx);
    } catch (e) {
      this.log.warn(`emit ${type} failed: ${(e as Error).message}`);
    }
  }

  private async buildContext(
    ws: string,
    kind: EntityKind,
    id: string,
    extra: { previousStage?: string },
  ): Promise<Context | null> {
    const db = this.prisma.client;
    if (kind === 'lead') {
      const l = await db.lead.findFirst({ where: { id, workspaceId: ws } });
      return l ? leadContext(l, extra.previousStage) : null;
    }
    if (kind === 'customer') {
      const c = await db.customer.findFirst({ where: { id, workspaceId: ws } });
      return c ? customerContext(c) : null;
    }
    if (kind === 'order') {
      const o = await db.order.findFirst({
        where: { id, workspaceId: ws },
        include: {
          customer: { select: { id: true, name: true, tags: true } },
          conversation: { select: { channel: { select: { provider: true } } } },
        },
      });
      return o ? orderContext(o, o.customer) : null;
    }
    const v = await db.conversation.findFirst({
      where: { id, workspaceId: ws },
      include: {
        channel: { select: { provider: true } },
        customer: { select: { id: true, name: true, tags: true } },
      },
    });
    return v ? conversationContext(v, v.customer) : null;
  }

  private async queue(
    type: string,
    ws: string,
    kind: EntityKind,
    entityId: string,
    eventKey: string,
    ctx: Context,
  ) {
    const db = this.prisma.client;
    const autos = await db.automation.findMany({
      where: {
        workspaceId: ws,
        status: 'ACTIVE',
        triggerType: type,
        publishedVersion: { not: null },
      },
      select: { id: true, publishedVersion: true },
    });
    for (const a of autos) {
      const base = {
        workspaceId: ws,
        automationId: a.id,
        version: a.publishedVersion!,
        triggerType: type,
        eventKey,
        entityType: kind,
        entityId,
        context: ctx as Prisma.InputJsonValue,
      };
      try {
        const recent = await db.automationExecution.count({
          where: {
            automationId: a.id,
            isTest: false,
            createdAt: { gte: new Date(Date.now() - HOUR) },
          },
        });
        if (recent >= RUNS_PER_HOUR_LIMIT) {
          await db.automationExecution.create({
            data: {
              ...base,
              status: 'SKIPPED',
              error: `Rate limit: more than ${RUNS_PER_HOUR_LIMIT} runs in the last hour`,
              finishedAt: new Date(),
            },
          });
          continue;
        }
        const ex = await db.automationExecution.create({
          data: { ...base, status: 'QUEUED', resumeAt: new Date() },
        });
        if (process.env.NODE_ENV !== 'test') setImmediate(() => void this.run(ex.id));
      } catch (e) {
        // A repeated event: the unique (automation, eventKey) index already holds this run.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
    }
  }

  // ---------- scheduling ----------

  /** Runs everything that is due. Safe to call concurrently and from several instances. */
  async tick(): Promise<number> {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      const rows = await this.prisma.client.$queryRaw<{ id: string }[]>`
        UPDATE automation_executions SET status = 'RUNNING', "lockedAt" = ${NOW},
          "startedAt" = COALESCE("startedAt", ${NOW})
        WHERE id IN (
          SELECT id FROM automation_executions
          WHERE ("isTest" = false AND status IN ('QUEUED', 'WAITING') AND "resumeAt" <= ${NOW})
             OR (status = 'RUNNING' AND "lockedAt" < ${NOW} - ${STUCK_MS / 1000} * interval '1 second')
          ORDER BY "resumeAt" NULLS FIRST LIMIT 25
          FOR UPDATE SKIP LOCKED
        ) RETURNING id`;
      for (const r of rows) await this.step(r.id);
      return rows.length;
    } catch (e) {
      this.log.warn(`tick failed: ${(e as Error).message}`);
      return 0;
    } finally {
      this.ticking = false;
    }
  }

  /** Claims one specific due run (used right after intake) and executes it. */
  async run(id: string): Promise<void> {
    const claimed = await this.prisma.client.automationExecution.updateMany({
      where: { id, status: { in: ['QUEUED', 'WAITING'] }, resumeAt: { lte: new Date() } },
      data: { status: 'RUNNING', lockedAt: new Date(), startedAt: new Date() },
    });
    if (claimed.count === 1) await this.step(id);
  }

  // ---------- execution ----------

  private async step(id: string): Promise<void> {
    const db = this.prisma.client;
    try {
      const ex = await db.automationExecution.findUniqueOrThrow({
        where: { id },
        include: { automation: true },
      });
      if (ex.automation.status !== 'ACTIVE')
        return void (await this.finish(id, 'CANCELLED', 'Automation was deactivated', ex.steps));
      const ver = await db.automationVersion.findUnique({
        where: { automationId_version: { automationId: ex.automationId, version: ex.version } },
      });
      const parsed = ver && definitionSchema.safeParse(ver.definition);
      if (!parsed?.success)
        throw new PermanentError('The published definition could not be loaded');
      const def: Definition = parsed.data;
      const trig = triggerOf(def.trigger.type);
      if (!trig) throw new PermanentError('The trigger is no longer supported');
      const ctx = ex.context as Context;
      let i = ex.currentStep;
      /** What the database currently holds; conditions advance `i` in memory only. */
      let stored = ex.currentStep;
      let logs = ex.steps as StepLog[];
      while (i < def.steps.length) {
        const s = def.steps[i]!;
        if (s.type === 'condition') {
          if (!evalGate(s, ctx, trig)) {
            logs = [...logs, entry(s, 'skipped', 'Conditions not met, so the run stopped here')];
            return void (await this.finish(id, 'SKIPPED', null, logs, i));
          }
          logs = [...logs, entry(s, 'ok', 'Conditions matched')];
          i++;
          continue;
        }
        if (s.type === 'wait') {
          logs = [...logs, entry(s, 'waiting', `Waiting ${formatMinutes(s.minutes)}`)];
          await db.automationExecution.update({
            where: { id },
            data: {
              status: 'WAITING',
              currentStep: i + 1,
              steps: logs,
              resumeAt: new Date(Date.now() + s.minutes * 60_000),
              lockedAt: null,
            },
          });
          return;
        }
        const message = await this.runAction(
          ex.workspaceId,
          ex.automation.name,
          s,
          ctx,
          trig,
          id,
          stored,
          i,
          logs,
        );
        logs = [...logs, entry(s, 'ok', message)];
        i++;
        stored = i;
      }
      await this.finish(id, 'SUCCEEDED', null, logs, i);
    } catch (e) {
      await this.fail(id, e);
    }
  }

  private async finish(
    id: string,
    status: 'SUCCEEDED' | 'SKIPPED' | 'CANCELLED',
    error: string | null,
    steps: unknown,
    currentStep?: number,
  ) {
    await this.prisma.client.automationExecution.update({
      where: { id },
      data: {
        status,
        error,
        steps: steps as Prisma.InputJsonValue,
        finishedAt: new Date(),
        lockedAt: null,
        resumeAt: null,
        ...(currentStep !== undefined && { currentStep }),
      },
    });
  }

  private async fail(id: string, e: unknown) {
    const db = this.prisma.client;
    const message = e instanceof Error ? e.message : 'Unknown error';
    try {
      const ex = await db.automationExecution.findUnique({ where: { id } });
      if (!ex) return;
      const logs = [
        ...(ex.steps as StepLog[]),
        {
          stepId: 'failure',
          type: 'error',
          status: 'failed',
          message,
          at: new Date().toISOString(),
        },
      ];
      const retry = !(e instanceof PermanentError) && ex.attempts + 1 < MAX_ATTEMPTS;
      await db.automationExecution.update({
        where: { id },
        data: retry
          ? {
              status: 'WAITING',
              attempts: ex.attempts + 1,
              error: `Retrying after: ${message}`,
              steps: logs,
              lockedAt: null,
              resumeAt: new Date(Date.now() + 30_000 * 2 ** ex.attempts),
            }
          : {
              status: 'FAILED',
              attempts: ex.attempts + 1,
              error: message,
              steps: logs,
              lockedAt: null,
              resumeAt: null,
              finishedAt: new Date(),
            },
      });
    } catch (inner) {
      this.log.error(`could not record failure of ${id}: ${(inner as Error).message}`);
    }
  }

  /**
   * Performs one action and advances the progress marker in the same transaction. The marker update is guarded on
   * the step number, so if another worker already did this step the transaction rolls back and nothing repeats.
   */
  private async runAction(
    ws: string,
    automationName: string,
    s: Extract<Step, { type: 'action' }>,
    ctx: Context,
    trig: NonNullable<ReturnType<typeof triggerOf>>,
    executionId: string,
    stored: number,
    index: number,
    logs: StepLog[],
  ): Promise<string> {
    const text = (k: string) => renderTemplate(s.config[k] ?? '', ctx, trig).trim();
    const c = ctx as {
      conversation?: { id: string };
      customer?: { id: string };
      lead?: { id: string };
      order?: { id: string };
    };
    const by = `Automation “${automationName}”`;
    let message = '';
    await this.prisma.client.$transaction(async (tx) => {
      const member = async (userId: string) => {
        const m = await tx.workspaceMembership.findFirst({
          where: { workspaceId: ws, userId, status: 'ACTIVE' },
          select: { user: { select: { name: true } } },
        });
        if (!m)
          throw new PermanentError('The assignee is no longer an active member of this workspace');
        return m.user.name;
      };
      switch (s.action) {
        case 'add_conversation_note': {
          const conv = await tx.conversation.findFirst({
            where: { id: c.conversation?.id, workspaceId: ws },
          });
          if (!conv) throw new PermanentError('The conversation no longer exists');
          const body = text('text');
          if (!body) throw new PermanentError('The note text was empty after filling in variables');
          await tx.message.create({
            data: {
              workspaceId: ws,
              conversationId: conv.id,
              kind: 'NOTE',
              body: `${body}\n— ${by}`,
            },
          });
          message = 'Added an internal note';
          break;
        }
        case 'assign_conversation': {
          const conv = await tx.conversation.findFirst({
            where: { id: c.conversation?.id, workspaceId: ws },
          });
          if (!conv) throw new PermanentError('The conversation no longer exists');
          const name = await member(s.config.userId ?? '');
          await tx.conversation.update({
            where: { id: conv.id },
            data: { assigneeId: s.config.userId },
          });
          await tx.message.create({
            data: {
              workspaceId: ws,
              conversationId: conv.id,
              kind: 'EVENT',
              body: `${by} assigned this to ${name}`,
            },
          });
          message = `Assigned to ${name}`;
          break;
        }
        case 'set_conversation_status': {
          const conv = await tx.conversation.findFirst({
            where: { id: c.conversation?.id, workspaceId: ws },
          });
          if (!conv) throw new PermanentError('The conversation no longer exists');
          const status = s.config.status === 'RESOLVED' ? 'RESOLVED' : 'OPEN';
          if (conv.status === status) {
            message = `Already ${status.toLowerCase()}; nothing to change`;
            break;
          }
          await tx.conversation.update({
            where: { id: conv.id },
            data: {
              status,
              snoozedUntil: null,
              resolvedAt: status === 'RESOLVED' ? new Date() : null,
              ...(status === 'RESOLVED' && { unreadCount: 0, waitingSince: null }),
            },
          });
          await tx.message.create({
            data: {
              workspaceId: ws,
              conversationId: conv.id,
              kind: 'EVENT',
              body: `${by} ${status === 'RESOLVED' ? 'resolved' : 'reopened'} this conversation`,
            },
          });
          message = `Set status to ${status.toLowerCase()}`;
          break;
        }
        case 'add_customer_tag':
        case 'remove_customer_tag': {
          const cust = await tx.customer.findFirst({
            where: { id: c.customer?.id, workspaceId: ws },
          });
          if (!cust) throw new PermanentError('The customer no longer exists');
          const tag = s.config.tag?.trim() ?? '';
          const has = cust.tags.some((t) => t.toLowerCase() === tag.toLowerCase());
          if (s.action === 'add_customer_tag') {
            if (has) message = `Customer already has “${tag}”`;
            else {
              if (cust.tags.length >= 20)
                throw new PermanentError('The customer already has 20 tags');
              await tx.customer.update({
                where: { id: cust.id },
                data: { tags: [...cust.tags, tag] },
              });
              message = `Added tag “${tag}”`;
            }
          } else if (!has) message = `Customer doesn’t have “${tag}”`;
          else {
            await tx.customer.update({
              where: { id: cust.id },
              data: { tags: cust.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase()) },
            });
            message = `Removed tag “${tag}”`;
          }
          break;
        }
        case 'set_lead_stage': {
          const lead = await tx.lead.findFirst({ where: { id: c.lead?.id, workspaceId: ws } });
          if (!lead) throw new PermanentError('The lead no longer exists');
          const stage = s.config.stage as typeof lead.stage;
          if (lead.stage === stage) {
            message = 'Lead is already in that stage';
            break;
          }
          await tx.lead.update({
            where: { id: lead.id },
            data: {
              stage,
              score: computeLeadScore({ ...lead, stage }),
              lastActivityAt: new Date(),
            },
          });
          await tx.leadActivity.create({
            data: {
              workspaceId: ws,
              leadId: lead.id,
              type: 'STAGE_CHANGED',
              body: `${by} moved this lead from ${lead.stage} to ${stage}`,
            },
          });
          message = `Moved lead to ${stage}`;
          break;
        }
        case 'assign_lead_owner': {
          const lead = await tx.lead.findFirst({ where: { id: c.lead?.id, workspaceId: ws } });
          if (!lead) throw new PermanentError('The lead no longer exists');
          const name = await member(s.config.userId ?? '');
          await tx.lead.update({
            where: { id: lead.id },
            data: { ownerId: s.config.userId, lastActivityAt: new Date() },
          });
          await tx.leadActivity.create({
            data: {
              workspaceId: ws,
              leadId: lead.id,
              type: 'OWNER_CHANGED',
              body: `${by} assigned this lead to ${name}`,
            },
          });
          message = `Assigned lead to ${name}`;
          break;
        }
        case 'add_order_note': {
          const order = await tx.order.findFirst({ where: { id: c.order?.id, workspaceId: ws } });
          if (!order) throw new PermanentError('The order no longer exists');
          const body = text('text');
          if (!body) throw new PermanentError('The note text was empty after filling in variables');
          await tx.orderNote.create({
            data: { workspaceId: ws, orderId: order.id, body: `${body}\n— ${by}` },
          });
          await tx.orderEvent.create({
            data: {
              workspaceId: ws,
              orderId: order.id,
              type: 'note',
              description: `${by} added an internal note`,
            },
          });
          message = 'Added an internal note to the order';
          break;
        }
      }
      const guard = await tx.automationExecution.updateMany({
        where: { id: executionId, currentStep: stored, status: 'RUNNING' },
        data: {
          currentStep: index + 1,
          steps: [...logs, entry(s, 'ok', message)] as unknown as Prisma.InputJsonValue,
        },
      });
      if (guard.count !== 1)
        throw new PermanentError('This run was advanced elsewhere; stopping to avoid a repeat');
    });
    return message;
  }
}

export const entry = (s: Step, status: StepLog['status'], message: string): StepLog => ({
  stepId: s.id,
  type: s.type === 'action' ? (actionOf(s.action)?.label ?? s.action) : describeStep(s),
  status,
  message,
  at: new Date().toISOString(),
});
