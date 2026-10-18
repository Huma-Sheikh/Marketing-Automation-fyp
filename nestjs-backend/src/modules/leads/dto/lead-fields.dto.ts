import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * The lead fields a client may write. Anything not listed (id, userId,
 * createdAt) is stripped by the global ValidationPipe, which is what stops a
 * request from reassigning or overwriting another tenant's lead.
 */
export class LeadFieldsDto {
  @IsOptional() @IsString() @MaxLength(120) firstName?: string;
  @IsOptional() @IsString() @MaxLength(120) lastName?: string;
  @IsOptional() @IsString() @MaxLength(254) email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) company?: string;
  @IsOptional() @IsString() @MaxLength(200) jobTitle?: string;
  @IsOptional() @IsString() @MaxLength(300) location?: string;
  @IsOptional() @IsString() @MaxLength(500) website?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) score?: number;
}
