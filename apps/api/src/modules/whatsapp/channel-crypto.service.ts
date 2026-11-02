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

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.key = config.CHANNEL_ENCRYPTION_KEY
      ? createHash('sha256').update(config.CHANNEL_ENCRYPTION_KEY).digest()
      : null;
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

  decrypt(blob: string): string {
    if (!this.key) throw new Error('CHANNEL_ENCRYPTION_KEY is not configured');
    const [v, iv, tag, data] = blob.split('.');
    if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unsupported credential format');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
  }
}
