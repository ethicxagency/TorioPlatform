import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../../config/config.module';
import { ChannelCryptoService } from './channel-crypto.service';
import { GraphError, verifyMetaSignature } from './whatsapp.api';
import { SERVICE_WINDOW_MS, withinServiceWindow } from './whatsapp.delivery.service';

const crypto = (key?: string) =>
  new ChannelCryptoService({ CHANNEL_ENCRYPTION_KEY: key } as AppConfig);

describe('channel credential encryption', () => {
  it('round-trips and never stores plain text', () => {
    const c = crypto('k'.repeat(40));
    const blob = c.encrypt('EAAG-token');
    expect(blob).not.toContain('EAAG');
    expect(c.decrypt(blob)).toBe('EAAG-token');
    expect(c.encrypt('EAAG-token')).not.toBe(blob); // fresh IV every time
  });
  it('rejects tampering and a different key', () => {
    const blob = crypto('a'.repeat(40)).encrypt('secret');
    expect(() => crypto('b'.repeat(40)).decrypt(blob)).toThrow();
    expect(() => crypto('a'.repeat(40)).decrypt(blob.slice(0, -2) + 'AA')).toThrow();
  });
  it('refuses to work without a key', () => {
    expect(crypto().configured).toBe(false);
    expect(() => crypto().encrypt('x')).toThrow(/not configured/);
  });
});

describe('Meta signature', () => {
  const raw = Buffer.from('{"a":1}');
  const good = `sha256=${createHmac('sha256', 's3cret-value').update(raw).digest('hex')}`;
  it('accepts only the exact HMAC of the raw body', () => {
    expect(verifyMetaSignature(raw, good, 's3cret-value')).toBe(true);
    expect(verifyMetaSignature(Buffer.from('{"a":2}'), good, 's3cret-value')).toBe(false);
    expect(verifyMetaSignature(raw, good, 'other')).toBe(false);
    expect(verifyMetaSignature(raw, undefined, 's3cret-value')).toBe(false);
    expect(verifyMetaSignature(raw, 'sha256=zz', 's3cret-value')).toBe(false);
  });
});

describe('24-hour service window', () => {
  const now = new Date('2026-11-01T12:00:00Z');
  it('is open for 24 hours after the last customer message', () => {
    expect(withinServiceWindow(new Date(now.getTime() - 3600_000), now)).toBe(true);
    expect(withinServiceWindow(new Date(now.getTime() - SERVICE_WINDOW_MS + 1000), now)).toBe(true);
    expect(withinServiceWindow(new Date(now.getTime() - SERVICE_WINDOW_MS), now)).toBe(false);
  });
  it('is closed when the customer never wrote', () => {
    expect(withinServiceWindow(null, now)).toBe(false);
  });
});

describe('Graph errors', () => {
  it('classifies expired tokens and transient failures', () => {
    expect(new GraphError('x', 401, 190).tokenExpired).toBe(true);
    expect(new GraphError('x', 429).transient).toBe(true);
    expect(new GraphError('x', 400, 131056).transient).toBe(true);
    expect(new GraphError('x', 400, 100).transient).toBe(false);
  });
});
