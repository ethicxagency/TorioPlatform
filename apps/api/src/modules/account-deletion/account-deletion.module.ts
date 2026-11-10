import { Module } from '@nestjs/common';
import { AdminAudit } from '../admin/admin-audit.service';
import {
  AccountDeletionController,
  AdminAccountDeletionController,
} from './account-deletion.controller';
import { AccountDeletionService } from './account-deletion.service';

@Module({
  controllers: [AccountDeletionController, AdminAccountDeletionController],
  providers: [AccountDeletionService, AdminAudit],
})
export class AccountDeletionModule {}
