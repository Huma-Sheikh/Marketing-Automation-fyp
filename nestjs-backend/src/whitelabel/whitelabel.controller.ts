import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { WhitelabelService } from './whitelabel.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('whitelabel')
export class WhitelabelController {
  constructor(private whitelabelService: WhitelabelService) {}
  @Get('branding') getBranding(@Query('domain') domain: string) { return this.whitelabelService.getBrandingByDomain(domain || ''); }
  @Post('agencies') @UseGuards(JwtAuthGuard) create(@Body() body: any, @Request() req) { return this.whitelabelService.createAgency(req.user.id, body); }
  @Get('agencies') @UseGuards(JwtAuthGuard) getAll(@Request() req) { return this.whitelabelService.getAgencies(req.user.id); }
  @Put('agencies/:id') @UseGuards(JwtAuthGuard) update(@Param('id') id: string, @Body() body: any, @Request() req) { return this.whitelabelService.updateAgency(id, req.user.id, body); }
  @Delete('agencies/:id') @UseGuards(JwtAuthGuard) remove(@Param('id') id: string) { return this.whitelabelService.deleteAgency(id); }
}
