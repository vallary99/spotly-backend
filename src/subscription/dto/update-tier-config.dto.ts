import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

// Partial by design (editing just the price doesn't require resending
// every limit) — server-side validated regardless (NFR-6), not just
// trusted from the form.
export class UpdateTierConfigDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  priceKes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  photos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  videos?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  videoMaxSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  concurrentExperiences?: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyExperiencesIncluded?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  extraFeatures?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  experienceAddonPriceKes?: number;
}
