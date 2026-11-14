import { Module } from '@nestjs/common';
import { BrainModule } from '../brain/brain.module';
import { ChannelCryptoService } from '../whatsapp/channel-crypto.service';
import { CatalogFeedService } from './catalog-feed.service';
import { CatalogImportService } from './catalog-import.service';
import {
  CatalogController,
  CatalogFeedPublicController,
  CatalogTickController,
} from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [BrainModule],
  controllers: [CatalogController, CatalogFeedPublicController, CatalogTickController],
  providers: [CatalogService, CatalogImportService, CatalogFeedService, ChannelCryptoService],
  exports: [CatalogService, CatalogImportService],
})
export class CatalogModule {}
