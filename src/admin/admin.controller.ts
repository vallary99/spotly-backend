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
import { AdminConfigService } from './admin-config.service';
import { CreateCategoryDto, UpdateCategoryDto, CreateNeighborhoodDto, UpdateNeighborhoodDto, CreateQuickFilterGroupDto, UpdateQuickFilterGroupDto, MapCategoriesToGroupDto } from './dto/config.dto';
import { SystemConfigService } from '../config/system-config.service';
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
    private config: AdminConfigService,
    private systemConfig: SystemConfigService,
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

  // --- Configuration: Categories ---
  @Get('categories')
  listCategories() {
    return this.config.findAllCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.config.createCategory(dto);
  }

  @Put('categories/:id')
  updateCategory(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.config.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  deleteCategory(@Param('id') id: string) {
    return this.config.deleteCategory(id);
  }

  // --- Configuration: Neighborhoods ---
  @Get('neighborhoods')
  listNeighborhoods() {
    return this.config.findAllNeighborhoods();
  }

  @Post('neighborhoods')
  createNeighborhood(@Body() dto: CreateNeighborhoodDto) {
    return this.config.createNeighborhood(dto);
  }

  @Put('neighborhoods/:id')
  updateNeighborhood(@Param('id') id: string, @Body() dto: UpdateNeighborhoodDto) {
    return this.config.updateNeighborhood(id, dto);
  }

  @Delete('neighborhoods/:id')
  deleteNeighborhood(@Param('id') id: string) {
    return this.config.deleteNeighborhood(id);
  }

  // --- Configuration: Quick Filter Groups ---
  @Get('quick-filter-groups')
  listFilterGroups() {
    return this.config.findAllFilterGroups();
  }

  @Get('quick-filter-groups/:id')
  getFilterGroup(@Param('id') id: string) {
    return this.config.findFilterGroupById(id);
  }

  @Post('quick-filter-groups')
  createFilterGroup(@Body() dto: CreateQuickFilterGroupDto) {
    return this.config.createFilterGroup(dto);
  }

  @Put('quick-filter-groups/:id')
  updateFilterGroup(@Param('id') id: string, @Body() dto: UpdateQuickFilterGroupDto) {
    return this.config.updateFilterGroup(id, dto);
  }

  @Delete('quick-filter-groups/:id')
  deleteFilterGroup(@Param('id') id: string) {
    return this.config.deleteFilterGroup(id);
  }

  @Put('quick-filter-groups/:id/categories')
  mapCategoriesToGroup(@Param('id') id: string, @Body() dto: MapCategoriesToGroupDto) {
    return this.config.mapCategoriesToGroup(id, dto);
  }

  // --- Configuration: platform-wide settings ---
  @Get('settings/max-categories')
  async getMaxCategoriesSetting() {
    return { maxCategories: await this.systemConfig.getMaxCategoriesPerBusiness() };
  }

  @Put('settings/max-categories')
  async setMaxCategoriesSetting(@Body('maxCategories') maxCategories: number) {
    if (typeof maxCategories !== 'number' || !Number.isFinite(maxCategories)) {
      throw new BadRequestException('maxCategories must be a number.');
    }
    const saved = await this.systemConfig.setMaxCategoriesPerBusiness(maxCategories);
    return { maxCategories: saved };
  }
}
