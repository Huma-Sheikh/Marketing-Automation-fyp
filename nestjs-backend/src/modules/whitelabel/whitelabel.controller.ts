import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateAgencyDto, UpdateAgencyDto } from './dto/agency-fields.dto';
import { WhitelabelService } from './whitelabel.service';

@Controller('whitelabel')
export class WhitelabelController {
  constructor(private readonly whitelabelService: WhitelabelService) {}

  /** Public: the login page asks for branding before anyone is signed in. */
  @Get('branding')
  getBranding(@Query('domain') domain?: string) {
    return this.whitelabelService.getBrandingByDomain(domain || '');
  }

  @Post('agencies')
  @UseGuards(JwtAuthGuard)
  create(@Body() body: CreateAgencyDto, @CurrentUser('id') userId: string) {
    return this.whitelabelService.createAgency(userId, body);
  }

  @Get('agencies')
  @UseGuards(JwtAuthGuard)
  getAll(@CurrentUser('id') userId: string) {
    return this.whitelabelService.getAgencies(userId);
  }

  @Put('agencies/:id')
  @UseGuards(JwtAuthGuard)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateAgencyDto, @CurrentUser('id') userId: string) {
    return this.whitelabelService.updateAgency(id, userId, body);
  }

  @Delete('agencies/:id')
  @UseGuards(JwtAuthGuard)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.whitelabelService.deleteAgency(id, userId);
  }
}
