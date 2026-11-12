import { Module } from '@nestjs/common';
import { MetaModule } from '../meta/meta.module';
import { BrainController } from './brain.controller';
import { ImportsController, ImportsTickController } from './imports.controller';
import { BrainService } from './brain.service';
import { ImportsService } from './imports.service';
import { FeedService } from './imports/feed.service';
import { MetaCatalogService } from './imports/meta-catalog.service';
import { ScanService } from './imports/scan.service';

@Module({
  imports: [MetaModule],
  controllers: [BrainController, ImportsController, ImportsTickController],
  providers: [BrainService, ImportsService, ScanService, FeedService, MetaCatalogService],
})
export class BrainModule {}
