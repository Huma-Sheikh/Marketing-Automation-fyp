import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { CAMPAIGN_TYPES, CampaignSettings, CampaignType } from '../campaign.types';

export class CreateCampaignDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString() @IsNotEmpty({ message: 'Give the campaign a name' }) @MaxLength(200)
  name: string;

  @IsIn(CAMPAIGN_TYPES, { message: `type must be one of: ${CAMPAIGN_TYPES.join(', ')}` })
  type: CampaignType;

  /**
   * Free-form by design (see CampaignSettings). It is validated as an object
   * only, so the whitelist pipe keeps every key the wizard sends.
   */
  @IsOptional() @IsObject()
  settings?: CampaignSettings;
}
