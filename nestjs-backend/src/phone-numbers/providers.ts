/**
 * Everything the platform knows about attaching a caller number, in one place.
 * The settings page renders its form from GET /phone-numbers/catalogue, so a
 * new carrier or credential field is added here and nowhere else.
 *
 * Two independent axes:
 *   carrier  — who owns the number (Jazz, Zong, Twilio, Vapi, ...)
 *   provider — how the call is actually placed
 *
 * Pakistani mobile operators (Jazz, Zong, Telenor, Ufone) have no public API
 * for putting a SIM number behind a cloud voice agent. The two routes that
 * genuinely work are both offered for them:
 *   - twilio    : verify the number as a Twilio caller ID. Twilio carries the
 *                 call; the lead sees your number.
 *   - sip_trunk : the carrier's business SIP trunk, or a GSM gateway holding
 *                 the SIM, registered in Twilio as a BYOC trunk. The call goes
 *                 out over the local carrier with the real number.
 * Both keep the audio on Twilio Media Streams, so the platform's own
 * STT → LLM → TTS agent runs unchanged. `vapi` is the exception: Vapi runs its
 * own assistant and we ingest its end-of-call report.
 */

export type ProviderId = 'twilio' | 'sip_trunk' | 'vapi';

export interface CredentialField {
  key: string;
  label: string;
  /** Write-only: masked in every API response. */
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  help?: string;
}

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  description: string;
  fields: CredentialField[];
}

export interface CarrierSpec {
  id: string;
  label: string;
  /** ISO country the carrier operates in; null for international platforms. */
  country: string | null;
  /** Providers that can place calls from this carrier's numbers, preferred first. */
  providers: ProviderId[];
}

const TWILIO_ACCOUNT_FIELDS: CredentialField[] = [
  {
    key: 'accountSid', label: 'Twilio Account SID', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    help: "Leave blank to use the platform's Twilio account.",
  },
  { key: 'authToken', label: 'Twilio Auth Token', secret: true, help: 'Required when you enter an Account SID.' },
];

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  twilio: {
    id: 'twilio',
    label: 'Twilio number or verified caller ID',
    description:
      'A number bought on Twilio, or your own mobile/landline verified in Twilio under ' +
      'Phone Numbers → Verified Caller IDs. Twilio carries the call and shows this number to the lead. ' +
      'Fastest to set up; caller ID shown on Pakistani networks over international routes is not guaranteed.',
    fields: TWILIO_ACCOUNT_FIELDS,
  },
  sip_trunk: {
    id: 'sip_trunk',
    label: 'Carrier SIP trunk / GSM gateway (BYOC)',
    description:
      "Your carrier's business SIP trunk, or a GSM gateway with the SIM inside, added to Twilio as a " +
      'BYOC trunk (Voice → Manage → BYOC Trunks). Calls go out over your own carrier at local rates with your real number.',
    fields: [
      { key: 'byocTrunkSid', label: 'BYOC Trunk SID', required: true, placeholder: 'BYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
      ...TWILIO_ACCOUNT_FIELDS,
    ],
  },
  vapi: {
    id: 'vapi',
    label: 'Vapi',
    description:
      'A number in your Vapi workspace. Vapi runs the conversation with the assistant you choose; this platform ' +
      'records the transcript and qualifies the lead. Set the assistant or number Server URL in Vapi to the webhook shown below.',
    fields: [
      { key: 'apiKey', label: 'Vapi private API key', secret: true, required: true },
      { key: 'phoneNumberId', label: 'Vapi phone number ID', required: true, placeholder: 'from Vapi → Phone Numbers' },
      { key: 'assistantId', label: 'Vapi assistant ID', required: true, placeholder: 'from Vapi → Assistants' },
      {
        key: 'webhookSecret', label: 'Server URL secret', secret: true,
        help: "Recommended. The same secret you set on the Server URL in Vapi; it's sent as the x-vapi-secret header.",
      },
    ],
  },
};

export const CARRIERS: CarrierSpec[] = [
  { id: 'jazz',    label: 'Jazz',    country: 'PK', providers: ['twilio', 'sip_trunk'] },
  { id: 'zong',    label: 'Zong',    country: 'PK', providers: ['twilio', 'sip_trunk'] },
  { id: 'telenor', label: 'Telenor', country: 'PK', providers: ['twilio', 'sip_trunk'] },
  { id: 'ufone',   label: 'Ufone',   country: 'PK', providers: ['twilio', 'sip_trunk'] },
  { id: 'ptcl',    label: 'PTCL',    country: 'PK', providers: ['sip_trunk', 'twilio'] },
  { id: 'twilio',  label: 'Twilio',  country: null, providers: ['twilio'] },
  { id: 'vapi',    label: 'Vapi',    country: null, providers: ['vapi'] },
  { id: 'other',   label: 'Other (Vonage, Telnyx, Plivo, any SIP carrier)', country: null, providers: ['sip_trunk', 'twilio'] },
];

export const findCarrier = (id: string) => CARRIERS.find(c => c.id === id);
export const findProvider = (id: string): ProviderSpec | undefined => PROVIDERS[id as ProviderId];

/**
 * Normalise to E.164, or null when it cannot be.
 *
 * Accepts the forms people actually type in Pakistan — 0300 1234567,
 * 0092-300-1234567, 92 300 1234567 — alongside plain +E.164.
 */
export function normalisePhoneNumber(raw: string): string | null {
  let n = String(raw ?? '').trim().replace(/[\s\-().]/g, '');
  if (n.startsWith('00')) n = '+' + n.slice(2);
  else if (/^0[1-9]\d{8,10}$/.test(n)) n = '+92' + n.slice(1);   // Pakistani national format
  else if (/^92\d{9,10}$/.test(n)) n = '+' + n;
  return /^\+[1-9]\d{7,14}$/.test(n) ? n : null;
}

/** Real-looking Twilio credentials, as opposed to the .env.example placeholders. */
export function isUsableTwilioSid(sid?: string, token?: string): boolean {
  return !!sid && !!token && sid.startsWith('AC') && !sid.includes('xxxx');
}

/** A Twilio REST client, or null when the credentials are missing/placeholders. */
export function createTwilioClient(sid?: string, token?: string): any | null {
  if (!isUsableTwilioSid(sid, token)) return null;
  const twilio = require('twilio');
  return new twilio.Twilio(sid, token);
}

export const VAPI_API_BASE = 'https://api.vapi.ai';
