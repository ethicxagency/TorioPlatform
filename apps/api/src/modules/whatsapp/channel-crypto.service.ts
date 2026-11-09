import { Inject, Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';

/**
 * AES-256-GCM for provider tokens. Format: `v1.<iv>.<tag>.<ciphertext>` (base64url). The key is derived from
 * CHANNEL_ENCRYPTION_KEY; without it nothing can be encrypted, so no token is ever stored in plain text.
 */
@Injectable()
export class ChannelCryptoService {
  private readonly key: Buffer | null;
  /** The key in use before a rotation: blobs sealed with it still decrypt until they are re-encrypted. */
  private readonly previous: Buffer | null;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    const k = (v?: string) => (v ? createHash('sha256').update(v).digest() : null);
    this.key = k(config.CHANNEL_ENCRYPTION_KEY);
    this.previous = k(config.CHANNEL_ENCRYPTION_KEY_PREVIOUS);
  }

  get hasPreviousKey() {
    return this.previous !== null;
  }

  get configured() {
    return this.key !== null;
  }

  encrypt(plain: string): string {
    if (!this.key) throw new Error('CHANNEL_ENCRYPTION_KEY is not configured');
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return ['v1', iv, c.getAuthTag(), data]
      .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
      .join('.');
  }

  private open(blob: string, key: Buffer): string {
    const [v, iv, tag, data] = blob.split('.');
    if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported credential format');
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  }

  decrypt(blob: string): string {
    if (!this.key) throw new Error('CHANNEL_ENCRYPTION_KEY is not configured');
    try {
      return this.open(blob, this.key);
    } catch (e) {
      if (!this.previous) throw e;
      return this.open(blob, this.previous); // sealed before the last rotation
    }
  }

  /** Which key a stored blob is sealed with, without revealing anything about either key. */
  keyOf(blob: string): 'current' | 'previous' | 'unreadable' {
    try {
      if (this.key) {
        this.open(blob, this.key);
        return 'current';
      }
    } catch {
      /* try the previous key */
    }
    try {
      if (this.previous) {
        this.open(blob, this.previous);
        return 'previous';
      }
    } catch {
      /* unreadable */
    }
    return 'unreadable';
  }
}
