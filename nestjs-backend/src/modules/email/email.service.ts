import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { escapeHtml } from '../../common/utils/escape.util';
import { renderTemplate } from '../../common/utils/template.util';
import { OutreachLead } from '../queue/queue.types';

const DEFAULT_FROM = 'noreply@example.com';

/** Sends campaign email through Resend. Failures are logged and reported as `false`, never thrown. */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendCampaignEmail(options: {
    to: string; leadName: string; subject: string; template: string; variables?: Record<string, string>;
  }): Promise<boolean> {
    try {
      // Imported lazily so the app starts even when the resend package or key is absent.
      const { Resend } = await import('resend');
      const resend = new Resend(this.config.get<string>('RESEND_API_KEY'));
      // Variable values come from scraped lead data, so they are escaped; the
      // template itself is written by the tenant and kept as-is.
      const body = renderTemplate(options.template, options.variables ?? {}, escapeHtml);
      await resend.emails.send({
        from: this.config.get<string>('EMAIL_FROM') || DEFAULT_FROM,
        to: options.to,
        subject: options.subject,
        html: `<div style="font-family:Arial;max-width:600px;margin:0 auto"><div style="background:#1F3864;color:white;padding:20px;text-align:center"><h2>Marketing Platform</h2></div><div style="padding:30px">${body.replace(/\n/g, '<br>')}</div></div>`,
      });
      this.logger.log(`Email sent to ${options.to}`);
      return true;
    } catch (err) {
      this.logger.error(`Email failed to ${options.to}: ${err.message}`);
      return false;
    }
  }

  /**
   * Send one campaign email to one lead. Bulk sending is driven by the `email`
   * queue (see queue/outreach.processor.ts) rather than a loop with sleeps in
   * the middle of an HTTP request.
   */
  async sendToLead(lead: OutreachLead, subject: string, template: string): Promise<boolean> {
    if (!lead?.email) return false;
    return this.sendCampaignEmail({
      to: lead.email,
      leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
      subject,
      template,
      variables: {
        firstName: lead.firstName || 'there',
        lastName: lead.lastName || '',
        company: lead.company || 'your company',
        jobTitle: lead.jobTitle || '',
      },
    });
  }
}
