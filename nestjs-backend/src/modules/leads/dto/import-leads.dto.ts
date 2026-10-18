import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { LeadFieldsDto } from './lead-fields.dto';

export class ImportLeadDto extends LeadFieldsDto {
  @IsOptional() @IsString() @MaxLength(60) sourceplatform?: string;
  /** Original source record (e.g. the Google Places result), kept for reference. */
  @IsOptional() @IsObject() rawData?: Record<string, unknown>;
}

export class ImportLeadsDto {
  @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportLeadDto)
  leads: ImportLeadDto[];
}
