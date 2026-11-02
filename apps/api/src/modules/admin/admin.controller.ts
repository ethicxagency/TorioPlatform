import {
  Body,
  Controller,
  Get,
  HttpCode,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  adminActivityListSchema,
  adminActivityQuerySchema,
  adminAssignPlanSchema,
  adminCancelSubscriptionSchema,
  adminCustomerDetailSchema,
  adminCustomerListSchema,
  adminLoginSchema,
  adminPasswordSchema,
  adminPlanListSchema,
  adminPlanSchema,
  adminProfileSchema,
  adminResultSchema,
  adminSettingsSchema,
  adminSubscriptionDetailSchema,
  adminSubscriptionListSchema,
  adminSubscriptionQuerySchema,
  adminWorkspaceDetailSchema,
  adminWorkspaceListSchema,
  adminWorkspaceQuerySchema,
  adminCreatePlanSchema,
  adminCustomerQuerySchema,
  adminDashboardSchema,
  adminPlanStatusSchema,
  adminReasonSchema,
  updateAdminProfileSchema,
  updateAdminSettingsSchema,
  adminUpdatePlanSchema,
} from '@torio/contracts';
import type { Request, Response } from 'express';
import { createZodDto } from 'nestjs-zod';
import { Public } from '../../common/decorators';
import { AdminAuthService, AdminGuard, CurrentAdmin, type AdminContext } from './admin-auth';
import { AdminBillingService } from './admin-billing.service';
import { AdminDataService } from './admin-data.service';

class AdminLoginDto extends createZodDto(adminLoginSchema) {}
class AdminPasswordDto extends createZodDto(adminPasswordSchema) {}
class AdminProfileDto extends createZodDto(adminProfileSchema) {}
class UpdateAdminProfileDto extends createZodDto(updateAdminProfileSchema) {}
class AdminDashboardDto extends createZodDto(adminDashboardSchema) {}
class AdminCustomerQueryDto extends createZodDto(adminCustomerQuerySchema) {}
class AdminCustomerListDto extends createZodDto(adminCustomerListSchema) {}
class AdminCustomerDetailDto extends createZodDto(adminCustomerDetailSchema) {}
class AdminReasonDto extends createZodDto(adminReasonSchema) {}
class AdminWorkspaceQueryDto extends createZodDto(adminWorkspaceQuerySchema) {}
class AdminWorkspaceListDto extends createZodDto(adminWorkspaceListSchema) {}
class AdminWorkspaceDetailDto extends createZodDto(adminWorkspaceDetailSchema) {}
class AdminSubscriptionQueryDto extends createZodDto(adminSubscriptionQuerySchema) {}
class AdminSubscriptionListDto extends createZodDto(adminSubscriptionListSchema) {}
class AdminSubscriptionDetailDto extends createZodDto(adminSubscriptionDetailSchema) {}
class AdminCancelSubscriptionDto extends createZodDto(adminCancelSubscriptionSchema) {}
class AdminAssignPlanDto extends createZodDto(adminAssignPlanSchema) {}
class AdminResultDto extends createZodDto(adminResultSchema) {}
class AdminPlanListDto extends createZodDto(adminPlanListSchema) {}
class AdminPlanDto extends createZodDto(adminPlanSchema) {}
class CreatePlanDto extends createZodDto(adminCreatePlanSchema) {}
class UpdatePlanDto extends createZodDto(adminUpdatePlanSchema) {}
class PlanStatusDto extends createZodDto(adminPlanStatusSchema) {}
class AdminActivityQueryDto extends createZodDto(adminActivityQuerySchema) {}
class AdminActivityListDto extends createZodDto(adminActivityListSchema) {}
class AdminSettingsDto extends createZodDto(adminSettingsSchema) {}
class UpdateAdminSettingsDto extends createZodDto(updateAdminSettingsSchema) {}

/**
 * Super Admin API. `@Public()` only opts out of the *customer* JWT guard; every route here is protected by AdminGuard
 * (an admin-only server-side session), except login.
 */
@ApiTags('admin')
@Public()
@Controller('admin')
export class AdminController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly data: AdminDataService,
    private readonly billing: AdminBillingService,
  ) {}

  // ----- auth -----
  @Post('auth/login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOkResponse({ type: AdminProfileDto })
  login(@Body() b: AdminLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.login(b.email, b.password, { ip: req.ip, ua: req.headers['user-agent'] }, res);
  }

  @Post('auth/logout')
  @HttpCode(200)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req, res);
    return { ok: true };
  }

  @UseGuards(AdminGuard)
  @Get('auth/me')
  @ApiOkResponse({ type: AdminProfileDto })
  me(@CurrentAdmin() a: AdminContext) {
    return { id: a.id, email: a.email, name: a.name, role: a.role };
  }

  @UseGuards(AdminGuard)
  @Patch('auth/profile')
  @ApiOkResponse({ type: AdminProfileDto })
  profile(@CurrentAdmin() a: AdminContext, @Body() b: UpdateAdminProfileDto, @Ip() ip: string) {
    return this.auth.updateName(a, b.name, ip);
  }

  @UseGuards(AdminGuard)
  @Post('auth/password')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  async password(@CurrentAdmin() a: AdminContext, @Body() b: AdminPasswordDto, @Ip() ip: string) {
    await this.auth.changePassword(a, b.currentPassword, b.newPassword, ip);
    return { ok: true };
  }

  // ----- dashboard -----
  @UseGuards(AdminGuard)
  @Get('dashboard')
  @ApiOkResponse({ type: AdminDashboardDto })
  dashboard() {
    return this.data.dashboard();
  }

  // ----- customers -----
  @UseGuards(AdminGuard)
  @Get('customers')
  @ApiOkResponse({ type: AdminCustomerListDto })
  customers(@Query() q: AdminCustomerQueryDto) {
    return this.data.customers(q);
  }

  @UseGuards(AdminGuard)
  @Get('customers/:id')
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  customer(@Param('id', ParseUUIDPipe) id: string) {
    return this.data.customer(id);
  }

  @UseGuards(AdminGuard)
  @Post('customers/:id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  suspendCustomer(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminReasonDto,
    @Ip() ip: string,
  ) {
    return this.data.setCustomerStatus(a, id, true, b.reason, ip);
  }

  @UseGuards(AdminGuard)
  @Post('customers/:id/reactivate')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminCustomerDetailDto })
  reactivateCustomer(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminReasonDto,
    @Ip() ip: string,
  ) {
    return this.data.setCustomerStatus(a, id, false, b.reason, ip);
  }

  // ----- workspaces -----
  @UseGuards(AdminGuard)
  @Get('workspaces')
  @ApiOkResponse({ type: AdminWorkspaceListDto })
  workspaces(@Query() q: AdminWorkspaceQueryDto) {
    return this.data.workspaces(q);
  }

  @UseGuards(AdminGuard)
  @Get('workspaces/:id')
  @ApiOkResponse({ type: AdminWorkspaceDetailDto })
  workspace(@Param('id', ParseUUIDPipe) id: string) {
    return this.data.workspace(id);
  }

  @UseGuards(AdminGuard)
  @Post('workspaces/:id/suspend')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminWorkspaceDetailDto })
  suspendWorkspace(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminReasonDto,
    @Ip() ip: string,
  ) {
    return this.data.setWorkspaceStatus(a, id, true, b.reason, ip);
  }

  @UseGuards(AdminGuard)
  @Post('workspaces/:id/reactivate')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminWorkspaceDetailDto })
  reactivateWorkspace(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminReasonDto,
    @Ip() ip: string,
  ) {
    return this.data.setWorkspaceStatus(a, id, false, b.reason, ip);
  }

  @UseGuards(AdminGuard)
  @Post('workspaces/:id/assign-plan')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminResultDto })
  assignPlan(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminAssignPlanDto,
    @Ip() ip: string,
  ) {
    return this.billing.assignPlan(a, id, b, ip);
  }

  // ----- subscriptions -----
  @UseGuards(AdminGuard)
  @Get('subscriptions')
  @ApiOkResponse({ type: AdminSubscriptionListDto })
  subscriptions(@Query() q: AdminSubscriptionQueryDto) {
    return this.billing.subscriptions(q);
  }

  @UseGuards(AdminGuard)
  @Get('subscriptions/:id')
  @ApiOkResponse({ type: AdminSubscriptionDetailDto })
  subscription(@Param('id', ParseUUIDPipe) id: string) {
    return this.billing.subscription(id);
  }

  @UseGuards(AdminGuard)
  @Post('subscriptions/:id/cancel')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminResultDto })
  cancelSubscription(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminCancelSubscriptionDto,
    @Ip() ip: string,
  ) {
    return this.billing.cancel(a, id, b, ip);
  }

  @UseGuards(AdminGuard)
  @Post('subscriptions/:id/resume')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminResultDto })
  resumeSubscription(
    @CurrentAdmin() a: AdminContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() b: AdminReasonDto,
    @Ip() ip: string,
  ) {
    return this.billing.resume(a, id, b.reason, ip);
  }

  // ----- plans -----
  @UseGuards(AdminGuard)
  @Get('plans')
  @ApiOkResponse({ type: AdminPlanListDto })
  plans() {
    return this.billing.listPlans();
  }

  @UseGuards(AdminGuard)
  @Post('plans')
  @ApiOkResponse({ type: AdminPlanDto })
  createPlan(@CurrentAdmin() a: AdminContext, @Body() b: CreatePlanDto, @Ip() ip: string) {
    return this.billing.createPlan(a, b, ip);
  }

  @UseGuards(AdminGuard)
  @Patch('plans/:key')
  @ApiOkResponse({ type: AdminPlanDto })
  updatePlan(
    @CurrentAdmin() a: AdminContext,
    @Param('key') key: string,
    @Body() b: UpdatePlanDto,
    @Ip() ip: string,
  ) {
    return this.billing.updatePlan(a, key, b, ip);
  }

  @UseGuards(AdminGuard)
  @Post('plans/:key/status')
  @HttpCode(200)
  @ApiOkResponse({ type: AdminPlanDto })
  planStatus(
    @CurrentAdmin() a: AdminContext,
    @Param('key') key: string,
    @Body() b: PlanStatusDto,
    @Ip() ip: string,
  ) {
    return this.billing.setPlanStatus(a, key, b.status, b.reason, ip);
  }

  // ----- activity & settings -----
  @UseGuards(AdminGuard)
  @Get('activity')
  @ApiOkResponse({ type: AdminActivityListDto })
  activity(@Query() q: AdminActivityQueryDto) {
    return this.data.activity(q);
  }

  @UseGuards(AdminGuard)
  @Get('settings')
  @ApiOkResponse({ type: AdminSettingsDto })
  settings() {
    return this.data.getSettings();
  }

  @UseGuards(AdminGuard)
  @Patch('settings')
  @ApiOkResponse({ type: AdminSettingsDto })
  updateSettings(
    @CurrentAdmin() a: AdminContext,
    @Body() b: UpdateAdminSettingsDto,
    @Ip() ip: string,
  ) {
    return this.data.updateSettings(a, b, ip);
  }
}
void ApiExcludeController;
