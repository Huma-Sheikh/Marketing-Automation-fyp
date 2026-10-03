import { Injectable, Logger } from '@nestjs/common';
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      const twilio = require('twilio');
      const client = new twilio.Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const msg = await client.messages.create({
        body: message.substring(0, 160),
        from: process.env.TWILIO_PHONE_NUMBER,
        to,
      });
      this.logger.log(`SMS sent to ${to}: ${msg.sid}`);
      return true;
    } catch (err) {
      this.logger.error(`SMS failed to ${to}: ${err.message}`);
      return false;
    }
  }

  /**
   * Render and send one campaign SMS. Bulk sending is driven by the `sms` queue
   * (see queue/outreach.processor.ts), which applies the rate limit that used to
   * be a 1-second sleep inside the request handler.
   */
  async sendToLead(lead: any, template: string): Promise<boolean> {
    if (!lead?.phone) return false;
    const message = template
      .replace(/{{firstName}}/g, lead.firstName || 'there')
      .replace(/{{lastName}}/g, lead.lastName || '')
      .replace(/{{company}}/g, lead.company || '');
    return this.sendSms(lead.phone, message);
  }
}
