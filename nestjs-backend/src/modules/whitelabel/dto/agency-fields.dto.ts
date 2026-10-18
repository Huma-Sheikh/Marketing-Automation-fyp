import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { AGENCY_STATUSES } from '../whitelabel.constants';

/** Blank form inputs arrive as "". Store them as null so unique columns (customDomain) don't collide. */
const blankToNull = () => Transform(({ value }) => (typeof value === 'string' && value.trim() === '' ? null : value));
const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;

/**
 * The agency fields a client may set. ownerId, callsThisMonth, id and createdAt
 * are deliberately absent: the global ValidationPipe strips them, so a tenant
 * cannot hand an agency to someone else or reset its usage counter.
 */
export class AgencyFieldsDto {
  @IsOptional() @blankToNull() @IsString() @MaxLength(253) customDomain?: string | null;
  @IsOptional() @blankToNull() @IsString() @MaxLength(2000) logoUrl?: string | null;
  @IsOptional() @Matches(HEX_COLOR, { message: 'primaryColor must be a hex colour like #2563EB' }) primaryColor?: string;
  @IsOptional() @blankToNull() @Matches(HEX_COLOR, { message: 'accentColor must be a hex colour like #2563EB' }) accentColor?: string | null;
  @IsOptional() @blankToNull() @IsString() @MaxLength(60) callerIdName?: string | null;
  @IsOptional() @blankToNull() @IsEmail() supportEmail?: string | null;
  @IsOptional() @IsObject() limits?: Record<string, number>;
}

export class CreateAgencyDto extends AgencyFieldsDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @MaxLength(200)
  agencyName: string;
}

export class UpdateAgencyDto extends AgencyFieldsDto {
  @IsOptional() @IsString() @MaxLength(200) agencyName?: string;
  @IsOptional() @IsIn(AGENCY_STATUSES) status?: (typeof AGENCY_STATUSES)[number];
}
