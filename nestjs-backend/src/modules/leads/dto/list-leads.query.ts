import { IsIn, IsOptional } from 'class-validator';
import { LEAD_STATUSES, LeadStatus } from '../lead.constants';

export class ListLeadsQuery {
  @IsOptional() @IsIn(LEAD_STATUSES) status?: LeadStatus;
}
