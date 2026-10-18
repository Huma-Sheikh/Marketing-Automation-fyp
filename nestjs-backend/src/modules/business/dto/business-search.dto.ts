import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BusinessSearchQuery } from '../../ai/ai.types';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Body of POST /business/search and /business/opportunities. snake_case: forwarded to business-service as-is. */
export class BusinessSearchDto implements BusinessSearchQuery {
  /** Free text ("Manchester, UK") or a region code from GET /business/regions. */
  @Transform(trim) @IsString() @IsNotEmpty({ message: 'Pick a location' }) @MaxLength(200)
  location: string;

  @Transform(trim) @IsString() @IsNotEmpty({ message: 'Pick a category' }) @MaxLength(100)
  category: string;

  @IsOptional() @IsString() @MaxLength(40)
  region_code?: string;

  @IsOptional() @IsInt() @Min(100) @Max(50_000)
  radius_meters?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  min_rating?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(5)
  max_rating?: number;

  /** Google Places returns at most 60 results across its three pages. */
  @IsOptional() @IsInt() @Min(1) @Max(60)
  max_results?: number;
}
