import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { renderTemplate } from '../../common/utils/template.util';
import { OutreachLead } from '../queue/queue.types';

/** One SMS segment. Longer messages are truncated rather than billed as multi-part. */
const MAX_SMS_LENGTH = 160;

/** Sends campaign SMS on the platform Twilio account. Failures are logged and reported as `false`. */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(to: string, message: string): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      const client = new twilio.Twilio(
        this.config.get<string>('TWILIO_ACCOUNT_SID'),
        this.config.get<string>('TWILIO_AUTH_TOKEN'),
      );
      const msg = await client.messages.create({
        body: message.substring(0, MAX_SMS_LENGTH),
        from: this.config.get<string>('TWILIO_PHONE_NUMBER'),
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
  async sendToLead(lead: OutreachLead, template: string): Promise<boolean> {
    if (!lead?.phone) return false;
    const message = renderTemplate(template, {
      firstName: lead.firstName || 'there',
      lastName: lead.lastName || '',
      company: lead.company || '',
    });
    return this.sendSms(lead.phone, message);
  }
}
