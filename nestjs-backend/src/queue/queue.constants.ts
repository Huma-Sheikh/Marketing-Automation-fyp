/**
 * Provider rate limits, expressed once so the queue definition and the module
 * that enqueues jobs cannot drift apart. These replace the hard-coded sleeps
 * that used to sit inside the campaign request handler.
 */
export const OUTREACH_QUEUES = [
  // ~6/s matches the old 150 ms gap between sends and stays well inside Resend's
  // published limits.
  { name: 'email', limiter: { max: 6, duration: 1000 } },
  // Twilio recommends 1 message/second per long code.
  { name: 'sms', limiter: { max: 1, duration: 1000 } },
];
