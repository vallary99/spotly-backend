import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminBusinessQueryDto {
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() tier?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isSuspended?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHiddenGem?: boolean;

  @IsOptional() @IsString() registeredAfter?: string;
  @IsOptional() @IsString() registeredBefore?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minProfileViews?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  minSavesCount?: number;

  @IsOptional()
  @IsIn(['createdAt', 'profileViews', 'savesCount', 'name'])
  sortBy?: 'createdAt' | 'profileViews' | 'savesCount' | 'name';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset?: number;
}

export class SuspendBusinessDto {
  // Optional: the admin "Deactivate" button (a lighter-weight, no-explanation
  // pause — see AdminBusinessService.suspend) reuses this same endpoint
  // without a reason. "Suspend" proper (policy violations) should still
  // supply one so the business owner sees why. Defaults server-side when
  // omitted — see AdminBusinessService.suspend.
  @IsOptional()
  @IsString()
  reason?: string;

  // ISO date string, or omit for an indefinite suspension an admin must
  // manually lift.
  @IsOptional()
  @IsString()
  until?: string;
}

export class SetHiddenGemDto {
  @IsBoolean()
  value: boolean;
}

export class DiscountCampaignDto extends AdminBusinessQueryDto {
  @IsInt()
  @Min(0)
  @Max(100)
  discountPercent: number;
}

export class TrialCampaignDto extends AdminBusinessQueryDto {
  @IsIn(['GROWTH', 'PREMIUM'])
  trialTier: 'GROWTH' | 'PREMIUM';

  @IsInt()
  @Min(1)
  @Max(90)
  days: number;
}

export class TransactionQueryDto {
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsString() businessId?: string;
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  offset?: number;
}
