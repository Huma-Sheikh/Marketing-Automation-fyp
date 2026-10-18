import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BusinessService } from './business.service';
import { BusinessSearchDto } from './dto/business-search.dto';

@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private readonly businessService: BusinessService) {}

  @Get('regions')
  getRegions() {
    return this.businessService.getRegions();
  }

  @Post('search')
  search(@Body() body: BusinessSearchDto) {
    return this.businessService.searchBusinesses(body);
  }

  @Post('opportunities')
  findOpportunities(@Body() body: BusinessSearchDto) {
    return this.businessService.findOpportunities(body);
  }
}
