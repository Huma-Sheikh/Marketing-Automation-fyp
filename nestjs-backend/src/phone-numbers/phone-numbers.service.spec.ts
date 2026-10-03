import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import axios from 'axios';
import { PhoneNumbersService } from './phone-numbers.service';
import { PhoneNumber } from '../database/entities/phone-number.entity';
import { CredentialCipher } from './credential-cipher';
import { normalisePhoneNumber } from './providers';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockTwilio = {
  incomingPhoneNumbers: { list: jest.fn() },
  outgoingCallerIds: { list: jest.fn() },
  voice: { v1: { byocTrunks: jest.fn() } },
};
jest.mock('twilio', () => ({ Twilio: jest.fn().mockImplementation(() => mockTwilio) }));

const SECRET = 'x'.repeat(48);
const TENANT_SID = 'AC' + '1'.repeat(32);
const BYOC_SID = 'BY' + '2'.repeat(32);

/** An in-memory stand-in for the TypeORM repository, enough for this service. */
function memoryRepo() {
  let rows: any[] = [];
  let seq = 0;
  const matches = (row: any, where: any = {}) => Object.entries(where).every(([k, v]) => row[k] === v);
  return {
    rows: () => rows,
    reset: () => { rows = []; seq = 0; },
    create: jest.fn((d: any) => ({ ...d })),
    save: jest.fn(async (d: any) => {
      if (!d.id) { d.id = `pn${++seq}`; d.createdAt = new Date(2026, 0, seq); rows.push(d); }
      else rows = rows.map(r => (r.id === d.id ? { ...r, ...d } : r));
      return { ...d };
    }),
    find: jest.fn(async ({ where }: any) => rows.filter(r => matches(r, where)).map(r => ({ ...r }))),
    findOne: jest.fn(async ({ where }: any) => { const r = rows.find(x => matches(x, where)); return r ? { ...r } : null; }),
    count: jest.fn(async ({ where }: any) => rows.filter(r => matches(r, where)).length),
    update: jest.fn(async (where: any, patch: any) => {
      rows = rows.map(r => (matches(r, where) ? { ...r, ...patch } : r));
      return { affected: 1 };
    }),
    delete: jest.fn(async (where: any) => { rows = rows.filter(r => !matches(r, where)); return { affected: 1 }; }),
  };
}

describe('normalisePhoneNumber', () => {
  it.each([
    ['+923001234567', '+923001234567'],
    ['0300 1234567', '+923001234567'],
    ['0300-123-4567', '+923001234567'],
    ['00923001234567', '+923001234567'],
    ['923001234567', '+923001234567'],
    ['042 35761234', '+924235761234'],
    ['+1 (415) 555-0100', '+14155550100'],
  ])('%s -> %s', (raw, expected) => expect(normalisePhoneNumber(raw)).toBe(expected));

  it.each(['', 'abc', '12345', '+0123456789'])('rejects %p', raw => expect(normalisePhoneNumber(raw)).toBeNull());
});

describe('CredentialCipher', () => {
  it('round-trips and never stores plaintext', () => {
    const cipher = new CredentialCipher(SECRET);
    const payload = cipher.encrypt({ authToken: 'super-secret-token' });
    expect(payload).not.toContain('super-secret-token');
    expect(cipher.decrypt(payload)).toEqual({ authToken: 'super-secret-token' });
  });

  it('fails closed under a different key or a tampered payload', () => {
    const payload = new CredentialCipher(SECRET).encrypt({ a: 'b' });
    expect(() => new CredentialCipher('y'.repeat(48)).decrypt(payload)).toThrow();
    const tampered = payload.slice(0, -4) + (payload.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => new CredentialCipher(SECRET).decrypt(tampered)).toThrow();
  });
});

describe('PhoneNumbersService', () => {
  let service: PhoneNumbersService;
  const repo = memoryRepo();
  const config: Record<string, string> = { JWT_SECRET: SECRET, BASE_URL: 'https://calls.example.com/' };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo.reset();
    mockTwilio.incomingPhoneNumbers.list.mockResolvedValue([]);
    mockTwilio.outgoingCallerIds.list.mockResolvedValue([]);
    mockTwilio.voice.v1.byocTrunks.mockReturnValue({ fetch: jest.fn().mockResolvedValue({ sid: BYOC_SID, friendlyName: 'Jazz SIP' }) });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PhoneNumbersService,
        { provide: getRepositoryToken(PhoneNumber), useValue: repo },
        { provide: ConfigService, useValue: { get: jest.fn((k: string, d?: any) => config[k] ?? d) } },
      ],
    }).compile();
    service = module.get(PhoneNumbersService);
  });

  const attachJazzCallerId = () => service.create('u1', {
    carrier: 'jazz', provider: 'twilio', number: '0300 1234567', label: 'Sales line',
    credentials: { accountSid: TENANT_SID, authToken: 'token-abcd1234' },
  });

  it('serves the catalogue with the Vapi webhook URL built from BASE_URL', () => {
    const cat = service.getCatalogue();
    expect(cat.vapiWebhookUrl).toBe('https://calls.example.com/api/vapi/webhook');
    expect(cat.carriers.map(c => c.id)).toEqual(expect.arrayContaining(['jazz', 'zong', 'telenor', 'ufone', 'ptcl', 'vapi']));
  });

  describe('create', () => {
    it('verifies a Jazz number held as a Twilio verified caller ID and makes it the default', async () => {
      mockTwilio.outgoingCallerIds.list.mockResolvedValue([{ phoneNumber: '+923001234567' }]);

      const out = await attachJazzCallerId();

      expect(out).toEqual(expect.objectContaining({
        number: '+923001234567', carrier: 'jazz', status: 'verified', isDefault: true, label: 'Sales line',
      }));
      expect(out.statusMessage).toMatch(/Verified caller ID/);
      expect(mockTwilio.outgoingCallerIds.list).toHaveBeenCalledWith({ phoneNumber: '+923001234567', limit: 1 });
    });

    it('never returns secrets or ciphertext', async () => {
      const out: any = await attachJazzCallerId();
      expect(out.credentials).toEqual({ accountSid: TENANT_SID, authToken: '••••1234' });
      expect(JSON.stringify(out)).not.toContain('token-abcd1234');
      expect(repo.rows()[0].credentials).not.toContain('token-abcd1234');
    });

    it('marks the number failed, not default, when Twilio does not know it', async () => {
      const out = await attachJazzCallerId();
      expect(out.status).toBe('failed');
      expect(out.isDefault).toBe(false);
      expect(out.statusMessage).toMatch(/Verified Caller IDs/);
    });

    it('verifies a SIP trunk number against its BYOC trunk', async () => {
      const out = await service.create('u1', {
        carrier: 'ptcl', provider: 'sip_trunk', number: '042 35761234',
        credentials: { byocTrunkSid: BYOC_SID, accountSid: TENANT_SID, authToken: 'tok' },
      });
      expect(out.status).toBe('verified');
      expect(mockTwilio.voice.v1.byocTrunks).toHaveBeenCalledWith(BYOC_SID);
    });

    it('turns a provider 401 into an actionable message', async () => {
      mockTwilio.outgoingCallerIds.list.mockRejectedValue(Object.assign(new Error('Authenticate'), { status: 401 }));
      const out = await attachJazzCallerId();
      expect(out.status).toBe('failed');
      expect(out.statusMessage).toMatch(/rejected these credentials/);
    });

    it('checks that a Vapi phone number id really belongs to the number entered', async () => {
      mockedAxios.get.mockResolvedValueOnce({ data: { number: '+14155550111' } });
      const out = await service.create('u1', {
        carrier: 'vapi', provider: 'vapi', number: '+14155550100',
        credentials: { apiKey: 'k', phoneNumberId: 'vp1', assistantId: 'as1' },
      });
      expect(out.status).toBe('failed');
      expect(out.statusMessage).toMatch(/belongs to \+14155550111/);
    });

    it.each([
      [{ carrier: 'nope', provider: 'twilio', number: '+923001234567' }, /Unknown carrier/],
      [{ carrier: 'jazz', provider: 'vapi', number: '+923001234567' }, /can be connected via/],
      [{ carrier: 'jazz', provider: 'twilio', number: '12' }, /international format/],
      [{ carrier: 'zong', provider: 'sip_trunk', number: '+923101234567', credentials: {} }, /BYOC Trunk SID is required/],
      [{ carrier: 'zong', provider: 'sip_trunk', number: '+923101234567', credentials: { byocTrunkSid: 'BY1' } }, /looks wrong/],
      [{ carrier: 'jazz', provider: 'twilio', number: '+923001234567', credentials: { accountSid: TENANT_SID } }, /Auth Token is required/],
    ])('rejects invalid input %#', async (input, message) => {
      await expect(service.create('u1', input as any)).rejects.toThrow(message);
    });

    it('refuses to attach the same number twice', async () => {
      await attachJazzCallerId();
      await expect(attachJazzCallerId()).rejects.toThrow(/already attached/);
    });
  });

  describe('update', () => {
    it('keeps stored secrets when the form leaves them blank', async () => {
      mockTwilio.outgoingCallerIds.list.mockResolvedValue([{}]);
      const { id } = await attachJazzCallerId();

      const out: any = await service.update('u1', id, { credentials: { accountSid: TENANT_SID, authToken: '' } });

      expect(out.credentials.authToken).toBe('••••1234');
    });

    it("cannot touch another tenant's number", async () => {
      const { id } = await attachJazzCallerId();
      await expect(service.update('u2', id, { label: 'mine now' })).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.remove('u2', id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolveDialRoute', () => {
    it('returns null when the tenant has no verified default (platform number is used)', async () => {
      await expect(service.resolveDialRoute('u1')).resolves.toBeNull();
    });

    it('returns decrypted credentials for the default number', async () => {
      mockTwilio.outgoingCallerIds.list.mockResolvedValue([{}]);
      const { id } = await attachJazzCallerId();

      await expect(service.resolveDialRoute('u1')).resolves.toEqual({
        provider: 'twilio', phoneNumberId: id, from: '+923001234567',
        accountSid: TENANT_SID, authToken: 'token-abcd1234', byocTrunkSid: undefined,
      });
    });

    it('refuses a pinned number that is unverified or belongs to someone else', async () => {
      const { id } = await attachJazzCallerId();   // fails verification
      await expect(service.resolveDialRoute('u1', id)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.resolveDialRoute('u2', id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  it('promotes another verified number when the default is removed', async () => {
    mockTwilio.outgoingCallerIds.list.mockResolvedValue([{}]);
    const first = await attachJazzCallerId();
    const second = await service.create('u1', {
      carrier: 'zong', provider: 'twilio', number: '+923101234567', credentials: {},
    });
    // No tenant SID: verified against the platform account, which is unset here.
    expect(second.status).toBe('failed');

    config.TWILIO_ACCOUNT_SID = TENANT_SID;
    config.TWILIO_AUTH_TOKEN = 'platform';
    await service.verify('u1', second.id);
    delete config.TWILIO_ACCOUNT_SID;
    delete config.TWILIO_AUTH_TOKEN;

    await service.remove('u1', first.id);
    expect(repo.rows().find(r => r.id === second.id).isDefault).toBe(true);
  });
});
