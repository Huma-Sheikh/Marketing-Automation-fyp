import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';

@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Post()
  create(@Body() body: CreateCampaignDto, @CurrentUser('id') userId: string) {
    return this.campaignsService.createCampaign(userId, body);
  }

  @Get()
  getAll(@CurrentUser('id') userId: string) {
    return this.campaignsService.getCampaigns(userId);
  }

  @Post(':id/start')
  start(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.campaignsService.startCampaign(id, userId);
  }

  @Post(':id/stop')
  stop(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.campaignsService.stopCampaign(id, userId);
  }

  @Get(':id/stats')
  stats(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.campaignsService.getCampaignStats(id, userId);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.campaignsService.deleteCampaign(id, userId);
  }
}
