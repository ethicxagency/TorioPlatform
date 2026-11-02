import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminAuthService, AdminGuard } from './admin-auth';
import { AdminAudit } from './admin-audit.service';
import { AdminBillingService } from './admin-billing.service';
import { AdminDataService } from './admin-data.service';

@Module({
  controllers: [AdminController],
  providers: [AdminAuthService, AdminGuard, AdminAudit, AdminDataService, AdminBillingService],
})
export class AdminModule {}
