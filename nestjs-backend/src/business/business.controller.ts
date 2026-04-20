import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { BusinessService } from './business.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('business')
@UseGuards(JwtAuthGuard)
export class BusinessController {
  constructor(private businessService: BusinessService) {}
  @Post('search')
  search(@Body() body: { location: string; category: string }) {
    return this.businessService.searchBusinesses(body.location, body.category);
  }
}
