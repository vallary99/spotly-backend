import { ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Every field is deliberately required here — a business owner filling
// this out is expected to provide a complete listing (cover image,
// end time, address, price, and how to actually get in), not a partial
// one filled in later. This is a genuine product decision, not the
// usual "optional unless stated" default elsewhere in this codebase.
export class CreateExperienceDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsArray()
  @ArrayMinSize(1)
  images: string[];

  @IsDateString()
  startsAt: string;

  @IsDateString()
  endsAt: string;

  @IsString()
  location: string; // treated as a free-text address, same as Business.address

  @IsNumber()
  @Min(0)
  price: number;

  // The one deliberately optional field — a free walk-in event
  // genuinely has nothing to put here. Every other field stays
  // mandatory: a business owner is expected to submit a complete
  // listing, this is the one exception, not the rule.
  @IsOptional()
  @IsString()
  ticketingLink?: string;
}

// A real class (not just `Partial<CreateExperienceDto>` as a bare type
// annotation) — NestJS's ValidationPipe needs an actual class it can
// reflect to apply decorators; a TypeScript utility type erases at
// runtime and gives it nothing to validate against. The controller was
// previously typed as `Partial<CreateExperienceDto>`, which meant
// updates were never actually being validated at all.
export class UpdateExperienceDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsNumber() @Min(0) price?: number;
  @IsOptional() @IsString() ticketingLink?: string;
}
