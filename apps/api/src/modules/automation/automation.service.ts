import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@torio/database';
import {
  actionOf,
  definitionSchema,
  describeStep,
  emptyDefinition,
  evalGate,
  renderTemplate,
  TEMPLATES,
  triggerOf,
  validateDefinition,
  formatMinutes,
  type AutomationQuery,
  type Context,
  type CreateAutomationInput,
  type Definition,
  type ExecutionQuery,
  type Issue,
  type UpdateAutomationInput,
} from '@torio/contracts';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';
import { entry, type StepLog } from './automation.engine';

const DAY = 86_400_000;
const PERIOD_DAYS = 30;
const iso = (d: Date | null) => d?.toISOString() ?? null;
const page = (total: number, p: number, size: number) => ({
  page: p,
  pageSize: size,
  total,
  totalPages: Math.max(1, Math.ceil(total / size)),
});

/** Every query is scoped by workspaceId. Definitions are validated here, on the server, whatever the client sent. */
@Injectable()
export class AutomationService {
  constructor(private readonly prisma: PrismaService) {}

  private async issuesOf(ws: string, def: Definition): Promise<Issue[]> {
    const members = await this.prisma.client.workspaceMembership.findMany({
      where: { workspaceId: ws, status: 'ACTIVE' },
      select: { userId: true },
    });
    const set = new Set(members.map((m) => m.userId));
    return validateDefinition(def, { isMember: (id) => set.has(id) });
  }

  private parse(json: unknown): Definition {
    const r = definitionSchema.safeParse(json);
    if (!r.success) throw new BadRequestException('The stored definition is invalid');
    return r.data;
  }

  private async stats(ws: string, ids: string[]) {
    if (!ids.length) return new Map<string, { runs: number; failed: number; last: Date | null }>();
    const since = new Date(Date.now() - PERIOD_DAYS * DAY);
    const [runs, failed, last] = await Promise.all([
      this.prisma.client.automationExecution.groupBy({
        by: ['automationId'],
        where: {
          workspaceId: ws,
          automationId: { in: ids },
          isTest: false,
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }),
      this.prisma.client.automationExecution.groupBy({
        by: ['automationId'],
        where: {
          workspaceId: ws,
          automationId: { in: ids },
          isTest: false,
          status: 'FAILED',
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }),
      this.prisma.client.automationExecution.groupBy({
        by: ['automationId'],
        where: { workspaceId: ws, automationId: { in: ids }, isTest: false },
        _max: { createdAt: true },
      }),
    ]);
    return new Map(
      ids.map((id) => [
        id,
        {
          runs: runs.find((r) => r.automationId === id)?._count._all ?? 0,
          failed: failed.find((r) => r.automationId === id)?._count._all ?? 0,
          last: last.find((r) => r.automationId === id)?._max.createdAt ?? null,
        },
      ]),
    );
  }

  private dto(
    a: Prisma.AutomationGetPayload<{
      include: { createdBy: { select: { id: true; name: true } } };
    }>,
    st: { runs: number; failed: number; last: Date | null } | undefined,
  ) {
    const def = definitionSchema.safeParse(a.draft);
    return {
      id: a.id,
      name: a.name,
      description: a.description,
      status: a.status,
      triggerType: a.triggerType,
      stepCount: def.success ? def.data.steps.length : 0,
      hasUnpublishedChanges: a.status !== 'DRAFT' && a.publishedRevision !== a.draftRevision,
      publishedVersion: a.publishedVersion ?? 0,
      runs: st?.runs ?? 0,
      failed: st?.failed ?? 0,
      lastRunAt: iso(st?.last ?? null),
      createdBy: a.createdBy,
      updatedAt: a.updatedAt.toISOString(),
      createdAt: a.createdAt.toISOString(),
    };
  }
  private readonly include = { createdBy: { select: { id: true, name: true } } } as const;

  async list(ws: string, q: AutomationQuery) {
    const where: Prisma.AutomationWhereInput = {
      workspaceId: ws,
      ...(q.q && { name: { contains: q.q, mode: 'insensitive' } }),
      ...(q.status?.length && { status: { in: q.status as never } }),
      ...(q.trigger && { triggerType: q.trigger }),
    };
    const total = await this.prisma.client.automation.count({ where });
    const byLast = q.sort === 'lastRun';
    const rows = await this.prisma.client.automation.findMany({
      where,
      include: this.include,
      orderBy: q.sort === 'name' ? { name: q.dir } : { updatedAt: q.dir },
      ...(byLast ? { take: 500 as number } : { skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    });
    const st = await this.stats(
      ws,
      rows.map((r) => r.id),
    );
    let data = rows.map((r) => this.dto(r, st.get(r.id)));
    if (byLast) {
      data.sort(
        (a, b) => ((a.lastRunAt ?? '') < (b.lastRunAt ?? '') ? -1 : 1) * (q.dir === 'asc' ? 1 : -1),
      );
      data = data.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    }
    return { data, meta: page(total, q.page, q.pageSize) };
  }

  async summary(ws: string) {
    const db = this.prisma.client;
    const since = new Date(Date.now() - PERIOD_DAYS * DAY);
    const [byStatus, runs] = await Promise.all([
      db.automation.groupBy({ by: ['status'], where: { workspaceId: ws }, _count: { _all: true } }),
      db.automationExecution.groupBy({
        by: ['status'],
        where: { workspaceId: ws, isTest: false, createdAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const n = (s: string) => byStatus.find((x) => x.status === s)?._count._all ?? 0;
    const r = (s: string) => runs.find((x) => x.status === s)?._count._all ?? 0;
    return {
      total: byStatus.reduce((a, x) => a + x._count._all, 0),
      active: n('ACTIVE'),
      draft: n('DRAFT'),
      inactive: n('INACTIVE'),
      periodDays: PERIOD_DAYS,
      runs: runs.reduce((a, x) => a + x._count._all, 0),
      succeeded: r('SUCCEEDED'),
      failed: r('FAILED'),
    };
  }

  private async mustFind(ws: string, id: string) {
    const a = await this.prisma.client.automation.findFirst({
      where: { id, workspaceId: ws },
      include: this.include,
    });
    if (!a) throw new NotFoundException('Automation not found');
    return a;
  }

  async get(ws: string, id: string) {
    const a = await this.mustFind(ws, id);
    const def = this.parse(a.draft);
    const st = await this.stats(ws, [id]);
    return {
      ...this.dto(a, st.get(id)),
      definition: def,
      draftRevision: a.draftRevision,
      issues: await this.issuesOf(ws, def),
    };
  }

  async create(ws: string, actorId: string, input: CreateAutomationInput) {
    let definition: Definition;
    if (input.templateKey) {
      const t = TEMPLATES.find((x) => x.key === input.templateKey);
      if (!t) throw new BadRequestException('Unknown template');
      definition = structuredClone(t.definition);
    } else {
      if (!input.trigger || !triggerOf(input.trigger))
        throw new BadRequestException('Choose a trigger that Torio supports');
      definition = emptyDefinition(input.trigger);
    }
    const a = await this.prisma.client.$transaction(async (tx) => {
      const row = await tx.automation.create({
        data: {
          workspaceId: ws,
          name: input.name,
          description: input.description,
          triggerType: definition.trigger.type,
          draft: definition as unknown as Prisma.InputJsonValue,
          createdById: actorId,
        },
      });
      await this.audit(
        tx,
        ws,
        actorId,
        'automation.create',
        row.id,
        `Automation “${row.name}” created as a draft`,
      );
      return row;
    });
    return this.get(ws, a.id);
  }

  async update(ws: string, actorId: string, id: string, input: UpdateAutomationInput) {
    const cur = await this.mustFind(ws, id);
    if (
      input.definition &&
      input.baseRevision !== undefined &&
      input.baseRevision !== cur.draftRevision
    )
      throw new ConflictException(
        'This automation was changed elsewhere. Reload to see the latest version.',
      );
    if (input.definition && !triggerOf(input.definition.trigger.type))
      throw new BadRequestException('Choose a trigger that Torio supports');
    await this.prisma.client.automation.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.definition && {
          draft: input.definition as unknown as Prisma.InputJsonValue,
          triggerType: input.definition.trigger.type,
          draftRevision: { increment: 1 },
        }),
      },
    });
    if (input.name !== undefined && input.name !== cur.name)
      await this.prisma.client.auditLog.create({
        data: {
          workspaceId: ws,
          actorId,
          action: 'automation.rename',
          entityType: 'automation',
          entityId: id,
          metadata: { description: `Automation renamed to “${input.name}”` },
        },
      });
    return this.get(ws, id);
  }

  async validate(ws: string, id: string) {
    const a = await this.mustFind(ws, id);
    const issues = await this.issuesOf(ws, this.parse(a.draft));
    return { ok: issues.length === 0, issues };
  }

  /** Validates the whole draft, snapshots it as an immutable version and makes it live. Also used to publish edits. */
  async publish(ws: string, actorId: string, id: string) {
    const a = await this.mustFind(ws, id);
    const def = this.parse(a.draft);
    const issues = await this.issuesOf(ws, def);
    if (issues.length)
      throw new BadRequestException(
        `Fix ${issues.length} problem${issues.length === 1 ? '' : 's'} before activating: ${issues[0]!.message}`,
      );
    await this.prisma.client.$transaction(async (tx) => {
      const version = (a.publishedVersion ?? 0) + 1;
      await tx.automationVersion.create({
        data: {
          workspaceId: ws,
          automationId: id,
          version,
          definition: def as unknown as Prisma.InputJsonValue,
          publishedById: actorId,
        },
      });
      await tx.automation.update({
        where: { id },
        data: {
          status: 'ACTIVE',
          publishedVersion: version,
          publishedRevision: a.draftRevision,
          activatedAt: new Date(),
        },
      });
      await this.audit(
        tx,
        ws,
        actorId,
        a.status === 'ACTIVE' ? 'automation.publish' : 'automation.activate',
        id,
        `Automation “${a.name}” ${a.status === 'ACTIVE' ? 'published as' : 'activated at'} version ${version}`,
      );
    });
    return this.get(ws, id);
  }

  /** Stops new runs. Waiting and queued runs are cancelled; a step already executing finishes. History is kept. */
  async deactivate(ws: string, actorId: string, id: string) {
    const a = await this.mustFind(ws, id);
    if (a.status !== 'ACTIVE') throw new ConflictException('This automation isn’t active');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.automation.update({ where: { id }, data: { status: 'INACTIVE' } });
      await tx.automationExecution.updateMany({
        where: { automationId: id, status: { in: ['QUEUED', 'WAITING'] } },
        data: {
          status: 'CANCELLED',
          error: 'Automation was deactivated',
          finishedAt: new Date(),
          resumeAt: null,
        },
      });
      await this.audit(
        tx,
        ws,
        actorId,
        'automation.deactivate',
        id,
        `Automation “${a.name}” deactivated`,
      );
    });
    return this.get(ws, id);
  }

  async remove(ws: string, actorId: string, id: string) {
    const a = await this.mustFind(ws, id);
    if (a.status === 'ACTIVE')
      throw new ConflictException('Deactivate this automation before deleting it');
    await this.prisma.client.$transaction(async (tx) => {
      await tx.automation.delete({ where: { id } });
      await this.audit(
        tx,
        ws,
        actorId,
        'automation.delete',
        id,
        `Automation “${a.name}” and its run history were deleted`,
      );
    });
  }

  async duplicate(ws: string, actorId: string, id: string) {
    const a = await this.mustFind(ws, id);
    const copy = await this.prisma.client.automation.create({
      data: {
        workspaceId: ws,
        name: `Copy of ${a.name}`.slice(0, 120),
        description: a.description,
        triggerType: a.triggerType,
        draft: a.draft as Prisma.InputJsonValue,
        createdById: actorId,
      },
    });
    return this.get(ws, copy.id);
  }

  private audit(
    tx: Prisma.TransactionClient,
    ws: string,
    actorId: string,
    action: string,
    id: string,
    description: string,
  ) {
    return tx.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action,
        entityType: 'automation',
        entityId: id,
        metadata: { description },
      },
    });
  }

  // ---------- test (dry run: nothing is read from or written to real records) ----------

  async test(ws: string, actorId: string, id: string, sample: Record<string, unknown>) {
    const a = await this.mustFind(ws, id);
    const def = this.parse(a.draft);
    const trig = triggerOf(def.trigger.type);
    const issues = await this.issuesOf(ws, def);
    if (!trig) throw new BadRequestException('Choose a trigger that Torio supports');
    const ctx: Context = {};
    for (const [k, v] of Object.entries(sample)) {
      const f = trig.fields.find((x) => x.key === k);
      if (!f) continue;
      const parts = k.split('.');
      let o = ctx as Record<string, unknown>;
      for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
      o[parts.at(-1)!] =
        f.kind === 'number' ? Number(v) : f.kind === 'flag' ? v === true || v === 'true' : v;
    }
    const logs: StepLog[] = [];
    let status: 'SUCCEEDED' | 'SKIPPED' | 'FAILED' = 'SUCCEEDED';
    let error: string | null = null;
    if (issues.length) {
      status = 'FAILED';
      error = `Not runnable yet: ${issues[0]!.message}`;
    } else {
      for (const s of def.steps) {
        if (s.type === 'condition') {
          const ok = evalGate(s, ctx, trig);
          logs.push(
            entry(
              s,
              ok ? 'simulated' : 'skipped',
              ok
                ? 'Conditions matched with the sample data'
                : 'Conditions not met, so the run would stop here',
            ),
          );
          if (!ok) {
            status = 'SKIPPED';
            break;
          }
        } else if (s.type === 'wait') {
          logs.push(
            entry(s, 'simulated', `Would wait ${formatMinutes(s.minutes)} (skipped in a test)`),
          );
        } else {
          const text = s.config.text ? ` “${renderTemplate(s.config.text, ctx, trig)}”` : '';
          logs.push(
            entry(
              s,
              'simulated',
              `Would: ${actionOf(s.action)?.label ?? s.action}${text}. Nothing was changed.`,
            ),
          );
        }
      }
    }
    const ex = await this.prisma.client.automationExecution.create({
      data: {
        workspaceId: ws,
        automationId: id,
        version: a.draftRevision,
        isTest: true,
        status,
        triggerType: trig.type,
        eventKey: `test:${randomUUID()}`,
        entityType: 'test',
        entityId: actorId,
        context: ctx as Prisma.InputJsonValue,
        steps: logs as unknown as Prisma.InputJsonValue,
        currentStep: logs.length,
        error,
        startedAt: new Date(),
        finishedAt: new Date(),
      },
    });
    return { execution: await this.executionDetail(ws, ex.id), issues };
  }

  // ---------- executions ----------

  private async planFor(
    ws: string,
    rows: { automationId: string; version: number; isTest: boolean }[],
  ) {
    const keys = [
      ...new Set(rows.filter((r) => !r.isTest).map((r) => `${r.automationId}:${r.version}`)),
    ];
    const vs = keys.length
      ? await this.prisma.client.automationVersion.findMany({
          where: {
            workspaceId: ws,
            OR: keys.map((k) => ({
              automationId: k.split(':')[0]!,
              version: Number(k.split(':')[1]),
            })),
          },
        })
      : [];
    return new Map(
      vs.map((v) => [`${v.automationId}:${v.version}`, this.parse(v.definition).steps]),
    );
  }

  private execDto(
    e: Prisma.AutomationExecutionGetPayload<{
      include: { automation: { select: { name: true } } };
    }>,
    plan: Step[] | undefined,
  ) {
    const logs = e.steps as StepLog[];
    return {
      id: e.id,
      automationId: e.automationId,
      automationName: e.automation.name,
      version: e.version,
      isTest: e.isTest,
      status: e.status,
      triggerType: e.triggerType,
      entityType: e.entityType,
      stepCount: plan?.length ?? logs.length,
      completedSteps: e.currentStep,
      attempts: e.attempts,
      error: e.error,
      startedAt: iso(e.startedAt),
      finishedAt: iso(e.finishedAt),
      durationMs: e.startedAt && e.finishedAt ? e.finishedAt.getTime() - e.startedAt.getTime() : -1,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async executions(ws: string, q: ExecutionQuery) {
    const where: Prisma.AutomationExecutionWhereInput = {
      workspaceId: ws,
      ...(q.automationId && { automationId: q.automationId }),
      ...(q.status?.length && { status: { in: q.status as never } }),
      ...(q.includeTests !== 'true' && { isTest: false }),
      ...(q.from && { createdAt: { gte: new Date(q.from) } }),
    };
    const [total, rows] = await Promise.all([
      this.prisma.client.automationExecution.count({ where }),
      this.prisma.client.automationExecution.findMany({
        where,
        include: { automation: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    const plans = await this.planFor(ws, rows);
    return {
      data: rows.map((r) => this.execDto(r, plans.get(`${r.automationId}:${r.version}`))),
      meta: page(total, q.page, q.pageSize),
    };
  }

  async executionDetail(ws: string, id: string) {
    const e = await this.prisma.client.automationExecution.findFirst({
      where: { id, workspaceId: ws },
      include: { automation: { select: { name: true } } },
    });
    if (!e) throw new NotFoundException('Run not found');
    const plans = await this.planFor(ws, [e]);
    const plan = plans.get(`${e.automationId}:${e.version}`);
    return {
      ...this.execDto(e, plan),
      context: e.context as Record<string, unknown>,
      steps: e.steps as StepLog[],
      plannedSteps: (plan ?? []).map((s) => ({ id: s.id, summary: describeStep(s) })),
    };
  }

  /** Re-queues a failed run from the step that failed. Completed steps are not repeated. */
  async retry(ws: string, actorId: string, id: string) {
    const e = await this.prisma.client.automationExecution.findFirst({
      where: { id, workspaceId: ws },
    });
    if (!e) throw new NotFoundException('Run not found');
    if (e.isTest || e.status !== 'FAILED')
      throw new ConflictException('Only failed runs can be retried');
    const a = await this.mustFind(ws, e.automationId);
    if (a.status !== 'ACTIVE')
      throw new ConflictException('Activate the automation before retrying its runs');
    const r = await this.prisma.client.automationExecution.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'QUEUED', attempts: 0, error: null, finishedAt: null, resumeAt: new Date() },
    });
    if (r.count !== 1) throw new ConflictException('This run was already retried');
    await this.prisma.client.auditLog.create({
      data: {
        workspaceId: ws,
        actorId,
        action: 'automation.retry',
        entityType: 'automation',
        entityId: e.automationId,
        metadata: { description: `Run ${id.slice(0, 8)} of “${a.name}” was retried` },
      },
    });
    return this.executionDetail(ws, id);
  }
}

type Step = Definition['steps'][number];
