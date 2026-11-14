import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  INTEGRATION_KEYS,
  type IntegrationKey,
  type IntegrationSaveInput,
  type IntegrationStatus,
} from '@torio/contracts';
import { APP_CONFIG, type AppConfig } from '../../../config/config.module';
import { PrismaService } from '../../../database/prisma.service';
import { MailService } from '../../auth/mail.service';
import { ChannelCryptoService } from '../../whatsapp/channel-crypto.service';
import { AdminAudit } from '../admin-audit.service';
import type { AdminContext } from '../admin-auth';
import { INTEGRATIONS } from './definitions';
import {
  fingerprintOf,
  loadStored,
  problemsOf,
  settingKey,
  statusOf,
  type Stored,
  type Val,
} from './state';
import {
  checkMailgun,
  checkMetaPixel,
  checkSslcommerz,
  sendMetaTestEvent,
  type Fetch,
} from './provider-checks';

const KEY = settingKey;

/**
 * Platform integration settings for Super Admin: one record per integration with plain settings, encrypted secrets and the
 * result of its last real test. "Verified" always means the provider accepted exactly the configuration that is saved now;
 * changing a setting or secret that affects the connection drops it back to unverified and switches the integration off.
 */
@Injectable()
export class IntegrationsService {
  /** Replaceable in tests. */
  fetch: Fetch = (...a) => fetch(...a);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: ChannelCryptoService,
    private readonly audit: AdminAudit,
    private readonly mail: MailService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  get encryptionReady() {
    return this.crypto.configured;
  }

  private def(key: string) {
    const d = INTEGRATIONS[key as IntegrationKey];
    if (!d || !INTEGRATION_KEYS.includes(key as IntegrationKey))
      throw new NotFoundException('Unknown integration');
    return d;
  }

  private load(key: IntegrationKey): Promise<Stored> {
    return loadStored(this.prisma, key);
  }

  private async store(key: IntegrationKey, s: Stored) {
    const value = JSON.parse(JSON.stringify(s));
    await this.prisma.client.platformSetting.upsert({
      where: { key: KEY(key) },
      create: { key: KEY(key), value },
      update: { value },
    });
  }

  private fingerprint(key: IntegrationKey, s: Stored) {
    return fingerprintOf(key, s);
  }

  private problems(key: IntegrationKey, s: Stored): string[] {
    return problemsOf(key, s);
  }

  private statusOf(key: IntegrationKey, s: Stored): IntegrationStatus {
    return statusOf(key, s);
  }

  async list() {
    const data = await Promise.all(
      INTEGRATION_KEYS.map(async (k) => {
        const s = await this.load(k);
        const d = INTEGRATIONS[k];
        return {
          key: k,
          name: d.name,
          category: d.category,
          description: d.description,
          enabled: s.enabled && this.statusOf(k, s) === 'VERIFIED',
          status: this.statusOf(k, s),
          lastTestedAt: s.lastTestedAt ?? null,
          lastSuccessAt: s.lastSuccessAt ?? null,
        };
      }),
    );
    return { encryptionReady: this.encryptionReady, data };
  }

  private apiBase() {
    return (this.config.API_URL ?? this.config.WEB_URL).replace(/\/$/, '');
  }

  private readOnly(key: IntegrationKey) {
    const b = this.apiBase();
    const later = 'Not active yet: this address starts working with the next integration phase.';
    if (key === 'mailgun')
      return [{ label: 'Webhook URL', value: `${b}/api/v1/webhooks/mailgun`, hint: later }];
    if (key === 'sslcommerz')
      return [
        { label: 'Success URL', value: `${b}/api/v1/payments/sslcommerz/success`, hint: later },
        { label: 'Fail URL', value: `${b}/api/v1/payments/sslcommerz/fail`, hint: later },
        { label: 'Cancel URL', value: `${b}/api/v1/payments/sslcommerz/cancel`, hint: later },
        { label: 'IPN URL', value: `${b}/api/v1/payments/sslcommerz/ipn`, hint: later },
      ];
    return [];
  }

  async view(keyIn: string) {
    const d = this.def(keyIn);
    const s = await this.load(d.key);
    const status = this.statusOf(d.key, s);
    const problems = this.problems(d.key, s);
    return {
      key: d.key,
      name: d.name,
      category: d.category,
      description: d.description,
      enabled: s.enabled && status === 'VERIFIED',
      status,
      lastTestedAt: s.lastTestedAt ?? null,
      lastSuccessAt: s.lastSuccessAt ?? null,
      encryptionReady: this.encryptionReady,
      requirements: d.requirements,
      fields: d.fields.map((f) => ({
        key: f.key,
        label: f.label,
        kind: f.kind,
        required: f.required,
        hint: f.hint ?? null,
        placeholder: f.placeholder ?? null,
        options: f.options ?? null,
      })),
      values: Object.fromEntries(
        d.fields.map((f) => [f.key, (s.values[f.key] ?? f.default ?? null) as Val]),
      ),
      secrets: d.secrets.map((x) => ({
        key: x.key,
        label: x.label,
        required: x.required,
        set: !!s.secrets[x.key],
        hint: x.hint ?? null,
      })),
      readOnly: this.readOnly(d.key),
      lastError: status === 'FAILED' ? (s.verification?.error ?? null) : null,
      problems,
      canTest: problems.length === 0 && this.encryptionReady,
      canEnable: status === 'VERIFIED',
      updatedAt: s.updatedAt ?? null,
      extra: s.extra ?? {},
    };
  }

  /** Drops "verified" and switches the integration off when something it was tested with has changed. */
  private settle(key: IntegrationKey, before: Stored, after: Stored): string | null {
    if (this.fingerprint(key, before) === this.fingerprint(key, after)) return null;
    if (!after.enabled) return null;
    after.enabled = false;
    return 'integration.disabled_by_change';
  }

  async save(admin: AdminContext, keyIn: string, input: IntegrationSaveInput, ip?: string) {
    const d = this.def(keyIn);
    const s = await this.load(d.key);
    const before = structuredClone(s);
    const changed: string[] = [];
    for (const [k, raw] of Object.entries(input.values)) {
      const f = d.fields.find((x) => x.key === k);
      if (!f) throw new BadRequestException(`Unknown setting: ${k}`);
      let v: Val = typeof raw === 'string' ? raw.trim() : raw;
      if (v === '' || v === undefined) v = null;
      if (f.kind === 'boolean') v = v === true;
      else if (v !== null) {
        if (typeof v !== 'string') throw new BadRequestException(`${f.label} must be text`);
        if (f.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
          throw new BadRequestException(`${f.label} must be an email address`);
        if (f.kind === 'select' && !f.options?.some((o) => o.value === v))
          throw new BadRequestException(`${f.label} has an unsupported value`);
        if (f.pattern && !f.pattern.test(v))
          throw new BadRequestException(f.patternMessage ?? `${f.label} is not valid`);
        if (v.length > 200) throw new BadRequestException(`${f.label} is too long`);
      }
      if (f.required && v === null && !f.default)
        throw new BadRequestException(`${f.label} is required`);
      if ((s.values[k] ?? null) !== v) {
        s.values[k] = v;
        changed.push(k);
      }
    }
    // Live payments are never switched on by accident.
    if (
      d.key === 'sslcommerz' &&
      s.values.environment === 'live' &&
      (before.values.environment ?? 'sandbox') !== 'live' &&
      !input.confirmLive
    )
      throw new BadRequestException(
        'Switching to Live processes real payments. Confirm it explicitly to continue.',
      );
    if (
      d.key === 'mailgun' &&
      typeof s.values.fromEmail === 'string' &&
      typeof s.values.domain === 'string' &&
      !s.values.fromEmail.toLowerCase().endsWith(`@${s.values.domain.toLowerCase()}`) &&
      !s.values.fromEmail.toLowerCase().endsWith(`.${s.values.domain.toLowerCase()}`)
    )
      throw new BadRequestException('From email must belong to the sending domain');
    const off = this.settle(d.key, before, s);
    s.updatedAt = new Date().toISOString();
    await this.store(d.key, s);
    if (changed.length)
      await this.audit.log({
        admin,
        action: 'integration.config_saved',
        targetType: 'integration',
        targetId: d.key,
        targetLabel: d.name,
        metadata: {
          fields: changed,
          ...(changed.includes('environment') ? { environment: s.values.environment } : {}),
          ...(off ? { disabled: true } : {}),
        },
        ip,
      });
    if (
      d.key === 'sslcommerz' &&
      changed.includes('environment') &&
      s.values.environment === 'live'
    )
      await this.audit.log({
        admin,
        action: 'integration.live_confirmed',
        targetType: 'integration',
        targetId: d.key,
        targetLabel: d.name,
        ip,
      });
    return this.view(d.key);
  }

  async setSecret(admin: AdminContext, keyIn: string, name: string, value: string, ip?: string) {
    const d = this.def(keyIn);
    if (!d.secrets.some((x) => x.key === name)) throw new NotFoundException('Unknown secret');
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'Secrets cannot be stored: CHANNEL_ENCRYPTION_KEY is not configured on the server.',
      );
    const s = await this.load(d.key);
    const before = structuredClone(s);
    s.secrets[name] = this.crypto.encrypt(value);
    s.secretVersions[name] = (s.secretVersions[name] ?? 0) + 1;
    this.settle(d.key, before, s);
    s.updatedAt = new Date().toISOString();
    await this.store(d.key, s);
    await this.audit.log({
      admin,
      action: before.secrets[name] ? 'integration.secret_replaced' : 'integration.secret_set',
      targetType: 'integration',
      targetId: d.key,
      targetLabel: `${d.name}: ${name}`,
      ip,
    });
    return this.view(d.key);
  }

  async clearSecret(admin: AdminContext, keyIn: string, name: string, ip?: string) {
    const d = this.def(keyIn);
    if (!d.secrets.some((x) => x.key === name)) throw new NotFoundException('Unknown secret');
    const s = await this.load(d.key);
    const before = structuredClone(s);
    delete s.secrets[name];
    s.secretVersions[name] = (s.secretVersions[name] ?? 0) + 1;
    this.settle(d.key, before, s);
    s.updatedAt = new Date().toISOString();
    await this.store(d.key, s);
    await this.audit.log({
      admin,
      action: 'integration.secret_removed',
      targetType: 'integration',
      targetId: d.key,
      targetLabel: `${d.name}: ${name}`,
      ip,
    });
    return this.view(d.key);
  }

  async setEnabled(admin: AdminContext, keyIn: string, enabled: boolean, ip?: string) {
    const d = this.def(keyIn);
    const s = await this.load(d.key);
    if (enabled && this.statusOf(d.key, s) !== 'VERIFIED')
      throw new BadRequestException(
        'Test the connection successfully before enabling this integration.',
      );
    if (s.enabled !== enabled) {
      s.enabled = enabled;
      s.updatedAt = new Date().toISOString();
      await this.store(d.key, s);
      await this.audit.log({
        admin,
        action: enabled ? 'integration.enabled' : 'integration.disabled',
        targetType: 'integration',
        targetId: d.key,
        targetLabel: d.name,
        ip,
      });
    }
    return this.view(d.key);
  }

  private secretOf(s: Stored, name: string): string {
    const c = s.secrets[name];
    if (!c) throw new BadRequestException('A required secret is missing');
    return this.crypto.decrypt(c);
  }

  async test(admin: AdminContext, keyIn: string, ip?: string) {
    const d = this.def(keyIn);
    const s = await this.load(d.key);
    const problems = this.problems(d.key, s);
    if (problems.length) throw new BadRequestException(problems[0]);
    if (!this.crypto.configured)
      throw new ServiceUnavailableException(
        'CHANNEL_ENCRYPTION_KEY is not configured on the server.',
      );
    const v = Object.fromEntries(
      d.fields.map((f) => [f.key, s.values[f.key] ?? f.default ?? null]),
    );
    const b = this.apiBase();
    const r =
      d.key === 'mailgun'
        ? await checkMailgun(this.fetch, v, this.secretOf(s, 'apiKey'))
        : d.key === 'torio_meta_pixel'
          ? await checkMetaPixel(
              this.fetch,
              this.config.META_GRAPH_VERSION,
              v,
              this.secretOf(s, 'accessToken'),
            )
          : await checkSslcommerz(this.fetch, v, this.secretOf(s, 'storePassword'), {
              success: `${b}/api/v1/payments/sslcommerz/success`,
              fail: `${b}/api/v1/payments/sslcommerz/fail`,
              cancel: `${b}/api/v1/payments/sslcommerz/cancel`,
              ipn: `${b}/api/v1/payments/sslcommerz/ipn`,
            });
    const now = new Date().toISOString();
    s.lastTestedAt = now;
    s.verification = {
      status: r.ok ? 'VERIFIED' : 'FAILED',
      at: now,
      fingerprint: this.fingerprint(d.key, s),
      error: r.ok ? null : r.message,
    };
    if (r.ok) s.lastSuccessAt = now;
    else s.enabled = false;
    await this.store(d.key, s);
    await this.audit.log({
      admin,
      action: r.ok ? 'integration.test_passed' : 'integration.test_failed',
      targetType: 'integration',
      targetId: d.key,
      targetLabel: d.name,
      ip,
    });
    return {
      ok: r.ok,
      status: s.verification.status as IntegrationStatus,
      message: r.message,
      checks: r.checks,
    };
  }

  async sendTestEmail(admin: AdminContext, to: string, ip?: string) {
    const s = await this.load('mailgun');
    if (this.statusOf('mailgun', s) !== 'VERIFIED')
      throw new BadRequestException('Test the Mailgun connection successfully first.');
    // Goes through the same sender (and delivery log) as every other email, so delivery shows up when Mailgun reports it.
    const accepted = await this.mail.sendTemplate('test', to, {}, { force: 'mailgun' });
    s.extra = {
      ...s.extra,
      lastTestEmailAt: new Date().toISOString(),
      lastTestEmailAccepted: accepted,
    };
    await this.store('mailgun', s);
    await this.audit.log({
      admin,
      action: 'integration.test_email',
      targetType: 'integration',
      targetId: 'mailgun',
      targetLabel: 'Mailgun',
      metadata: { accepted },
      ip,
    });
    return {
      ok: accepted,
      status: this.statusOf('mailgun', s),
      message: accepted
        ? 'Mailgun accepted the message for delivery. Whether it arrived is confirmed by Mailgun’s delivery events (see Recent emails), not by this request.'
        : 'Mailgun refused the message or could not be reached.',
      checks: [{ label: 'Accepted by Mailgun', ok: accepted, detail: null }],
    };
  }

  async sendTestEvent(admin: AdminContext, ip?: string) {
    const s = await this.load('torio_meta_pixel');
    if (this.statusOf('torio_meta_pixel', s) !== 'VERIFIED')
      throw new BadRequestException('Test the Pixel connection successfully first.');
    if (!s.values.testEventCode)
      throw new BadRequestException(
        'Add a test event code from Events Manager first, so the event is kept out of your real data.',
      );
    const v = Object.fromEntries(
      INTEGRATIONS.torio_meta_pixel.fields.map((f) => [
        f.key,
        s.values[f.key] ?? f.default ?? null,
      ]),
    );
    const r = await sendMetaTestEvent(
      this.fetch,
      this.config.META_GRAPH_VERSION,
      v,
      this.secretOf(s, 'accessToken'),
      this.config.WEB_URL,
    );
    s.extra = {
      ...s.extra,
      lastTestEventAt: new Date().toISOString(),
      lastTestEventOk: r.ok,
      lastTestEventId: r.eventId,
    };
    await this.store('torio_meta_pixel', s);
    await this.audit.log({
      admin,
      action: 'integration.test_event',
      targetType: 'integration',
      targetId: 'torio_meta_pixel',
      targetLabel: 'Torio Meta Pixel',
      metadata: { ok: r.ok },
      ip,
    });
    return {
      ok: r.ok,
      status: this.statusOf('torio_meta_pixel', s),
      message: r.message,
      checks: [{ label: 'Event received by Meta', ok: r.ok, detail: r.eventId }],
    };
  }
}
