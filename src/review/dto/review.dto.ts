import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateReviewDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  photos?: string[];

  @IsOptional()
  @IsDateString()
  visitDate?: string;
}
