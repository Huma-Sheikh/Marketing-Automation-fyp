import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser('id') userId: string) {
    return this.analyticsService.getDashboardStats(userId);
  }

  @Get('campaigns/:id')
  getCampaignDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.analyticsService.getCampaignDetail(id, userId);
  }
}
