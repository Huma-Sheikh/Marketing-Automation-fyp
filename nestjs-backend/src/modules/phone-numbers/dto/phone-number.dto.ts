import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Carrier/provider values are checked against the catalogue in
 * PhoneNumbersService, which gives a more useful message than @IsIn could.
 */
export class CreatePhoneNumberDto {
  @IsString() carrier: string;
  @IsString() provider: string;
  @IsString() @MaxLength(32) number: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsObject() credentials?: Record<string, unknown>;
}

export class UpdatePhoneNumberDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() @MaxLength(32) number?: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsObject() credentials?: Record<string, unknown>;
}
