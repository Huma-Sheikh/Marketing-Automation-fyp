import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { ConfigService } from '@nestjs/config';
import { CallingService } from './calling.service';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { User } from '../database/entities/user.entity';
import { AiService } from '../ai/ai.service';
import { PhoneNumbersService } from '../phone-numbers/phone-numbers.service';
import { pcmToWav, wavToPcm } from './audio/codec';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Stands in for the Twilio SDK so tenant-credential dials can be asserted on.
const mockTwilioCreate = jest.fn();
jest.mock('twilio', () => ({
  Twilio: jest.fn().mockImplementation(() => ({ calls: { create: mockTwilioCreate } })),
}));

const mockCallRepo = { save: jest.fn(), create: jest.fn(d => d), update: jest.fn(), findOne: jest.fn() };
const mockPhoneNumbers = { resolveDialRoute: jest.fn(), getVapiWebhookSecret: jest.fn() };
const mockLeadRepo = { update: jest.fn() };
const mockCampaignRepo = { findOne: jest.fn() };
const mockUserRepo = { findOne: jest.fn() };
const mockQueue = { add: jest.fn(), getJobs: jest.fn().mockResolvedValue([]), pause: jest.fn(), resume: jest.fn() };

const mockAiService = {
  transcribeAudio: jest.fn(),
  generateResponse: jest.fn(),
  synthesizeSpeech: jest.fn(),
  qualifyLead: jest.fn(),
};

const config = { TWILIO_PHONE_NUMBER: '+15550000000', BASE_URL: 'https://calls.example.com' };
const mockConfig = { get: jest.fn((key: string, fallback?: any) => config[key] ?? fallback) };

/** A 16 kHz WAV of non-silent audio, i.e. what the TTS service returns. */
function ttsWav(seconds = 0.5, sampleRate = 16000): Buffer {
  const samples = Math.floor(sampleRate * seconds);
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) pcm[i] = Math.round(6000 * Math.sin((2 * Math.PI * 300 * i) / sampleRate));
  return pcmToWav(pcm, sampleRate);
}

const callerAudio = (samples = 4000) => {
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) pcm[i] = i % 2 === 0 ? 5000 : -5000;
  return pcm;
};

describe('CallingService', () => {
  let service: CallingService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockAiService.synthesizeSpeech.mockResolvedValue(ttsWav());
    mockAiService.transcribeAudio.mockResolvedValue('');
    mockAiService.generateResponse.mockResolvedValue('Sure, happy to help.');
    mockAiService.qualifyLead.mockResolvedValue({ outcome: 'qualified', score: 85, notes: '' });
    mockCampaignRepo.findOne.mockResolvedValue(null);
    mockPhoneNumbers.resolveDialRoute.mockResolvedValue(null);
    mockPhoneNumbers.getVapiWebhookSecret.mockResolvedValue(null);
    mockTwilioCreate.mockResolvedValue({ sid: 'CA_TENANT' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CallingService,
        { provide: getRepositoryToken(Call), useValue: mockCallRepo },
        { provide: getRepositoryToken(Lead), useValue: mockLeadRepo },
        { provide: getRepositoryToken(Campaign), useValue: mockCampaignRepo },
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getQueueToken('calling'), useValue: mockQueue },
        { provide: ConfigService, useValue: mockConfig },
        { provide: AiService, useValue: mockAiService },
        { provide: PhoneNumbersService, useValue: mockPhoneNumbers },
      ],
    }).compile();

    service = module.get<CallingService>(CallingService);
  });

  // ─── configuration ──────────────────────────────────────────────────────────

  describe('Twilio configuration', () => {
    it('reports not configured when the SID is a placeholder', () => {
      // .env.example ships ACxxxxxxxx...; that must not be treated as real.
      expect(service.isConfigured).toBe(false);
    });

    it('refuses to dial when Twilio is not configured', async () => {
      await expect(service.initiateCall('l1', '+1555', 'c1')).rejects.toThrow('Twilio not configured');
    });
  });

  // ─── tenant caller numbers ──────────────────────────────────────────────────

  describe('initiateCall with tenant numbers', () => {
    const TENANT_SID = 'AC' + 'a'.repeat(32);

    it('still refuses when the tenant has no number and the platform has no Twilio', async () => {
      await expect(service.initiateCall('l1', '+1555', 'c1', { userId: 'u1' })).rejects.toThrow('Twilio not configured');
      expect(mockPhoneNumbers.resolveDialRoute).toHaveBeenCalledWith('u1', undefined);
    });

    it("dials a Twilio route on the tenant's own account and records which number was used", async () => {
      mockPhoneNumbers.resolveDialRoute.mockResolvedValue({
        provider: 'twilio', phoneNumberId: 'pn1', from: '+923001234567', accountSid: TENANT_SID, authToken: 'tok',
      });

      await expect(service.initiateCall('l1', '+923211234567', 'c1', { userId: 'u1', phoneNumberId: 'pn1' }))
        .resolves.toBe('CA_TENANT');

      const args = mockTwilioCreate.mock.calls[0][0];
      expect(args.from).toBe('+923001234567');
      expect(args.byoc).toBeUndefined();
      expect(mockCallRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        twilioCallSid: 'CA_TENANT', provider: 'twilio', phoneNumberId: 'pn1',
      }));
    });

    it('routes a SIP trunk number through its BYOC trunk', async () => {
      mockPhoneNumbers.resolveDialRoute.mockResolvedValue({
        provider: 'sip_trunk', phoneNumberId: 'pn2', from: '+924235761234',
        accountSid: TENANT_SID, authToken: 'tok', byocTrunkSid: 'BY' + 'b'.repeat(32),
      });

      await service.initiateCall('l1', '+923211234567', 'c1', { userId: 'u1' });

      expect(mockTwilioCreate.mock.calls[0][0]).toEqual(expect.objectContaining({
        from: '+924235761234', byoc: 'BY' + 'b'.repeat(32),
      }));
    });

    it('propagates an unusable pinned number instead of falling back to another caller ID', async () => {
      mockPhoneNumbers.resolveDialRoute.mockRejectedValue(new Error('Phone number +92300 is not verified'));
      await expect(service.initiateCall('l1', '+1', 'c1', { userId: 'u1', phoneNumberId: 'pn1' }))
        .rejects.toThrow('not verified');
      expect(mockTwilioCreate).not.toHaveBeenCalled();
    });

    it('places Vapi calls through the Vapi API and stores the Vapi call id', async () => {
      mockPhoneNumbers.resolveDialRoute.mockResolvedValue({
        provider: 'vapi', phoneNumberId: 'pn3', from: '+14155550100',
        apiKey: 'key', vapiPhoneNumberId: 'vp1', assistantId: 'as1',
      });
      mockedAxios.post.mockResolvedValue({ data: { id: 'vapi-call-1' } });

      await expect(service.initiateCall('l1', '+14155550199', 'c1', { userId: 'u1' })).resolves.toBe('vapi-call-1');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.vapi.ai/call',
        { phoneNumberId: 'vp1', assistantId: 'as1', customer: { number: '+14155550199' } },
        expect.objectContaining({ headers: { Authorization: 'Bearer key' } }),
      );
      expect(mockCallRepo.save).toHaveBeenCalledWith(expect.objectContaining({
        providerCallId: 'vapi-call-1', provider: 'vapi', phoneNumberId: 'pn3',
      }));
      expect(mockTwilioCreate).not.toHaveBeenCalled();
    });

    it("surfaces Vapi's own error message", async () => {
      mockPhoneNumbers.resolveDialRoute.mockResolvedValue({
        provider: 'vapi', phoneNumberId: 'pn3', from: '+1', apiKey: 'k', vapiPhoneNumberId: 'vp1', assistantId: 'as1',
      });
      mockedAxios.post.mockRejectedValue({ response: { data: { message: ['customer.number must be E.164'] } } });

      await expect(service.initiateCall('l1', 'bad', 'c1', { userId: 'u1' }))
        .rejects.toThrow('Vapi rejected the call: customer.number must be E.164');
    });
  });

  describe('handleVapiEvent', () => {
    const vapiCall = { id: 'call-row', leadId: 'l1', phoneNumberId: 'pn3', status: 'initiated', provider: 'vapi' };

    it('ignores events for calls this platform did not place', async () => {
      mockCallRepo.findOne.mockResolvedValue(null);
      await expect(service.handleVapiEvent({ type: 'end-of-call-report', call: { id: 'x' } })).resolves.toBe(true);
      expect(mockCallRepo.update).not.toHaveBeenCalled();
    });

    it('rejects a wrong secret when the number has one', async () => {
      mockCallRepo.findOne.mockResolvedValue(vapiCall);
      mockPhoneNumbers.getVapiWebhookSecret.mockResolvedValue('s3cret');

      await expect(service.handleVapiEvent({ type: 'end-of-call-report', call: { id: 'v1' } }, 'nope')).resolves.toBe(false);
      expect(mockCallRepo.update).not.toHaveBeenCalled();
    });

    it('qualifies the lead from an end-of-call report where the caller spoke', async () => {
      mockCallRepo.findOne.mockResolvedValue(vapiCall);
      mockPhoneNumbers.getVapiWebhookSecret.mockResolvedValue('s3cret');

      const ok = await service.handleVapiEvent({
        type: 'end-of-call-report',
        call: { id: 'v1' },
        endedReason: 'customer-ended-call',
        durationSeconds: 42.4,
        artifact: { transcript: 'AI: Hello!\nUser: Yes, tell me more.', recordingUrl: 'https://rec' },
      }, 's3cret');

      expect(ok).toBe(true);
      expect(mockAiService.qualifyLead).toHaveBeenCalledWith('AI: Hello!\nUser: Yes, tell me more.');
      expect(mockCallRepo.update).toHaveBeenCalledWith({ id: 'call-row' }, expect.objectContaining({
        status: 'completed', durationSeconds: 42, outcome: 'qualified', recordingUrl: 'https://rec',
      }));
      expect(mockLeadRepo.update).toHaveBeenCalledWith('l1', { status: 'qualified' });
    });

    it('records an unanswered call without asking the qualifier', async () => {
      mockCallRepo.findOne.mockResolvedValue(vapiCall);

      await service.handleVapiEvent({
        type: 'end-of-call-report', call: { id: 'v1' }, endedReason: 'customer-busy', artifact: { transcript: '' },
      });

      expect(mockAiService.qualifyLead).not.toHaveBeenCalled();
      expect(mockCallRepo.update).toHaveBeenCalledWith({ id: 'call-row' }, expect.objectContaining({ outcome: 'busy' }));
    });
  });

  // ─── campaign dispatch ──────────────────────────────────────────────────────

  describe('startCampaignCalls', () => {
    it('queues one job per lead that has a phone number', async () => {
      const leads = [
        { id: 'l1', phone: '+1', firstName: 'A' },
        { id: 'l2', phone: null, firstName: 'B' },
        { id: 'l3', phone: '+3', firstName: 'C' },
      ] as any;

      const result = await service.startCampaignCalls('c1', 'u1', leads, {});

      expect(result.queued).toBe(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('carries userId on the job so the worker can enforce plan limits', async () => {
      await service.startCampaignCalls('c1', 'u1', [{ id: 'l1', phone: '+1' }] as any, {});

      expect(mockQueue.add).toHaveBeenCalledWith(
        'dial-lead',
        expect.objectContaining({ userId: 'u1', campaignId: 'c1', leadId: 'l1' }),
        expect.anything(),
      );
    });

    it('reports the configured concurrency ceiling', async () => {
      const result = await service.startCampaignCalls('c1', 'u1', [], { maxConcurrentCalls: 12 });
      expect(result.maxConcurrent).toBe(12);
    });

    it('defaults the ceiling to 60 when unset', async () => {
      const result = await service.startCampaignCalls('c1', 'u1', [], {});
      expect(result.maxConcurrent).toBe(60);
    });
  });

  // ─── live stream ────────────────────────────────────────────────────────────

  describe('registerStream', () => {
    it('marks the call in-progress and starts counting it as active', async () => {
      await service.registerStream('CA1', 'l1', 'c1');

      expect(mockCallRepo.update).toHaveBeenCalledWith({ twilioCallSid: 'CA1' }, { status: 'in-progress' });
      expect(service.getActiveCallCount()).toBe(1);
    });

    it('ignores a missing callSid', async () => {
      await service.registerStream(undefined);
      expect(service.getActiveCallCount()).toBe(0);
    });
  });

  describe('buildGreeting', () => {
    it('returns mu-law audio for the default greeting', async () => {
      await service.registerStream('CA1', 'l1', 'c1');

      const audio = await service.buildGreeting('CA1');

      expect(Buffer.isBuffer(audio)).toBe(true);
      expect(audio.length).toBeGreaterThan(0);
      expect(mockAiService.synthesizeSpeech).toHaveBeenCalledWith(expect.stringContaining('Hello'));
    });

    it('prefers the greeting configured on the campaign', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'c1', settings: { greeting: 'Hi, it is Sam from Acme.' } });
      await service.registerStream('CA1', 'l1', 'c1');

      await service.buildGreeting('CA1');

      expect(mockAiService.synthesizeSpeech).toHaveBeenCalledWith('Hi, it is Sam from Acme.');
    });

    it('returns null instead of noise when TTS is unavailable', async () => {
      mockAiService.synthesizeSpeech.mockResolvedValue(Buffer.alloc(0));
      await service.registerStream('CA1');

      expect(await service.buildGreeting('CA1')).toBeNull();
    });

    it('returns null when TTS returns audio we cannot decode', async () => {
      mockAiService.synthesizeSpeech.mockResolvedValue(Buffer.from('not a wav'));
      await service.registerStream('CA1');

      expect(await service.buildGreeting('CA1')).toBeNull();
    });
  });

  // ─── per-tenant sales profile ───────────────────────────────────────────────

  describe('resolveCompany (per-tenant voice agent)', () => {
    const PROFILE = { name: 'Bright Smile Dental', pricing: 'whitening from 199 pounds' };

    beforeEach(() => {
      mockAiService.transcribeAudio.mockResolvedValue('How much is it?');
    });

    it('passes the onboarding profile from the campaign owner to the LLM', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'C1', userId: 'U1', settings: {} });
      mockUserRepo.findOne.mockResolvedValue({ id: 'U1', salesProfile: PROFILE });
      await service.registerStream('CA1', 'L1', 'C1');

      await service.handleUtterance('CA1', callerAudio());

      expect(mockAiService.generateResponse).toHaveBeenCalledWith(
        expect.anything(), 150, PROFILE);
    });

    it('lets a campaign override the tenant default', async () => {
      const override = { name: 'Summer Promo Co' };
      mockCampaignRepo.findOne.mockResolvedValue({
        id: 'C1', userId: 'U1', settings: { company: override } });
      mockUserRepo.findOne.mockResolvedValue({ id: 'U1', salesProfile: PROFILE });
      await service.registerStream('CA1', 'L1', 'C1');

      await service.handleUtterance('CA1', callerAudio());

      expect(mockAiService.generateResponse).toHaveBeenCalledWith(
        expect.anything(), 150, override);
      expect(mockUserRepo.findOne).not.toHaveBeenCalled();
    });

    it('resolves once per call, not once per turn', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'C1', userId: 'U1', settings: {} });
      mockUserRepo.findOne.mockResolvedValue({ id: 'U1', salesProfile: PROFILE });
      await service.registerStream('CA1', 'L1', 'C1');

      await service.handleUtterance('CA1', callerAudio());
      await service.handleUtterance('CA1', callerAudio());
      await service.handleUtterance('CA1', callerAudio());

      // Three turns, one lookup: the 8s budget cannot absorb a query per turn.
      expect(mockUserRepo.findOne).toHaveBeenCalledTimes(1);
      expect(mockAiService.generateResponse).toHaveBeenCalledTimes(3);
    });

    it('sends null when the tenant has no profile, and does not re-query', async () => {
      mockCampaignRepo.findOne.mockResolvedValue({ id: 'C1', userId: 'U1', settings: {} });
      mockUserRepo.findOne.mockResolvedValue({ id: 'U1', salesProfile: null });
      await service.registerStream('CA1', 'L1', 'C1');

      await service.handleUtterance('CA1', callerAudio());
      await service.handleUtterance('CA1', callerAudio());

      expect(mockAiService.generateResponse).toHaveBeenCalledWith(
        expect.anything(), 150, null);
      expect(mockUserRepo.findOne).toHaveBeenCalledTimes(1);
    });

    it('falls back to the generic script when the lookup throws', async () => {
      mockCampaignRepo.findOne.mockRejectedValue(new Error('db down'));
      await service.registerStream('CA1', 'L1', 'C1');

      const audio = await service.handleUtterance('CA1', callerAudio());

      // The caller's turn must still be answered rather than dropped.
      expect(mockAiService.generateResponse).toHaveBeenCalledWith(
        expect.anything(), 150, null);
      expect(audio.length).toBeGreaterThan(0);
    });
  });

  // ─── conversation turn ──────────────────────────────────────────────────────

  describe('handleUtterance', () => {
    it('transcribes at 16 kHz even though Twilio delivers 8 kHz', async () => {
      mockAiService.transcribeAudio.mockResolvedValue('Yes I am interested');
      await service.registerStream('CA1');

      await service.handleUtterance('CA1', callerAudio(4000)); // 0.5 s at 8 kHz

      const wavSent = mockAiService.transcribeAudio.mock.calls[0][0];
      const decoded = wavToPcm(wavSent);
      expect(decoded.sampleRate).toBe(16000);
      expect(decoded.pcm.length).toBe(8000); // upsampled
    });

    it('returns spoken audio for the generated reply', async () => {
      mockAiService.transcribeAudio.mockResolvedValue('Tell me more');
      await service.registerStream('CA1');

      const audio = await service.handleUtterance('CA1', callerAudio());

      expect(mockAiService.generateResponse).toHaveBeenCalled();
      expect(audio.length).toBeGreaterThan(0);
    });

    it('stays silent when the transcript is empty', async () => {
      mockAiService.transcribeAudio.mockResolvedValue('');
      await service.registerStream('CA1');

      expect(await service.handleUtterance('CA1', callerAudio())).toBeNull();
      expect(mockAiService.generateResponse).not.toHaveBeenCalled();
    });

    it('accumulates both sides of the conversation for the qualifier', async () => {
      mockAiService.transcribeAudio.mockResolvedValue('I am interested');
      await service.registerStream('CA1');

      await service.handleUtterance('CA1', callerAudio());
      await service.handleCallComplete('CA1', 30);

      const transcript = mockAiService.qualifyLead.mock.calls[0][0];
      expect(transcript).toContain('Lead: I am interested');
      expect(transcript).toContain('Agent: Sure, happy to help.');
    });

    it('returns null for an unknown call instead of throwing', async () => {
      expect(await service.handleUtterance('nope', callerAudio())).toBeNull();
    });

    it('swallows STT failures so the call survives', async () => {
      mockAiService.transcribeAudio.mockRejectedValue(new Error('STT down'));
      await service.registerStream('CA1');

      expect(await service.handleUtterance('CA1', callerAudio())).toBeNull();
    });
  });

  // ─── call completion ────────────────────────────────────────────────────────

  describe('handleCallComplete', () => {
    it('writes the transcript, duration and outcome', async () => {
      mockAiService.transcribeAudio.mockResolvedValue('Sounds good');
      await service.registerStream('CA1', 'l1', 'c1');
      await service.handleUtterance('CA1', callerAudio());

      await service.handleCallComplete('CA1', 42);

      expect(mockCallRepo.update).toHaveBeenCalledWith(
        { twilioCallSid: 'CA1' },
        expect.objectContaining({ status: 'completed', durationSeconds: 42, outcome: 'qualified' }),
      );
      expect(mockLeadRepo.update).toHaveBeenCalledWith('l1', { status: 'qualified' });
    });

    it('records no-answer when the caller never spoke', async () => {
      await service.registerStream('CA1', 'l1', 'c1');
      await service.buildGreeting('CA1'); // agent talked, caller did not

      await service.handleCallComplete('CA1', 8);

      expect(mockAiService.qualifyLead).not.toHaveBeenCalled();
      expect(mockCallRepo.update).toHaveBeenCalledWith(
        { twilioCallSid: 'CA1' },
        expect.objectContaining({ outcome: 'no-answer' }),
      );
    });

    it('is idempotent - stop and socket-close both firing settle the call once', async () => {
      await service.registerStream('CA1', 'l1', 'c1');
      mockCallRepo.update.mockClear();

      await service.handleCallComplete('CA1', 10);
      await service.handleCallComplete('CA1', 0);

      const completions = mockCallRepo.update.mock.calls.filter(
        c => c[1]?.status === 'completed',
      );
      expect(completions).toHaveLength(1);
    });

    it('falls back to elapsed time when Twilio reports no duration', async () => {
      await service.registerStream('CA1', 'l1', 'c1');

      await service.handleCallComplete('CA1', 0);

      const update = mockCallRepo.update.mock.calls.find(c => c[1]?.status === 'completed')[1];
      expect(update.durationSeconds).toBeGreaterThanOrEqual(0);
    });

    it('releases the active-call slot', async () => {
      await service.registerStream('CA1', 'l1', 'c1');
      expect(service.getActiveCallCount()).toBe(1);

      await service.handleCallComplete('CA1', 5);

      expect(service.getActiveCallCount()).toBe(0);
    });
  });

  // ─── status webhook ─────────────────────────────────────────────────────────

  describe('recordStatusCallback', () => {
    it('settles a call that never reached the media stream', async () => {
      mockCallRepo.findOne.mockResolvedValue({ twilioCallSid: 'CA9', status: 'initiated', leadId: 'l9' });

      await service.recordStatusCallback('CA9', 'no-answer', 0);

      expect(mockCallRepo.update).toHaveBeenCalledWith(
        { twilioCallSid: 'CA9' },
        expect.objectContaining({ status: 'no-answer', outcome: 'no-answer' }),
      );
      expect(mockLeadRepo.update).toHaveBeenCalledWith('l9', { status: 'no-answer' });
    });

    it('passes non-terminal statuses straight through', async () => {
      await service.recordStatusCallback('CA9', 'ringing');

      expect(mockCallRepo.update).toHaveBeenCalledWith({ twilioCallSid: 'CA9' }, { status: 'ringing' });
    });

    it('does not overwrite the richer outcome the media stream already wrote', async () => {
      mockCallRepo.findOne.mockResolvedValue({ twilioCallSid: 'CA9', status: 'completed', outcome: 'qualified' });
      mockCallRepo.update.mockClear();

      await service.recordStatusCallback('CA9', 'completed', 30);

      expect(mockCallRepo.update).not.toHaveBeenCalled();
    });

    it('ignores an empty callSid', async () => {
      await service.recordStatusCallback('', 'completed');
      expect(mockCallRepo.update).not.toHaveBeenCalled();
    });
  });

  // ─── stopping ───────────────────────────────────────────────────────────────

  describe('stopCampaign', () => {
    it('removes only the jobs belonging to that campaign', async () => {
      const mine = { data: { campaignId: 'c1' }, remove: jest.fn() };
      const theirs = { data: { campaignId: 'c2' }, remove: jest.fn() };
      mockQueue.getJobs.mockResolvedValue([mine, theirs]);

      await service.stopCampaign('c1');

      expect(mine.remove).toHaveBeenCalled();
      expect(theirs.remove).not.toHaveBeenCalled();
    });

    it('does not pause the shared queue, which would stall other tenants', async () => {
      mockQueue.getJobs.mockResolvedValue([]);

      await service.stopCampaign('c1');

      expect(mockQueue.pause).not.toHaveBeenCalled();
    });
  });
});
