import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Request, UseGuards } from '@nestjs/common';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PhoneNumbersService } from './phone-numbers.service';

class CreatePhoneNumberDto {
  @IsString() carrier: string;
  @IsString() provider: string;
  @IsString() @MaxLength(32) number: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsObject() credentials?: Record<string, unknown>;
}

class UpdatePhoneNumberDto {
  @IsOptional() @IsString() provider?: string;
  @IsOptional() @IsString() @MaxLength(32) number?: string;
  @IsOptional() @IsString() @MaxLength(60) label?: string;
  @IsOptional() @IsObject() credentials?: Record<string, unknown>;
}

@Controller('phone-numbers')
@UseGuards(JwtAuthGuard)
export class PhoneNumbersController {
  constructor(private phoneNumbers: PhoneNumbersService) {}

  /** Carriers, connection types and their credential fields — drives the settings form. */
  @Get('catalogue') catalogue() { return this.phoneNumbers.getCatalogue(); }

  @Get() list(@Request() req) { return this.phoneNumbers.list(req.user.id); }
  @Post() create(@Body() body: CreatePhoneNumberDto, @Request() req) { return this.phoneNumbers.create(req.user.id, body); }
  @Put(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePhoneNumberDto, @Request() req) {
    return this.phoneNumbers.update(req.user.id, id, body);
  }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @Request() req) { return this.phoneNumbers.remove(req.user.id, id); }
  @Post(':id/verify') verify(@Param('id', ParseUUIDPipe) id: string, @Request() req) { return this.phoneNumbers.verify(req.user.id, id); }
  @Post(':id/default') setDefault(@Param('id', ParseUUIDPipe) id: string, @Request() req) {
    return this.phoneNumbers.setDefault(req.user.id, id);
  }
}
