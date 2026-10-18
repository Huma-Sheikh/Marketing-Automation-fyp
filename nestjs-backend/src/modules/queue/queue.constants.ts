import { JobOptions } from 'bull';

/** Bull queue names. Shared by every module that enqueues or processes jobs. */
export const QUEUES = {
  calling: 'calling',
  email: 'email',
  sms: 'sms',
} as const;

/** Job names within those queues. */
export const JOBS = {
  dialLead: 'dial-lead',
  sendEmail: 'send-email',
  sendSms: 'send-sms',
} as const;

/** Upper bound on simultaneous outbound calls per process (and the processor's concurrency). */
export const DEFAULT_MAX_CONCURRENT_CALLS = 60;

/** How long a dial waits before re-checking when the concurrency ceiling is reached. */
export const CONCURRENCY_RETRY_MS = 5_000;

/** Default calling window, server-local hours [start, end). Campaign settings can override. */
export const DEFAULT_CALL_START_HOUR = 9;
export const DEFAULT_CALL_END_HOUR = 18;

/** Retry policy for dial jobs. */
export const DIAL_JOB_OPTS: JobOptions = { attempts: 2, backoff: 30_000, removeOnComplete: true };

/** Retry policy for email/SMS jobs. */
export const OUTREACH_JOB_OPTS: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 60_000 },
  removeOnComplete: true,
};

/**
 * Provider rate limits, expressed once so the queue definition and the module
 * that enqueues jobs cannot drift apart.
 */
export const OUTREACH_QUEUES = [
  // ~6/s stays well inside Resend's published limits.
  { name: QUEUES.email, limiter: { max: 6, duration: 1000 } },
  // Twilio recommends 1 message/second per long code.
  { name: QUEUES.sms, limiter: { max: 1, duration: 1000 } },
];
