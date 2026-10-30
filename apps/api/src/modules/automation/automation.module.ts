import { Global, Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationEngine } from './automation.engine';
import { AutomationService } from './automation.service';

/** Global so Inbox, Leads, Customers and Orders can emit events without importing each other. */
@Global()
@Module({
  controllers: [AutomationController],
  providers: [AutomationEngine, AutomationService],
  exports: [AutomationEngine],
})
export class AutomationModule {}
