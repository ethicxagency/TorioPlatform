import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminMetaAuthController } from './admin-meta-auth.controller';
import { AdminMetaController } from './admin-meta.controller';
import { AdminAuthService, AdminGuard } from './admin-auth';
import { AdminIntegrationsController } from './admin-integrations.controller';
import { IntegrationsService } from './integrations/integrations.service';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { AdminAudit } from './admin-audit.service';
import { AdminBillingService } from './admin-billing.service';
import { AdminDataService } from './admin-data.service';

@Module({
  controllers: [
    AdminController,
    AdminMetaController,
    AdminMetaAuthController,
    AdminIntegrationsController,
  ],
  providers: [
    AdminAuthService,
    AdminGuard,
    AdminAudit,
    AdminDataService,
    AdminBillingService,
    IntegrationsService,
    ChannelCryptoService,
  ],
})
export class AdminModule {}
