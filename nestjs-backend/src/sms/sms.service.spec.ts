import { Test, TestingModule } from '@nestjs/testing';
import { SmsService } from './sms.service';

const mockMessagesCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });

jest.mock('twilio', () => ({
  Twilio: jest.fn().mockImplementation(() => ({
    messages: { create: mockMessagesCreate },
  })),
}));

describe('SmsService', () => {
  let service: SmsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SmsService],
    }).compile();

    service = module.get<SmsService>(SmsService);
    jest.clearAllMocks();
    mockMessagesCreate.mockResolvedValue({ sid: 'SM123' });
  });

  // ─── sendSms ──────────────────────────────────────────────────────────────────

  describe('sendSms', () => {
    it('returns true when SMS sent successfully', async () => {
      const result = await service.sendSms('+971501234567', 'Hello!');

      expect(result).toBe(true);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
    });

    it('passes correct to, from, body to Twilio', async () => {
      process.env.TWILIO_PHONE_NUMBER = '+12025551234';

      await service.sendSms('+44111', 'Test message');

      expect(mockMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '+44111', from: '+12025551234' }),
      );
    });

    it('truncates message body to 160 characters', async () => {
      const longMsg = 'A'.repeat(200);

      await service.sendSms('+1', longMsg);

      const call = mockMessagesCreate.mock.calls[0][0];
      expect(call.body.length).toBe(160);
    });

    it('returns false when Twilio throws', async () => {
      mockMessagesCreate.mockRejectedValueOnce(new Error('Twilio error'));

      const result = await service.sendSms('+1', 'fail');

      expect(result).toBe(false);
    });
  });

  // ─── sendToLead ───────────────────────────────────────────────────────────────

  describe('sendToLead', () => {
    it('renders the template and reports success', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM1' });

      const ok = await service.sendToLead(
        { phone: '+1', firstName: 'John', company: 'Acme' },
        'Hi {{firstName}} from {{company}}',
      );

      expect(ok).toBe(true);
      expect(mockMessagesCreate.mock.calls[0][0].body).toContain('Hi John from Acme');
    });

    it('reports failure when Twilio rejects', async () => {
      mockMessagesCreate.mockRejectedValueOnce(new Error('fail'));

      expect(await service.sendToLead({ phone: '+2', firstName: 'Bob' }, 'Hi')).toBe(false);
    });

    it('returns false without calling Twilio when the lead has no phone', async () => {
      expect(await service.sendToLead({ phone: null, firstName: 'No Phone' }, 'Hello')).toBe(false);
      expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it('returns false for a null lead rather than throwing', async () => {
      expect(await service.sendToLead(null, 'Hello')).toBe(false);
    });

    it('substitutes {{firstName}} with "there" when missing', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM1' });

      await service.sendToLead({ phone: '+1', firstName: null, company: '' }, 'Hello {{firstName}}');

      expect(mockMessagesCreate.mock.calls[0][0].body).toContain('Hello there');
    });

    it('replaces every occurrence of a placeholder, not just the first', async () => {
      mockMessagesCreate.mockResolvedValueOnce({ sid: 'SM1' });

      await service.sendToLead({ phone: '+1', firstName: 'Ann' }, '{{firstName}}, hi {{firstName}}');

      expect(mockMessagesCreate.mock.calls[0][0].body).toBe('Ann, hi Ann');
    });
  });
});
