import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';
import { Campaign } from '../database/entities/campaign.entity';
import { User } from '../database/entities/user.entity';
import { AiService } from '../ai/ai.service';
import axios from 'axios';
import { timingSafeEqual } from 'crypto';
import { DialRoute, PhoneNumbersService } from '../phone-numbers/phone-numbers.service';
import { VAPI_API_BASE, createTwilioClient } from '../phone-numbers/providers';
import {
  STT_SAMPLE_RATE,
  TWILIO_SAMPLE_RATE,
  pcmToWav,
  resample,
  wavToTwilioMuLaw,
} from './audio/codec';

export const DEFAULT_MAX_CONCURRENT_CALLS = 60;

interface Conversation {
  history: Array<{ role: string; content: string }>;
  leadId?: string;
  campaignId?: string;
  startedAt: number;
  /** Set once handleCallComplete has settled this call, so it runs only once. */
  finalised: boolean;
  /**
   * The calling company's sales profile, resolved once and cached for the life
   * of the call. `companyResolved` distinguishes "not looked up yet" from
   * "looked up and there isn't one", so a tenant without a profile does not
   * re-query on every single turn.
   */
  company?: Record<string, any> | null;
  companyResolved: boolean;
}

/** Who is dialling, so the call can go out on one of the tenant's own numbers. */
export interface DialOptions {
  userId?: string;
  /** A campaign's pinned number. Omitted = the tenant's default, then the platform's. */
  phoneNumberId?: string | null;
}

/** Vapi end-of-call reasons that mean nobody picked up, mapped to our lead statuses. */
const VAPI_UNANSWERED: Record<string, string> = {
  'customer-did-not-answer': 'no-answer',
  'customer-busy': 'busy',
  'voicemail': 'no-answer',
  'twilio-failed-to-connect-call': 'failed',
  'vonage-failed-to-connect-call': 'failed',
};

export interface DialJobData {
  leadId: string;
  phoneNumber: string;
  campaignId: string;
  userId: string;
  leadName: string;
  settings: any;
}

@Injectable()
export class CallingService {
  private readonly logger = new Logger(CallingService.name);
  private activeConversations = new Map<string, Conversation>();
  private twilioClient: any = null;
  private fromNumber: string;

  constructor(
    @InjectRepository(Call) private callRepo: Repository<Call>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    @InjectRepository(Campaign) private campaignRepo: Repository<Campaign>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectQueue('calling') private callingQueue: Queue,
    private config: ConfigService,
    private aiService: AiService,
    private phoneNumbers: PhoneNumbersService,
  ) {
    this.fromNumber = config.get('TWILIO_PHONE_NUMBER', '');

    // A missing/placeholder SID is the normal state in dev. Log it once here
    // rather than letting every dial fail with an opaque Twilio error. Tenants
    // can still dial on numbers they attach with their own credentials.
    try {
      this.twilioClient = createTwilioClient(config.get('TWILIO_ACCOUNT_SID'), config.get('TWILIO_AUTH_TOKEN'));
      if (!this.twilioClient) {
        this.logger.warn('Platform Twilio credentials missing or placeholder - only tenant-attached numbers can dial');
      }
    } catch (e) {
      this.logger.warn('Twilio client init failed: ' + e.message);
    }
  }

  get isConfigured(): boolean {
    return this.twilioClient !== null;
  }

  // ── Campaign dispatch ───────────────────────────────────────────────────────

  /**
   * Throws (with a message fit for the UI) when the campaign's pinned caller
   * number is missing, unverified or unreadable. Checked before queueing so a
   * broken number fails the Start button, not hundreds of queued dials.
   */
  async assertCallerNumberUsable(userId: string, phoneNumberId: string) {
    await this.phoneNumbers.resolveDialRoute(userId, phoneNumberId);
  }

  async startCampaignCalls(campaignId: string, userId: string, leads: Lead[], settings: any) {
    const maxConcurrent = settings?.maxConcurrentCalls || DEFAULT_MAX_CONCURRENT_CALLS;
    let queued = 0;

    for (const lead of leads) {
      if (!lead.phone) continue;
      const data: DialJobData = {
        leadId: lead.id,
        phoneNumber: lead.phone,
        campaignId,
        userId,
        leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(),
        settings,
      };
      await this.callingQueue.add('dial-lead', data, {
        attempts: 2,
        backoff: 30000,
        removeOnComplete: true,
      });
      queued++;
    }

    this.logger.log(`Queued ${queued} calls for campaign ${campaignId} (max ${maxConcurrent} concurrent)`);
    return { queued, maxConcurrent };
  }

  /**
   * Place one outbound call and record it. The caller number comes from the
   * campaign's pinned number, else the tenant's default, else the platform's
   * TWILIO_PHONE_NUMBER — see PhoneNumbersService.resolveDialRoute.
   */
  async initiateCall(leadId: string, phoneNumber: string, campaignId: string, opts: DialOptions = {}): Promise<string> {
    const route = opts.userId ? await this.phoneNumbers.resolveDialRoute(opts.userId, opts.phoneNumberId) : null;
    if (route?.provider === 'vapi') return this.dialViaVapi(route, leadId, phoneNumber, campaignId);

    const client = route?.accountSid ? createTwilioClient(route.accountSid, route.authToken) : this.twilioClient;
    if (!client) throw new Error('Twilio not configured');

    const baseUrl = this.config.get('BASE_URL', 'http://localhost:3001');
    const call = await client.calls.create({
      to: phoneNumber,
      from: route?.from ?? this.fromNumber,
      // BYOC: leave through the tenant's own carrier trunk (Jazz/Zong SIP, a
      // GSM gateway, ...) while the audio still comes back on the media stream.
      ...(route?.provider === 'sip_trunk' && route.byocTrunkSid ? { byoc: route.byocTrunkSid } : {}),
      url: `${baseUrl}/api/twiml/outbound?leadId=${encodeURIComponent(leadId)}&campaignId=${encodeURIComponent(campaignId)}`,
      statusCallback: `${baseUrl}/api/twiml/status`,
      statusCallbackMethod: 'POST',
      statusCallbackEvent: ['initiated', 'answered', 'completed'],
      machineDetection: 'DetectMessageEnd',
      timeout: 30,
    });

    await this.callRepo.save(this.callRepo.create({
      leadId, campaignId, twilioCallSid: call.sid, status: 'initiated',
      provider: route?.provider ?? 'twilio', phoneNumberId: route?.phoneNumberId ?? null,
    }));

    this.logger.log(`Call initiated: ${call.sid} to ${phoneNumber} from ${route?.from ?? this.fromNumber}`);
    return call.sid;
  }

  /**
   * Vapi runs the conversation itself with the tenant's assistant, so there is
   * no media stream here — the outcome arrives later on POST /api/vapi/webhook.
   */
  private async dialViaVapi(
    route: Extract<DialRoute, { provider: 'vapi' }>, leadId: string, phoneNumber: string, campaignId: string,
  ): Promise<string> {
    let callId: string;
    try {
      const { data } = await axios.post(
        `${VAPI_API_BASE}/call`,
        { phoneNumberId: route.vapiPhoneNumberId, assistantId: route.assistantId, customer: { number: phoneNumber } },
        { headers: { Authorization: `Bearer ${route.apiKey}` }, timeout: 15_000 },
      );
      callId = data?.id;
    } catch (err) {
      const detail = err?.response?.data?.message ?? err.message;
      throw new Error(`Vapi rejected the call: ${Array.isArray(detail) ? detail.join('; ') : detail}`);
    }
    if (!callId) throw new Error('Vapi did not return a call id');

    await this.callRepo.save(this.callRepo.create({
      leadId, campaignId, providerCallId: callId, status: 'initiated',
      provider: 'vapi', phoneNumberId: route.phoneNumberId,
    }));
    this.logger.log(`Vapi call initiated: ${callId} to ${phoneNumber} from ${route.from}`);
    return callId;
  }

  /**
   * One Vapi Server URL event. Returns false when the shared secret does not
   * match, so the controller can answer 401.
   *
   * Only calls this platform placed are touched: the event is matched to a call
   * record by Vapi's call id, and that record names the number whose secret
   * must match.
   */
  async handleVapiEvent(message: any, secretHeader?: string): Promise<boolean> {
    const callId = message?.call?.id;
    if (!callId) return true;
    const call = await this.callRepo.findOne({ where: { providerCallId: callId, provider: 'vapi' } });
    if (!call) return true;

    const expected = call.phoneNumberId ? await this.phoneNumbers.getVapiWebhookSecret(call.phoneNumberId) : null;
    if (expected && !safeEqual(expected, secretHeader ?? '')) return false;

    if (message.type === 'status-update' && message.status && call.status !== 'completed') {
      await this.callRepo.update({ id: call.id }, { status: message.status === 'ended' ? 'completed' : message.status });
      return true;
    }
    if (message.type !== 'end-of-call-report') return true;

    const transcript: string = message.artifact?.transcript ?? message.transcript ?? '';
    const started = Date.parse(message.startedAt ?? message.call?.startedAt ?? '');
    const ended = Date.parse(message.endedAt ?? message.call?.endedAt ?? '');
    const seconds = Number.isFinite(message.durationSeconds)
      ? Math.round(message.durationSeconds)
      : Number.isFinite(started) && Number.isFinite(ended) ? Math.round((ended - started) / 1000) : 0;

    // Vapi labels the caller's lines "User:". No caller speech means nobody
    // engaged, so the qualifier is not asked to score an agent monologue.
    const spokeToUs = /(^|\n)\s*(user|customer)\s*:/i.test(transcript);
    const qualification = spokeToUs
      ? await this.aiService.qualifyLead(transcript)
      : {
          outcome: VAPI_UNANSWERED[message.endedReason] ?? 'no-answer',
          score: 0,
          notes: `Vapi: ${message.endedReason ?? 'no caller speech'}`,
        };

    await this.callRepo.update({ id: call.id }, {
      status: 'completed',
      durationSeconds: seconds,
      transcript: transcript || null,
      outcome: qualification.outcome,
      recordingUrl: message.artifact?.recordingUrl ?? message.recordingUrl ?? null,
    });
    if (call.leadId) {
      // Same reasoning as handleCallComplete: a bad leadId must not lose the call record.
      try {
        await this.leadRepo.update(call.leadId, { status: qualification.outcome || 'contacted' });
      } catch (err) {
        this.logger.warn(`Could not update lead ${call.leadId}: ${err.message}`);
      }
    }
    return true;
  }

  // ── Live media stream ───────────────────────────────────────────────────────

  /** Called when Twilio opens the media stream for a call. */
  async registerStream(callSid: string, leadId?: string, campaignId?: string) {
    if (!callSid) return;
    const existing = this.activeConversations.get(callSid);
    this.activeConversations.set(callSid, {
      history: existing?.history ?? [],
      leadId: leadId ?? existing?.leadId,
      campaignId: campaignId ?? existing?.campaignId,
      startedAt: existing?.startedAt ?? Date.now(),
      finalised: false,
      company: existing?.company,
      companyResolved: existing?.companyResolved ?? false,
    });
    await this.callRepo.update({ twilioCallSid: callSid }, { status: 'in-progress' });
  }

  /**
   * Opening line, as μ-law ready for the wire. Campaign settings can override
   * the script; otherwise we fall back to a neutral greeting.
   */
  async buildGreeting(callSid: string): Promise<Buffer | null> {
    const convo = this.activeConversations.get(callSid);
    let greeting = 'Hello! Thanks for taking my call. Do you have a quick moment?';

    if (convo?.campaignId) {
      // customParameters come off the TwiML and are not guaranteed to be a valid
      // UUID. A bad one must not cost us the opening line, so fall back to the
      // default greeting rather than letting the query reject the whole turn.
      try {
        const campaign = await this.campaignRepo.findOne({ where: { id: convo.campaignId } });
        const configured = (campaign?.settings as any)?.greeting;
        if (typeof configured === 'string' && configured.trim()) greeting = configured.trim();
      } catch (err) {
        this.logger.warn(`Could not load campaign ${convo.campaignId} for greeting: ${err.message}`);
      }
    }

    convo?.history.push({ role: 'assistant', content: greeting });
    return this.synthesizeForTwilio(greeting);
  }

  /**
   * The calling company's sales profile, resolved once per call and cached.
   *
   * Resolution order: a per-campaign override in `settings.company` beats the
   * tenant's onboarding profile on the user record, so one company can run a
   * campaign with a different pitch without editing its defaults.
   *
   * Deliberately cached on the conversation. This runs inside handleUtterance,
   * which already spends most of its 8s budget on STT plus generation — adding
   * two database round-trips to every turn of every concurrent call would show
   * up as dead air on the line. A tenant with no profile caches `null` and is
   * never looked up again.
   *
   * Never throws: a failed lookup degrades to the generic script rather than
   * dropping the caller's turn.
   */
  private async resolveCompany(convo: Conversation): Promise<Record<string, any> | null> {
    if (convo.companyResolved) return convo.company ?? null;
    convo.companyResolved = true;
    convo.company = null;

    if (!convo.campaignId) return null;
    try {
      const campaign = await this.campaignRepo.findOne({ where: { id: convo.campaignId } });
      if (!campaign) return null;

      const override = (campaign.settings as any)?.company;
      if (override && typeof override === 'object') {
        convo.company = override;
        return convo.company;
      }

      if (campaign.userId) {
        const user = await this.userRepo.findOne({ where: { id: campaign.userId } });
        if (user?.salesProfile && typeof user.salesProfile === 'object') {
          convo.company = user.salesProfile;
        }
      }
    } catch (err) {
      this.logger.warn(`Could not resolve sales profile for campaign ${convo.campaignId}: ${err.message}`);
    }
    return convo.company ?? null;
  }

  /**
   * One complete caller turn: 8 kHz PCM in, the agent's spoken reply out as
   * μ-law. Returns null when there is nothing to say (empty transcript, or TTS
   * unavailable), which leaves the line quiet rather than playing noise.
   */
  async handleUtterance(callSid: string, pcm8k: Int16Array): Promise<Buffer | null> {
    const convo = this.activeConversations.get(callSid);
    if (!convo) return null;

    try {
      const wav = pcmToWav(resample(pcm8k, TWILIO_SAMPLE_RATE, STT_SAMPLE_RATE), STT_SAMPLE_RATE);
      const transcript = await this.aiService.transcribeAudio(wav);
      if (!transcript || transcript.trim().length < 2) return null;

      this.logger.debug(`[${callSid}] caller: ${transcript}`);
      convo.history.push({ role: 'user', content: transcript });

      const company = await this.resolveCompany(convo);
      const reply = await this.aiService.generateResponse(convo.history, 150, company);
      convo.history.push({ role: 'assistant', content: reply });
      this.logger.debug(`[${callSid}] agent: ${reply}`);

      return this.synthesizeForTwilio(reply);
    } catch (err) {
      this.logger.error(`Turn failed for ${callSid}: ${err.message}`);
      return null;
    }
  }

  private async synthesizeForTwilio(text: string): Promise<Buffer | null> {
    const wav = await this.aiService.synthesizeSpeech(text);
    if (!wav || wav.length === 0) {
      this.logger.warn('TTS returned no audio (service down, or running without a model) - the caller will hear silence');
      return null;
    }

    const mulaw = wavToTwilioMuLaw(wav);
    if (!mulaw) {
      this.logger.warn('TTS returned audio we could not decode - skipping playback');
      return null;
    }
    return mulaw;
  }

  /**
   * Settle the call record. Safe to call more than once: Twilio's `stop` event
   * and the socket close handler can both fire for the same call.
   */
  async handleCallComplete(callSid: string, duration: number) {
    const convo = this.activeConversations.get(callSid);
    if (!convo || convo.finalised) {
      this.activeConversations.delete(callSid);
      return;
    }
    convo.finalised = true;

    // Fall back to wall-clock when Twilio does not send a duration (e.g. the
    // socket dropped), so the record is never left at zero seconds.
    const seconds = duration > 0 ? duration : Math.round((Date.now() - convo.startedAt) / 1000);

    try {
      const transcriptText = convo.history
        .map(m => (m.role === 'user' ? 'Lead' : 'Agent') + ': ' + m.content)
        .join('\n');

      // No caller turns means nobody actually engaged - record it as such rather
      // than sending an agent-only transcript to the qualifier.
      const spokeToUs = convo.history.some(m => m.role === 'user');
      const qualification = spokeToUs
        ? await this.aiService.qualifyLead(transcriptText)
        : { outcome: 'no-answer', score: 0, notes: 'No caller speech detected' };

      await this.callRepo.update({ twilioCallSid: callSid }, {
        status: 'completed',
        durationSeconds: seconds,
        transcript: transcriptText || null,
        outcome: qualification.outcome,
      });

      if (convo.leadId) {
        // Same reasoning as the campaign lookup: a malformed leadId should not
        // stop us recording the call itself.
        try {
          await this.leadRepo.update(convo.leadId, { status: qualification.outcome || 'contacted' });
        } catch (err) {
          this.logger.warn(`Could not update lead ${convo.leadId}: ${err.message}`);
        }
      }
    } catch (err) {
      this.logger.error(`Failed to finalise call ${callSid}: ${err.message}`);
    } finally {
      this.activeConversations.delete(callSid);
    }
  }

  /**
   * Twilio status webhook. This is the only thing that settles calls which never
   * reached the media stream at all — busy, no-answer, failed, voicemail.
   */
  async recordStatusCallback(callSid: string, status: string, durationSeconds?: number) {
    if (!callSid) return;

    const terminal = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
    if (!terminal.includes(status)) {
      await this.callRepo.update({ twilioCallSid: callSid }, { status });
      return;
    }

    const call = await this.callRepo.findOne({ where: { twilioCallSid: callSid } });
    if (!call) return;

    // A call the media stream already finalised keeps its richer outcome.
    if (call.status === 'completed' && call.outcome) return;

    await this.callRepo.update({ twilioCallSid: callSid }, {
      status: status === 'completed' ? 'completed' : status,
      durationSeconds: durationSeconds ?? call.durationSeconds,
      outcome: call.outcome ?? (status === 'completed' ? 'contacted' : status),
    });

    if (call.leadId && !call.outcome && status !== 'completed') {
      await this.leadRepo.update(call.leadId, { status });
    }
  }

  getActiveCallCount(): number {
    return this.activeConversations.size;
  }

  async stopCampaign(campaignId: string) {
    // Remove only this campaign's pending jobs. The queue is shared by every
    // tenant, so pausing it would stall everyone else's calls too.
    const jobs = await this.callingQueue.getJobs(['waiting', 'delayed']);
    for (const job of jobs) {
      if (job.data?.campaignId === campaignId) await job.remove();
    }
  }
}

/** Constant-time string comparison for webhook secrets. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
