import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../auth/entities/user.entity';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AdminBusinessService } from './admin-business.service';
import { AdminModerationService } from './admin-moderation.service';
import { AdminEmailService } from './admin-email.service';
import {
  AdminBusinessQueryDto,
  SuspendBusinessDto,
  SetHiddenGemDto,
  DiscountCampaignDto,
  TrialCampaignDto,
  TransactionQueryDto,
} from './dto/admin-business.dto';
import { AdminTransactionsService } from './admin-transactions.service';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
  PreviewEmailDto,
  SendEmailDto,
} from './dto/admin-email.dto';
import { TierConfigService } from '../subscription/tier-config.service';
import { UpdateTierConfigDto } from '../subscription/dto/update-tier-config.dto';
import { SubscriptionTier } from '../business/entities/business.entity';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

// Platform-operator-only — meant to be called from the separate
// spotly-admin app, not the consumer app. Gated by the real ADMIN role
// (see UserRole.ADMIN's comment for how to grant it), enforced by the
// same RolesGuard already applied globally elsewhere in this codebase.
@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin')
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private analytics: AdminAnalyticsService,
    private adminBusiness: AdminBusinessService,
    private moderation: AdminModerationService,
    private adminEmail: AdminEmailService,
    private transactions: AdminTransactionsService,
    private tierConfig: TierConfigService,
  ) {}

  // --- Dashboard ---
  @Get('analytics/summary')
  getSummary() {
    return this.analytics.getSummary();
  }

  @Get('analytics/usage')
  getUsage(
    @Query('granularity') granularity?: string,
    @Query('days') days?: string,
  ) {
    const g = (
      granularity === 'week' || granularity === 'month' ? granularity : 'day'
    ) as 'day' | 'week' | 'month';
    return this.analytics.getUsageSeries(g, days ? parseInt(days, 10) : 30);
  }

  // --- Business table ---
  @Get('businesses')
  listBusinesses(@Query() query: AdminBusinessQueryDto) {
    return this.adminBusiness.findAll(query);
  }

  @Put('businesses/:id/suspend')
  suspend(@Param('id') id: string, @Body() dto: SuspendBusinessDto) {
    return this.adminBusiness.suspend(id, dto.reason, dto.until ?? null);
  }

  @Put('businesses/:id/unsuspend')
  unsuspend(@Param('id') id: string) {
    return this.adminBusiness.unsuspend(id);
  }

  @Put('businesses/:id/hidden-gem')
  setHiddenGem(@Param('id') id: string, @Body() dto: SetHiddenGemDto) {
    return this.adminBusiness.setHiddenGem(id, dto.value);
  }

  // --- Package pricing/limits ---
  @Get('tier-configs')
  getTierConfigs() {
    return this.tierConfig.getAll();
  }

  @Put('tier-configs/:tier')
  updateTierConfig(
    @Param('tier') tier: string,
    @Body() dto: UpdateTierConfigDto,
  ) {
    if (!Object.values(SubscriptionTier).includes(tier as SubscriptionTier)) {
      throw new BadRequestException(
        `Unknown tier "${tier}". Expected one of: ${Object.values(SubscriptionTier).join(', ')}.`,
      );
    }
    return this.tierConfig.updateTier(tier as SubscriptionTier, dto);
  }

  // --- Reward program ---
  @Post('businesses/discount-campaign')
  applyDiscountCampaign(@Body() dto: DiscountCampaignDto) {
    const { discountPercent, ...filters } = dto;
    return this.adminBusiness.applyDiscountCampaign(filters, discountPercent);
  }

  @Post('businesses/trial-campaign')
  grantTrialOffer(@Body() dto: TrialCampaignDto) {
    const { trialTier, days, ...filters } = dto;
    return this.adminBusiness.grantTrialOffer(filters, trialTier, days);
  }

  // --- Moderation queue ---
  @Get('moderation-queue')
  getModerationQueue() {
    return this.moderation.findPending();
  }

  @Put('moderation-queue/:id/resolve')
  resolveModerationItem(
    @Param('id') id: string,
    @Body('action') action: 'approve' | 'reject',
  ) {
    return this.moderation.resolve(id, action);
  }

  // --- Email templates ---
  @Get('email-templates')
  listEmailTemplates() {
    return this.adminEmail.listTemplates();
  }

  @Get('email-templates/:id')
  getEmailTemplate(@Param('id') id: string) {
    return this.adminEmail.getTemplate(id);
  }

  @Post('email-templates')
  createEmailTemplate(@Body() dto: CreateEmailTemplateDto) {
    return this.adminEmail.createTemplate(dto);
  }

  @Put('email-templates/:id')
  updateEmailTemplate(
    @Param('id') id: string,
    @Body() dto: UpdateEmailTemplateDto,
  ) {
    return this.adminEmail.updateTemplate(id, dto);
  }

  @Delete('email-templates/:id')
  deleteEmailTemplate(@Param('id') id: string) {
    return this.adminEmail.deleteTemplate(id);
  }

  @Post('email-templates/preview')
  previewEmail(@Body() dto: PreviewEmailDto) {
    return this.adminEmail.preview(dto.subject, dto.body, dto.filters);
  }

  @Post('email-templates/send')
  sendEmail(@Body() dto: SendEmailDto, @CurrentUser() user: any) {
    return this.adminEmail.send({
      templateId: dto.templateId,
      subject: dto.subject,
      body: dto.body,
      filters: dto.filters,
      adminUserId: user.userId,
    });
  }

  @Get('email-sends')
  getEmailSendHistory() {
    return this.adminEmail.getSendHistory();
  }

  // --- Transactions ---
  @Get('transactions')
  listTransactions(@Query() query: TransactionQueryDto) {
    return this.transactions.findAll(query);
  }
}
