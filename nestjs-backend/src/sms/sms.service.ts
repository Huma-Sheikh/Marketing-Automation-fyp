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

  async sendBulkSms(leads: any[], template: string) {
    let sent = 0, failed = 0;
    for (const lead of leads) {
      if (!lead.phone) { failed++; continue; }
      const message = template
        .replace('{{firstName}}', lead.firstName || 'there')
        .replace('{{company}}', lead.company || '');
      const ok = await this.sendSms(lead.phone, message);
      ok ? sent++ : failed++;
      await new Promise(r => setTimeout(r, 1000));
    }
    return { sent, failed };
  }
}
