import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePhoneNumberDto, UpdatePhoneNumberDto } from './dto/phone-number.dto';
import { PhoneNumbersService } from './phone-numbers.service';

@Controller('phone-numbers')
@UseGuards(JwtAuthGuard)
export class PhoneNumbersController {
  constructor(private readonly phoneNumbers: PhoneNumbersService) {}

  /** Carriers, connection types and their credential fields — drives the settings form. */
  @Get('catalogue')
  catalogue() {
    return this.phoneNumbers.getCatalogue();
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.phoneNumbers.list(userId);
  }

  @Post()
  create(@Body() body: CreatePhoneNumberDto, @CurrentUser('id') userId: string) {
    return this.phoneNumbers.create(userId, body);
  }

  @Put(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdatePhoneNumberDto, @CurrentUser('id') userId: string) {
    return this.phoneNumbers.update(userId, id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.phoneNumbers.remove(userId, id);
  }

  @Post(':id/verify')
  verify(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.phoneNumbers.verify(userId, id);
  }

  @Post(':id/default')
  setDefault(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') userId: string) {
    return this.phoneNumbers.setDefault(userId, id);
  }
}
