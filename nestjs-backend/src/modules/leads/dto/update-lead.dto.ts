import { IsIn, IsOptional } from 'class-validator';
import { LEAD_STATUSES, LeadStatus } from '../lead.constants';
import { LeadFieldsDto } from './lead-fields.dto';

export class UpdateLeadDto extends LeadFieldsDto {
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatus;
}
