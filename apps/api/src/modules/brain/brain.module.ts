import { Module } from '@nestjs/common';
import { BrainController } from './brain.controller';
import { ImportsController, ImportsTickController } from './imports.controller';
import { BrainService } from './brain.service';
import { ImportsService } from './imports.service';
import { ScanService } from './imports/scan.service';

@Module({
  controllers: [BrainController, ImportsController, ImportsTickController],
  providers: [BrainService, ImportsService, ScanService],
})
export class BrainModule {}
