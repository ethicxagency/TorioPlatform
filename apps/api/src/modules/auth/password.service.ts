import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// Argon2id (algorithm id 2). Library defaults (m=19 MiB, t=2, p=1) meet the OWASP minimum.
const ARGON2ID = 2;

@Injectable()
export class PasswordService {
  /** Hash used to equalise timing when the account does not exist. */
  private dummyHash: Promise<string> | undefined;

  hash(password: string): Promise<string> {
    return hash(password, { algorithm: ARGON2ID });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }

  async verifyDummy(password: string): Promise<void> {
    this.dummyHash ??= this.hash('timing-equaliser-not-a-real-password');
    await this.verify(await this.dummyHash, password);
  }
}
