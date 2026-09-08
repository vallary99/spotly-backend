import { IsArray, IsEmail, IsObject, IsOptional, IsString } from 'class-validator';
import { AdminBusinessQueryDto } from './admin-business.dto';

export class CreateEmailTemplateDto {
  @IsString()
  name: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;
}

export class UpdateEmailTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;
}

export class PreviewEmailDto {
  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsObject()
  filters: AdminBusinessQueryDto;
}

export class SendEmailDto {
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;

  @IsObject()
  filters: AdminBusinessQueryDto;
}

export class SendManualEmailDto {
  @IsOptional() @IsString() templateId?: string;
  @IsOptional() @IsString() subject?: string;
  @IsOptional() @IsString() body?: string;

  @IsArray()
  @IsEmail({}, { each: true })
  emails: string[];
}
