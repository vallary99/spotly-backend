import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { OfferScheduleType } from '../entities/offer.entity';

const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

export class CreateOfferDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(OfferScheduleType)
  scheduleType: OfferScheduleType;

  @IsDateString()
  startDate: string;

  // Required for DATE_RANGE, optional (indefinite) for WEEKLY, ignored
  // for SINGLE_DAY. The "required for DATE_RANGE" part is enforced in
  // the service rather than here, since class-validator's ValidateIf
  // would need the schedule type to already be known, and DTOs
  // validate field-by-field before that context is convenient to use
  // cleanly here.
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(DAYS_OF_WEEK, { each: true })
  daysOfWeek?: string[];
}

export class UpdateOfferDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(OfferScheduleType) scheduleType?: OfferScheduleType;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsArray() @IsIn(DAYS_OF_WEEK, { each: true }) daysOfWeek?: string[];
}
