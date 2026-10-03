import { Controller, Post, Get, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { CampaignService } from './campaign.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('campaigns')
@UseGuards(JwtAuthGuard)
export class CampaignController {
  constructor(private campaignService: CampaignService) {}
  @Post() create(@Body() body: any, @Request() req) { return this.campaignService.createCampaign(req.user.id, body); }
  @Get() getAll(@Request() req) { return this.campaignService.getCampaigns(req.user.id); }
  @Post(':id/start') start(@Param('id') id: string, @Request() req) { return this.campaignService.startCampaign(id, req.user.id); }
  @Post(':id/stop') stop(@Param('id') id: string, @Request() req) { return this.campaignService.stopCampaign(id, req.user.id); }
  @Get(':id/stats') stats(@Param('id') id: string, @Request() req) { return this.campaignService.getCampaignStats(id, req.user.id); }
  @Delete(':id') remove(@Param('id') id: string, @Request() req) { return this.campaignService.deleteCampaign(id, req.user.id); }
}
