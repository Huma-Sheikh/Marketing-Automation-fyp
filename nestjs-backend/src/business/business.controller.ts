import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessSearchQuery } from '../ai/ai.service';

@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @Get('regions')
  getRegions() {
    return this.businessService.getRegions();
  }

  @Post('search')
  search(@Body() body: BusinessSearchQuery) {
    return this.businessService.searchBusinesses(body);
  }

  @Post('opportunities')
  findOpportunities(@Body() body: BusinessSearchQuery) {
    return this.businessService.findOpportunities(body);
  }
}
