import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import axios from 'axios';
import { PhoneNumber } from '../database/entities/phone-number.entity';
import { CredentialCipher } from './credential-cipher';
import {
  CARRIERS, PROVIDERS, ProviderId, VAPI_API_BASE,
  createTwilioClient, findCarrier, findProvider, normalisePhoneNumber,
} from './providers';

export interface PhoneNumberInput {
  label?: string;
  carrier?: string;
  provider?: string;
  number?: string;
  credentials?: Record<string, unknown>;
}

/** Everything the dialler needs to place one call from a tenant's number. */
export type DialRoute =
  | {
      provider: 'twilio' | 'sip_trunk';
      phoneNumberId: string;
      from: string;
      /** Absent = use the platform's Twilio account. */
      accountSid?: string;
      authToken?: string;
      byocTrunkSid?: string;
    }
  | {
      provider: 'vapi';
      phoneNumberId: string;
      from: string;
      apiKey: string;
      vapiPhoneNumberId: string;
      assistantId: string;
    };

const MAX_CREDENTIAL_LENGTH = 512;

@Injectable()
export class PhoneNumbersService {
  private readonly logger = new Logger(PhoneNumbersService.name);
  private readonly cipher: CredentialCipher;

  constructor(
    @InjectRepository(PhoneNumber) private repo: Repository<PhoneNumber>,
    private config: ConfigService,
  ) {
    this.cipher = new CredentialCipher(
      config.get('CREDENTIALS_ENCRYPTION_KEY') || config.get('JWT_SECRET', ''),
    );
  }

  getCatalogue() {
    const base = this.config.get('BASE_URL', 'http://localhost:3001').replace(/\/+$/, '');
    return {
      carriers: CARRIERS,
      providers: Object.values(PROVIDERS),
      vapiWebhookUrl: `${base}/api/vapi/webhook`,
    };
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async list(userId: string) {
    const rows = await this.repo.find({ where: { userId }, order: { isDefault: 'DESC', createdAt: 'ASC' } });
    return rows.map(r => this.toPublic(r));
  }

  async create(userId: string, input: PhoneNumberInput) {
    const carrier = findCarrier(input.carrier ?? '');
    if (!carrier) throw new BadRequestException(`Unknown carrier "${input.carrier}"`);
    const provider = findProvider(input.provider ?? '');
    if (!provider || !carrier.providers.includes(provider.id)) {
      throw new BadRequestException(`${carrier.label} numbers can be connected via: ${carrier.providers.join(', ')}`);
    }
    const number = this.parseNumber(input.number);
    const credentials = this.cleanCredentials(provider.id, input.credentials, {});

    await this.assertNumberFree(userId, number);
    const hasDefault = await this.repo.count({ where: { userId, isDefault: true } });

    const row = await this.repo.save(this.repo.create({
      userId,
      label: this.cleanLabel(input.label),
      carrier: carrier.id,
      provider: provider.id,
      number,
      credentials: this.cipher.encrypt(credentials),
      status: 'pending',
      // The first number a tenant attaches is the one their campaigns dial from.
      isDefault: hasDefault === 0,
    }));
    return this.runVerification(row);
  }

  /**
   * Credential fields left blank keep their stored value, so the form can show
   * masked secrets without ever round-tripping the real ones.
   */
  async update(userId: string, id: string, input: PhoneNumberInput) {
    const row = await this.findOwned(userId, id);
    if (input.provider && input.provider !== row.provider) {
      throw new BadRequestException('The connection type cannot be changed — remove the number and attach it again');
    }

    let reverify = false;
    if (input.label !== undefined) row.label = this.cleanLabel(input.label);
    if (input.number !== undefined) {
      const number = this.parseNumber(input.number);
      if (number !== row.number) {
        await this.assertNumberFree(userId, number);
        row.number = number;
        reverify = true;
      }
    }
    if (input.credentials !== undefined) {
      const existing = this.safeDecrypt(row) ?? {};
      row.credentials = this.cipher.encrypt(
        this.cleanCredentials(row.provider as ProviderId, input.credentials, existing),
      );
      reverify = true;
    }

    const saved = await this.repo.save(row);
    return reverify ? this.runVerification(saved) : this.toPublic(saved);
  }

  async remove(userId: string, id: string) {
    const row = await this.findOwned(userId, id);
    await this.repo.delete({ id: row.id, userId });
    if (row.isDefault) {
      const next = await this.repo.findOne({ where: { userId, status: 'verified' }, order: { createdAt: 'ASC' } });
      if (next) await this.repo.update({ id: next.id, userId }, { isDefault: true });
    }
    return { deleted: true };
  }

  async setDefault(userId: string, id: string) {
    const row = await this.findOwned(userId, id);
    if (row.status !== 'verified') throw new BadRequestException('Only a verified number can be the default');
    await this.repo.update({ userId, isDefault: true }, { isDefault: false });
    await this.repo.update({ id: row.id, userId }, { isDefault: true });
    return this.toPublic({ ...row, isDefault: true });
  }

  async verify(userId: string, id: string) {
    return this.runVerification(await this.findOwned(userId, id));
  }

  // ── Used by the dialler ───────────────────────────────────────────────────

  /**
   * The route one call should take.
   *
   * An explicit phoneNumberId (a campaign's choice) must belong to the tenant
   * and be verified, otherwise this throws — a campaign pinned to a number must
   * never silently fall back to a different caller ID. With no id, the tenant's
   * default number is used; null means "no number attached, use the platform's".
   */
  async resolveDialRoute(userId: string, phoneNumberId?: string | null): Promise<DialRoute | null> {
    let row: PhoneNumber | null;
    if (phoneNumberId) {
      row = await this.repo.findOne({ where: { id: phoneNumberId, userId } });
      if (!row) throw new NotFoundException('The phone number selected for this campaign no longer exists');
      if (row.status !== 'verified') {
        throw new BadRequestException(`Phone number ${row.number} is not verified — re-verify it in Settings`);
      }
    } else {
      row = await this.repo.findOne({ where: { userId, isDefault: true, status: 'verified' } });
      if (!row) return null;
    }

    const creds = this.safeDecrypt(row);
    if (!creds) {
      throw new BadRequestException(`Stored credentials for ${row.number} can no longer be read — re-enter them in Settings`);
    }

    if (row.provider === 'vapi') {
      return {
        provider: 'vapi', phoneNumberId: row.id, from: row.number,
        apiKey: creds.apiKey, vapiPhoneNumberId: creds.phoneNumberId, assistantId: creds.assistantId,
      };
    }
    return {
      provider: row.provider as 'twilio' | 'sip_trunk',
      phoneNumberId: row.id,
      from: row.number,
      accountSid: creds.accountSid || undefined,
      authToken: creds.authToken || undefined,
      byocTrunkSid: creds.byocTrunkSid || undefined,
    };
  }

  /** The Vapi Server URL secret for a number, or null when none is configured. */
  async getVapiWebhookSecret(phoneNumberId: string): Promise<string | null> {
    const row = await this.repo.findOne({ where: { id: phoneNumberId } });
    if (!row || row.provider !== 'vapi') return null;
    return this.safeDecrypt(row)?.webhookSecret || null;
  }

  // ── Verification ──────────────────────────────────────────────────────────

  /** Checks the number against the provider and persists the result. Never throws. */
  private async runVerification(row: PhoneNumber) {
    let ok = false;
    let message: string;
    try {
      const creds = this.safeDecrypt(row);
      if (!creds) throw new Error('Stored credentials can no longer be read — re-enter them');
      ({ ok, message } = await this.checkWithProvider(row, creds));
    } catch (err) {
      message = this.describeProviderError(err);
    }

    row.status = ok ? 'verified' : 'failed';
    row.statusMessage = message;
    row.verifiedAt = ok ? new Date() : null;
    // A default that stops working must not stay the default: campaigns would
    // keep resolving to it and fail every dial.
    if (!ok && row.isDefault) row.isDefault = false;
    await this.repo.save(row);

    if (ok) {
      const hasDefault = await this.repo.count({ where: { userId: row.userId, isDefault: true } });
      if (!hasDefault) {
        await this.repo.update({ id: row.id, userId: row.userId }, { isDefault: true });
        row.isDefault = true;
      }
    }
    this.logger.log(`Phone number ${row.number} (${row.provider}) verification: ${row.status} — ${message}`);
    return this.toPublic(row);
  }

  private async checkWithProvider(row: PhoneNumber, creds: Record<string, string>): Promise<{ ok: boolean; message: string }> {
    if (row.provider === 'vapi') return this.checkVapi(row.number, creds);

    const client = this.twilioClientFor(creds);
    if (!client) {
      return { ok: false, message: "No Twilio account to verify against — enter your Account SID and Auth Token, or ask the platform admin to configure Twilio" };
    }

    if (row.provider === 'sip_trunk') {
      const trunk = await client.voice.v1.byocTrunks(creds.byocTrunkSid).fetch();
      return { ok: true, message: `BYOC trunk "${trunk.friendlyName || trunk.sid}" found. Calls leave through your carrier as ${row.number}.` };
    }

    const owned = await client.incomingPhoneNumbers.list({ phoneNumber: row.number, limit: 1 });
    if (owned.length) return { ok: true, message: 'Number found on the Twilio account.' };
    const callerIds = await client.outgoingCallerIds.list({ phoneNumber: row.number, limit: 1 });
    if (callerIds.length) return { ok: true, message: 'Verified caller ID on the Twilio account.' };
    return {
      ok: false,
      message: 'This number is not on the Twilio account. Buy it on Twilio, or verify it under Phone Numbers → Verified Caller IDs (Twilio calls the number with a code), then verify again here.',
    };
  }

  private async checkVapi(number: string, creds: Record<string, string>) {
    const headers = { Authorization: `Bearer ${creds.apiKey}` };
    const { data: vapiNumber } = await axios.get(
      `${VAPI_API_BASE}/phone-number/${encodeURIComponent(creds.phoneNumberId)}`, { headers, timeout: 10_000 },
    );
    if (vapiNumber?.number && normalisePhoneNumber(vapiNumber.number) !== number) {
      return { ok: false, message: `That Vapi phone number ID belongs to ${vapiNumber.number}, not ${number}.` };
    }
    const { data: assistant } = await axios.get(
      `${VAPI_API_BASE}/assistant/${encodeURIComponent(creds.assistantId)}`, { headers, timeout: 10_000 },
    );
    return { ok: true, message: `Vapi number and assistant "${assistant?.name || creds.assistantId}" found.` };
  }

  private twilioClientFor(creds: Record<string, string>) {
    return creds.accountSid
      ? createTwilioClient(creds.accountSid, creds.authToken)
      : createTwilioClient(this.config.get('TWILIO_ACCOUNT_SID'), this.config.get('TWILIO_AUTH_TOKEN'));
  }

  private describeProviderError(err: any): string {
    const status = err?.status ?? err?.response?.status;
    if (status === 401 || status === 403) return 'The provider rejected these credentials — check the SID/token or API key.';
    if (status === 404) return 'The provider could not find that ID — check the trunk, phone number or assistant ID.';
    const detail = err?.response?.data?.message ?? err?.message ?? String(err);
    return `Could not verify: ${Array.isArray(detail) ? detail.join('; ') : detail}`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async findOwned(userId: string, id: string) {
    // Scoped by userId so one tenant cannot touch another's numbers by guessing an id.
    const row = await this.repo.findOne({ where: { id, userId } });
    if (!row) throw new NotFoundException('Phone number not found');
    return row;
  }

  private async assertNumberFree(userId: string, number: string) {
    if (await this.repo.count({ where: { userId, number } })) {
      throw new ConflictException(`${number} is already attached`);
    }
  }

  private parseNumber(raw?: string) {
    const number = normalisePhoneNumber(raw ?? '');
    if (!number) {
      throw new BadRequestException('Enter the number in international format, e.g. +923001234567 (03001234567 also works for Pakistan)');
    }
    return number;
  }

  private cleanLabel(label?: string) {
    const trimmed = String(label ?? '').trim().slice(0, 60);
    return trimmed || null;
  }

  /** Keep only the provider's declared fields, merged over what is already stored. */
  private cleanCredentials(provider: ProviderId, input: Record<string, unknown> | undefined, existing: Record<string, string>) {
    const out: Record<string, string> = {};
    for (const field of PROVIDERS[provider].fields) {
      const value = typeof input?.[field.key] === 'string' ? (input[field.key] as string).trim() : '';
      if (value.length > MAX_CREDENTIAL_LENGTH) throw new BadRequestException(`${field.label} is too long`);
      const merged = value || existing[field.key] || '';
      if (merged) out[field.key] = merged;
      else if (field.required) throw new BadRequestException(`${field.label} is required`);
    }
    if (out.accountSid && !out.authToken) throw new BadRequestException('Twilio Auth Token is required with an Account SID');
    if (out.accountSid && !/^AC[0-9a-fA-F]{32}$/.test(out.accountSid)) {
      throw new BadRequestException('Twilio Account SID looks wrong — it starts with AC followed by 32 characters');
    }
    if (out.byocTrunkSid && !/^BY[0-9a-fA-F]{32}$/.test(out.byocTrunkSid)) {
      throw new BadRequestException('BYOC Trunk SID looks wrong — it starts with BY followed by 32 characters');
    }
    return out;
  }

  private safeDecrypt(row: PhoneNumber): Record<string, string> | null {
    if (!row.credentials) return {};
    try {
      return this.cipher.decrypt(row.credentials);
    } catch (err) {
      this.logger.warn(`Could not decrypt credentials for phone number ${row.id}: ${err.message}`);
      return null;
    }
  }

  /** The client-facing shape. Secrets are masked; ciphertext never leaves the server. */
  toPublic(row: PhoneNumber) {
    const creds = this.safeDecrypt(row) ?? {};
    const masked: Record<string, string> = {};
    for (const field of findProvider(row.provider)?.fields ?? []) {
      const value = creds[field.key];
      if (!value) continue;
      masked[field.key] = field.secret ? `••••${value.slice(-4)}` : value;
    }
    return {
      id: row.id,
      label: row.label,
      number: row.number,
      carrier: row.carrier,
      provider: row.provider,
      status: row.status,
      statusMessage: row.statusMessage,
      verifiedAt: row.verifiedAt,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      credentials: masked,
    };
  }
}
