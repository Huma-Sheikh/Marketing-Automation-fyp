import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CallingQueueProcessor } from './queue.processor';
import { CallingModule } from '../calling/calling.module';
@Module({
  imports: [BullModule.registerQueue({ name: 'calling' }), CallingModule],
  providers: [CallingQueueProcessor],
})
export class QueueModule {}
