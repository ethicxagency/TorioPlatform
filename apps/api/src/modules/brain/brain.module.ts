import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { BrainController } from './brain.controller';
import {
  GoogleMerchantCallbackController,
  ImportsController,
  ImportsTickController,
} from './imports.controller';
import { BrainService } from './brain.service';
import { ImportsService } from './imports.service';
import { FeedService } from './imports/feed.service';
import { GoogleMerchantClient } from './imports/google-merchant.client';
import { GoogleMerchantService } from './imports/google-merchant.service';
import { MetaCatalogService } from './imports/meta-catalog.service';
import { ScanService } from './imports/scan.service';

@Module({
  imports: [MetaModule],
  controllers: [
    BrainController,
    ImportsController,
    ImportsTickController,
    GoogleMerchantCallbackController,
  ],
  providers: [
    BrainService,
    ImportsService,
    ScanService,
    FeedService,
    MetaCatalogService,
    GoogleMerchantService,
    { provide: GoogleMerchantClient, useFactory: () => new GoogleMerchantClient() },
  ],
})
export class BrainModule {}
