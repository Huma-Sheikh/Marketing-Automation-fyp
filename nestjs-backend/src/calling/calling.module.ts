import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CallingService } from './calling.service';
import { TwilioMediaStreamServer } from './twilio-media-stream.server';
import { TwimlController } from './twiml.controller';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { User } from '../database/entities/user.entity';
import { AiModule } from '../ai/ai.module';
import { PhoneNumbersModule } from '../phone-numbers/phone-numbers.module';
import { VapiWebhookController } from './vapi-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Call, Lead, Campaign, User]),
    BullModule.registerQueue({ name: 'calling' }),
    AiModule,
    PhoneNumbersModule,
  ],
  providers: [CallingService, TwilioMediaStreamServer],
  controllers: [TwimlController, VapiWebhookController],
  exports: [CallingService],
})
export class CallingModule {}
