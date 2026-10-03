import { InjectQueue, OnQueueActive, OnQueueCompleted, OnQueueFailed, Process, Processor } from '@nestjs/bull';
import { Job, Queue } from 'bull';
import { Logger } from '@nestjs/common';
import { CallingService, DEFAULT_MAX_CONCURRENT_CALLS, DialJobData } from '../calling/calling.service';
import { BillingService } from '../billing/billing.service';

/** How long to wait before re-checking when we are at the concurrency ceiling. */
const CONCURRENCY_RETRY_MS = 5_000;

@Processor('calling')
export class CallingQueueProcessor {
  private readonly logger = new Logger(CallingQueueProcessor.name);

  constructor(
    @InjectQueue('calling') private readonly callingQueue: Queue,
    private readonly callingService: CallingService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Milliseconds until the next calling window opens. Hours are evaluated in the
   * server's local timezone — set TZ on the container to the tenant's region, or
   * carry a timezone in campaign settings if you need per-campaign windows.
   */
  private msUntilWindow(startHour: number, endHour: number, now = new Date()): number {
    const next = new Date(now);
    next.setMinutes(0, 0, 0);

    if (now.getHours() < startHour) {
      next.setHours(startHour);
    } else {
      // Past the end of today's window - the next opening is tomorrow morning.
      next.setDate(next.getDate() + 1);
      next.setHours(startHour);
    }
    return Math.max(next.getTime() - now.getTime(), 60_000);
  }

  /** Re-queue this job to run later instead of dropping it. */
  private async reschedule(job: Job<DialJobData>, delay: number) {
    await this.callingQueue.add('dial-lead', job.data, {
      delay,
      attempts: job.opts.attempts ?? 2,
      backoff: job.opts.backoff ?? 30_000,
      removeOnComplete: true,
    });
  }

  @Process({ name: 'dial-lead', concurrency: DEFAULT_MAX_CONCURRENT_CALLS })
  async processDial(job: Job<DialJobData>) {
    const { leadId, phoneNumber, campaignId, userId, settings } = job.data;

    // ── Calling hours ─────────────────────────────────────────────────────────
    // Previously this returned `{ skipped: true }`, and because jobs are added
    // with removeOnComplete the lead was then silently dropped and never called.
    const startHour = settings?.callStartHour ?? 9;
    const endHour = settings?.callEndHour ?? 18;
    const hour = new Date().getHours();
    if (hour < startHour || hour >= endHour) {
      const delay = this.msUntilWindow(startHour, endHour);
      this.logger.log(`Outside calling hours (${hour}h) - rescheduling ${phoneNumber} in ${Math.round(delay / 60000)}min`);
      await this.reschedule(job, delay);
      return { rescheduled: true, reason: 'outside_hours', delay };
    }

    // ── Plan limits ───────────────────────────────────────────────────────────
    // Enforced here rather than at campaign start, so a plan that runs out
    // mid-campaign stops dialling instead of blowing through its quota.
    if (userId && !(await this.billingService.canMakeCall(userId))) {
      this.logger.warn(`Call quota exhausted for user ${userId} - dropping remaining dials`);
      return { skipped: true, reason: 'quota_exceeded' };
    }

    // ── Concurrency ceiling ───────────────────────────────────────────────────
    // The @Process concurrency is a fixed compile-time value; this honours the
    // per-campaign maxConcurrentCalls setting on top of it.
    const maxConcurrent = settings?.maxConcurrentCalls || DEFAULT_MAX_CONCURRENT_CALLS;
    if (this.callingService.getActiveCallCount() >= maxConcurrent) {
      this.logger.debug(`At concurrency ceiling (${maxConcurrent}) - deferring ${phoneNumber}`);
      await this.reschedule(job, CONCURRENCY_RETRY_MS);
      return { rescheduled: true, reason: 'at_capacity' };
    }

    try {
      const callSid = await this.callingService.initiateCall(leadId, phoneNumber, campaignId, {
        userId,
        phoneNumberId: settings?.phoneNumberId,
      });
      if (userId) await this.billingService.incrementCallCount(userId);
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
