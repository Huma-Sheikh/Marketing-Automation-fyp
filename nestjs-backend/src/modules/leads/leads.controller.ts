import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { ListLeadsQuery } from './dto/list-leads.query';
import { ScrapeLeadsDto } from './dto/scrape-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { DEFAULT_SCRAPE_RESULTS } from './lead.constants';
import { LeadsService } from './leads.service';

@Controller('leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post('scrape')
  scrape(@Body() body: ScrapeLeadsDto, @CurrentUser('id') userId: string) {
    return this.leadsService.scrapeAndSave(userId, body.platform, body.query, body.maxResults ?? DEFAULT_SCRAPE_RESULTS);
  }

  @Get()
  getAll(@Query() query: ListLeadsQuery, @CurrentUser('id') userId: string) {
    return this.leadsService.getLeads(userId, query.status);
  }

  @Post('import')
  importLeads(@Body() body: ImportLeadsDto, @CurrentUser('id') userId: string) {
    return this.leadsService.importLeads(userId, body.leads);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.leadsService.getLead(id, userId);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateLeadDto, @CurrentUser('id') userId: string) {
    return this.leadsService.updateLead(id, userId, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.leadsService.deleteLead(id, userId);
  }
}
