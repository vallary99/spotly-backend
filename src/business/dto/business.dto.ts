import { IsEnum, IsOptional, IsString, IsArray, IsNumber, IsObject, IsBoolean } from 'class-validator';
import { BusinessType, ReservationPolicy } from '../entities/business.entity';

// Custom validator to limit array size
function MaxArrayLength(max: number) {
  return function (target: any, propertyKey: string) {
    let value: any;
    const getter = function () {
      return value;
    };
    const setter = function (newVal: any) {
      if (Array.isArray(newVal) && newVal.length > max) {
        throw new Error(`${propertyKey} cannot have more than ${max} items`);
      }
      value = newVal;
    };

    Object.defineProperty(target, propertyKey, {
      get: getter,
      set: setter,
      enumerable: true,
      configurable: true,
    });
  };
}

export class CreateBusinessDto {
  @IsEnum(BusinessType)
  type: BusinessType;

  @IsString()
  name: string;

  @IsArray()
  @IsString({ each: true })
  categories: string[]; // Multiple categories (max 5)

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  callPhone?: string; // For phone calls

  @IsOptional()
  @IsString()
  whatsappPhone?: string; // For WhatsApp

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
  @IsNumber()
  budgetMin?: number; // Optional minimum budget

  @IsOptional()
  @IsNumber()
  budgetMax?: number; // Optional maximum budget

  @IsOptional()
  @IsEnum(ReservationPolicy)
  reservationPolicy?: ReservationPolicy; // RESERVATION_ONLY | WALK_IN_ONLY | BOTH

  @IsOptional()
  @IsBoolean()
  isHiddenGem?: boolean;
}

export class UpdateBusinessDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categories?: string[]; // Multiple categories (max 5)

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  callPhone?: string;

  @IsOptional()
  @IsString()
  whatsappPhone?: string;

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
  @IsNumber()
  budgetMin?: number;

  @IsOptional()
  @IsNumber()
  budgetMax?: number;

  @IsOptional()
  @IsEnum(ReservationPolicy)
  reservationPolicy?: ReservationPolicy;

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
