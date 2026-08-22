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

// PATCH /businesses/:id/cover-photo — a business owner choosing which
// of their own approved photos leads their card/homepage thumbnail.
// Deliberately its own tiny DTO/endpoint rather than folded into
// UpdateBusinessDto: unlike every other field there, this one needs to
// validate the given id is actually a real, owned, approved PHOTO
// (see BusinessService.setCoverPhoto), not just assign a plain value.
export class SetCoverPhotoDto {
  // Null resets to the default (oldest approved photo), letting an
  // owner un-pin their explicit choice without needing a separate
  // endpoint for it.
  @IsOptional()
  @IsString()
  mediaId?: string | null;
}
