import { OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { SmsService } from '../sms/sms.service';

export interface EmailJobData {
  lead: any;
  subject: string;
  template: string;
  campaignId: string;
}

export interface SmsJobData {
  lead: any;
  template: string;
  campaignId: string;
}

/**
 * Email and SMS used to be sent inline inside `POST /campaigns/:id/start`, with
 * a 150 ms (email) / 1000 ms (SMS) sleep between each lead — a 1000-lead SMS
 * campaign meant a 17-minute HTTP request that any proxy would time out. Both
 * now run as queue jobs; the per-second rate limits live on the queue
 * definitions in queue.module.ts.
 */
@Processor('email')
export class EmailQueueProcessor {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(private readonly emailService: EmailService) {}

  @Process({ name: 'send-email', concurrency: 5 })
  async send(job: Job<EmailJobData>) {
    const { lead, subject, template } = job.data;
    const sent = await this.emailService.sendToLead(lead, subject, template);
    // Throwing lets Bull apply the configured retry/backoff instead of silently
    // recording a failure nobody sees.
    if (!sent) throw new Error(`Email to ${lead?.email ?? 'unknown'} failed`);
    return { sent: true };
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.warn(`Email job ${job.id} failed: ${err.message}`);
  }
}

@Processor('sms')
export class SmsQueueProcessor {
  private readonly logger = new Logger(SmsQueueProcessor.name);

  constructor(private readonly smsService: SmsService) {}

  @Process({ name: 'send-sms', concurrency: 3 })
  async send(job: Job<SmsJobData>) {
    const { lead, template } = job.data;
    const sent = await this.smsService.sendToLead(lead, template);
    if (!sent) throw new Error(`SMS to ${lead?.phone ?? 'unknown'} failed`);
    return { sent: true };
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.warn(`SMS job ${job.id} failed: ${err.message}`);
  }
}
