import { Controller, Get, Param, UseGuards, Request } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private analyticsService: AnalyticsService) {}
  @Get('dashboard') getDashboard(@Request() req) { return this.analyticsService.getDashboardStats(req.user.id); }
  @Get('campaigns/:id') getCampaignDetail(@Param('id') id: string) { return this.analyticsService.getCampaignDetail(id); }
}
