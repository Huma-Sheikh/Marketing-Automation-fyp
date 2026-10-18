import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { CallingQueueProcessor } from './calling.processor';
import { EmailQueueProcessor, SmsQueueProcessor } from './outreach.processor';
import { CallingModule } from '../calling/calling.module';
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';
import { SmsModule } from '../sms/sms.module';
import { OUTREACH_QUEUES, QUEUES } from './queue.constants';

/** Registers every Bull queue and the processors that work them. */

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUES.calling }, ...OUTREACH_QUEUES),
    CallingModule,
    BillingModule,
    EmailModule,
    SmsModule,
  ],
  providers: [CallingQueueProcessor, EmailQueueProcessor, SmsQueueProcessor],
})
export class QueueModule {}
