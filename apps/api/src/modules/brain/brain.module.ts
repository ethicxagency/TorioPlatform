import { Module } from '@nestjs/common';
import { BrainController } from './brain.controller';
import { BrainService } from './brain.service';
import { ImportsService } from './imports.service';

@Module({ controllers: [BrainController], providers: [BrainService, ImportsService] })
export class BrainModule {}
