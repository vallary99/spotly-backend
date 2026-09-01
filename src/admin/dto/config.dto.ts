import { IsString, IsOptional, IsArray, IsNumber, IsUUID, IsBoolean } from 'class-validator';

// Category DTOs
export class CreateCategoryDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// Neighborhood DTOs
export class CreateNeighborhoodDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateNeighborhoodDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isHidden?: boolean;
}

// QuickFilterGroup DTOs
export class CreateQuickFilterGroupDto {
  @IsString()
  label: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[]; // IDs of categories to link
}

export class UpdateQuickFilterGroupDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds?: string[]; // Replace categories linked to this group
}

export class MapCategoriesToGroupDto {
  @IsArray()
  @IsUUID('4', { each: true })
  categoryIds: string[]; // IDs of categories to link to the group
}
