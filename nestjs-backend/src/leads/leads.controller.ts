import { Controller, Post, Get, Put, Delete, Body, Param, Query, UseGuards, Request } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private leadsService: LeadsService) {}

  @Post('scrape')
  scrape(@Body() body: { platform: string; query: string; maxResults?: number }, @Request() req) {
    return this.leadsService.scrapeAndSave(req.user.id, body.platform, body.query, body.maxResults || 100);
  }

  @Get()
  getAll(@Request() req, @Query('status') status?: string) {
    return this.leadsService.getLeads(req.user.id, status);
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.leadsService.getLead(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.leadsService.updateLead(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.deleteLead(id);
  }

  @Post('import')
  importLeads(@Body() body: { leads: any[] }, @Request() req) {
    return this.leadsService.importLeads(req.user.id, body.leads);
  }
}
