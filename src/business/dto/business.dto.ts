import { IsEnum, IsOptional, IsString, IsArray, IsNumber, IsObject, IsBoolean } from 'class-validator';
import { BusinessType } from '../../entities/business.entity';

export class CreateBusinessDto {
  @IsEnum(BusinessType)
  type: BusinessType;

  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  // Not @IsUrl() strictly — owners may type "mybusiness.com" without a
  // scheme; the frontend normalizes it to a full https:// link when
  // rendering, rather than rejecting valid-but-schemeless input here.
  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsObject()
  hours?: Record<string, { open: string; close: string } | null>;

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsBoolean()
  isHiddenGem?: boolean;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsObject()
  hours?: Record<string, { open: string; close: string } | null>;

  @IsOptional()
  @IsArray()
  amenities?: string[];

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsBoolean()
  isHiddenGem?: boolean;
}
