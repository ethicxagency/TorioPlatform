import { Global, Module } from '@nestjs/common';
import { AdminAudit } from '../admin/admin-audit.service';
import { MetaGraphProvider } from '../meta/meta.graph-provider';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { WhatsAppGraphProvider } from '../whatsapp/whatsapp.graph-provider';
import { MetaDiagnosticsService } from './meta-config.diagnostics';
import { MetaAuthConfigService } from './meta-auth-config.service';
import { MetaConfigService } from './meta-config.service';

/** The Meta settings store and the Graph clients that follow it. Global so every Meta/WhatsApp service reads one source. */
@Global()
@Module({
  providers: [
    ChannelCryptoService,
    AdminAudit,
    MetaConfigService,
    MetaAuthConfigService,
    MetaGraphProvider,
    WhatsAppGraphProvider,
    MetaDiagnosticsService,
  ],
  exports: [
    MetaConfigService,
    MetaAuthConfigService,
    MetaGraphProvider,
    WhatsAppGraphProvider,
    MetaDiagnosticsService,
    ChannelCryptoService,
  ],
})
export class MetaConfigModule {}
