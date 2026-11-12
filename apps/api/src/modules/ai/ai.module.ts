import { Module } from '@nestjs/common';
import { AdminAudit } from '../admin/admin-audit.service';
import { BrainModule } from '../brain/brain.module';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { AiAdminService } from './ai-admin.service';
import { AiConfigService } from './ai-config.service';
import { AiController, AdminAiController } from './ai.controller';
import { AiOrchestrator } from './ai-orchestrator.service';
import { AiProviderRegistry } from './ai-registry';

@Module({
  imports: [BrainModule],
  controllers: [AdminAiController, AiController],
  providers: [
    AiProviderRegistry,
    AiConfigService,
    AiAdminService,
    AiOrchestrator,
    AdminAudit,
    ChannelCryptoService,
  ],
  exports: [AiOrchestrator],
})
export class AiModule {}
