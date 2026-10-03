import { Test, TestingModule } from '@nestjs/testing';
import { EmailService } from './email.service';

// Mock resend module before import
const mockSend = jest.fn().mockResolvedValue({ id: 'email-1' });
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockSend },
  })),
}));

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EmailService],
    }).compile();

    service = module.get<EmailService>(EmailService);
    jest.clearAllMocks();
    mockSend.mockResolvedValue({ id: 'email-1' });
  });

  // ─── sendCampaignEmail ────────────────────────────────────────────────────────

  describe('sendCampaignEmail', () => {
    it('returns true when email is sent successfully', async () => {
      const result = await service.sendCampaignEmail({
        to: 'test@example.com',
        leadName: 'John Doe',
        subject: 'Hello',
        template: 'Hi there',
      });

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('calls resend.emails.send with correct to, subject, html', async () => {
      await service.sendCampaignEmail({
        to: 'lead@test.com',
        leadName: 'Alice',
        subject: 'Quick question',
        template: 'Hi Alice',
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('lead@test.com');
      expect(call.subject).toBe('Quick question');
      expect(call.html).toContain('Hi Alice');
    });

    it('substitutes template variables in the email body', async () => {
      await service.sendCampaignEmail({
        to: 'x@x.com',
        leadName: 'Bob',
        subject: 'Outreach',
        template: 'Hi {{firstName}}, working at {{company}}?',
        variables: { firstName: 'Bob', company: 'Acme' },
      });

      const call = mockSend.mock.calls[0][0];
      expect(call.html).toContain('Hi Bob, working at Acme?');
      expect(call.html).not.toContain('{{firstName}}');
      expect(call.html).not.toContain('{{company}}');
    });

    it('returns false when resend throws an error', async () => {
      mockSend.mockRejectedValueOnce(new Error('API error'));

      const result = await service.sendCampaignEmail({
        to: 'fail@test.com',
        leadName: 'Error User',
        subject: 'Test',
        template: 'Hello',
      });

      expect(result).toBe(false);
    });

    it('uses default EMAIL_FROM when env not set', async () => {
      const oldEnv = process.env.EMAIL_FROM;
      delete process.env.EMAIL_FROM;

      await service.sendCampaignEmail({ to: 'a@b.com', leadName: 'X', subject: 'S', template: 'T' });

      const call = mockSend.mock.calls[0][0];
      expect(call.from).toBe('noreply@example.com');

      process.env.EMAIL_FROM = oldEnv;
    });
  });

  // ─── sendToLead ───────────────────────────────────────────────────────────────

  describe('sendToLead', () => {
    it('sends to the lead and reports success', async () => {
      mockSend.mockResolvedValueOnce({ id: '1' });

      const ok = await service.sendToLead(
        { email: 'a@a.com', firstName: 'Alice', lastName: 'A', company: 'Co', jobTitle: 'CEO' },
        'Subject',
        'Hello {{firstName}}',
      );

      expect(ok).toBe(true);
      expect(mockSend.mock.calls[0][0].html).toContain('Hello Alice');
    });

    it('reports failure when the provider rejects', async () => {
      mockSend.mockRejectedValueOnce(new Error('fail'));

      expect(await service.sendToLead({ email: 'b@b.com' }, 'Sub', 'Body')).toBe(false);
    });

    it('returns false without calling the provider when the lead has no email', async () => {
      expect(await service.sendToLead({ email: null, firstName: 'No Email' }, 'Sub', 'Body')).toBe(false);
      expect(mockSend).not.toHaveBeenCalled();
    });

    it('returns false for a null lead rather than throwing', async () => {
      expect(await service.sendToLead(null, 'Sub', 'Body')).toBe(false);
    });

    it('substitutes firstName with "there" when missing', async () => {
      mockSend.mockResolvedValueOnce({ id: '1' });

      await service.sendToLead(
        { email: 'x@x.com', firstName: null, lastName: '', company: '', jobTitle: '' },
        'Hi',
        'Hello {{firstName}}',
      );

      expect(mockSend.mock.calls[0][0].html).toContain('Hello there');
    });

    it('falls back to "your company" when the lead has no company', async () => {
      mockSend.mockResolvedValueOnce({ id: '1' });

      await service.sendToLead({ email: 'x@x.com', firstName: 'Zed' }, 'Hi', 'For {{company}}');

      expect(mockSend.mock.calls[0][0].html).toContain('For your company');
    });
  });
});
