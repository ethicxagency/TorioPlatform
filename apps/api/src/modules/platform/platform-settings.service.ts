import { Global, Injectable, Module } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

export interface Branding {
  productName: string;
  legalName: string;
  supportEmail: string;
  invoiceNote: string;
}
export const DEFAULT_BRANDING: Branding = {
  productName: 'Torio',
  legalName: '',
  supportEmail: '',
  invoiceNote: 'Legal entity and tax registration details are not configured yet.',
};

/** Small key/value store for platform-wide, non-secret settings. Secrets live in environment variables only. */
@Injectable()
export class PlatformSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async read<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.client.platformSetting.findUnique({ where: { key } });
    return row ? ({ ...fallback, ...(row.value as object) } as T) : fallback;
  }
  private async write(key: string, value: object) {
    await this.prisma.client.platformSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }

  branding() {
    return this.read<Branding>('branding', DEFAULT_BRANDING);
  }
  setBranding(v: Branding) {
    return this.write('branding', v);
  }
  /** Whether new customers may register. Defaults to open. */
  async registrationOpen() {
    return (await this.read('registration', { open: true })).open;
  }
  setRegistrationOpen(open: boolean) {
    return this.write('registration', { open });
  }
}

@Global()
@Module({ providers: [PlatformSettingsService], exports: [PlatformSettingsService] })
export class PlatformModule {}
