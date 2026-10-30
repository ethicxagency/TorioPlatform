import { Global, Module } from '@nestjs/common';
import { WorkspaceAccessGuard } from '../../common/guards/workspace-access.guard';
import { AuthorizationService } from './authorization.service';

@Global()
@Module({
  providers: [AuthorizationService, WorkspaceAccessGuard],
  exports: [AuthorizationService, WorkspaceAccessGuard],
})
export class AuthorizationModule {}
