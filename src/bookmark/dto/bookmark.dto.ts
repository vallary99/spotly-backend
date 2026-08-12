import { IsOptional, IsString } from 'class-validator';

export class CreateBookmarkDto {
  @IsOptional()
  @IsString()
  businessId?: string;

  @IsOptional()
  @IsString()
  experienceId?: string;
}
