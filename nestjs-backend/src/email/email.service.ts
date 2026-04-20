import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  async sendCampaignEmail(options: {
    to: string; leadName: string; subject: string; template: string; variables?: Record<string, string>;
  }): Promise<boolean> {
    try {
      // Dynamically import resend to avoid startup errors if key not set
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      let body = options.template;
      if (options.variables) {
        for (const [k, v] of Object.entries(options.variables)) {
          body = body.replace(new RegExp(`{{${k}}}`, 'g'), v);
        }
      }
      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'noreply@example.com',
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

  async sendBulkEmails(leads: any[], subject: string, template: string) {
    let sent = 0, failed = 0;
    for (const lead of leads) {
      if (!lead.email) { failed++; continue; }
      const ok = await this.sendCampaignEmail({
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
      ok ? sent++ : failed++;
      await new Promise(r => setTimeout(r, 150));
    }
    return { sent, failed };
  }
}
