import { Module } from '@nestjs/common';
import { BrainController } from './brain.controller';
import { ImportsController, ImportsTickController } from './imports.controller';
import { BrainService } from './brain.service';
import { ImportsService } from './imports.service';
import { FeedService } from './imports/feed.service';
import { ScanService } from './imports/scan.service';

@Module({
  controllers: [BrainController, ImportsController, ImportsTickController],
  providers: [BrainService, ImportsService, ScanService, FeedService],
})
export class BrainModule {}
