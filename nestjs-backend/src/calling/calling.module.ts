import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { CallingService } from './calling.service';
import { CallingGateway } from './calling.gateway';
import { TwimlController } from './twiml.controller';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { AiModule } from '../ai/ai.module';
@Module({
  imports: [TypeOrmModule.forFeature([Call, Lead]), BullModule.registerQueue({ name: 'calling' }), AiModule],
  providers: [CallingService, CallingGateway],
  controllers: [TwimlController],
  exports: [CallingService],
})
export class CallingModule {}
