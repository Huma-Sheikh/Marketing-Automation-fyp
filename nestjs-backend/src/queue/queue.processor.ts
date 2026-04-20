import { Process, Processor, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { Job } from 'bull';
import { Logger } from '@nestjs/common';
import { CallingService } from '../calling/calling.service';

@Processor('calling')
export class CallingQueueProcessor {
  private readonly logger = new Logger(CallingQueueProcessor.name);
  constructor(private callingService: CallingService) {}

  @Process({ name: 'dial-lead', concurrency: 60 })
  async processDial(job: Job<{ leadId: string; phoneNumber: string; campaignId: string; settings: any }>) {
    const { leadId, phoneNumber, campaignId, settings } = job.data;
    const hour = new Date().getHours();
    const start = settings?.callStartHour || 9;
    const end = settings?.callEndHour || 18;
    if (hour < start || hour >= end) {
      this.logger.log(`Outside calling hours (${hour}h). Delaying.`);
      return { skipped: true, reason: 'outside_hours' };
    }
    try {
      const callSid = await this.callingService.initiateCall(leadId, phoneNumber, campaignId);
      return { callSid, status: 'initiated' };
    } catch (err) {
      this.logger.error(`Failed to dial ${phoneNumber}: ${err.message}`);
      throw err;
    }
  }

  @OnQueueActive() onActive(job: Job) { this.logger.debug(`Dialing ${job.data.phoneNumber}`); }
  @OnQueueCompleted() onCompleted(job: Job) { this.logger.debug(`Call job ${job.id} complete`); }
  @OnQueueFailed() onFailed(job: Job, err: Error) { this.logger.error(`Call job ${job.id} failed: ${err.message}`); }
}
