import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import {
  BusinessSearchQuery, ChatMessage, LeadQualification, LeadScoreFeatures, ServiceHealth,
} from './ai.types';

/** Per-call budgets. Voice-path calls are tight: they sit inside a live phone turn. */
const TIMEOUT_MS = {
  stt: 10_000,
  tts: 15_000,
  chat: 8_000,
  qualify: 10_000,
  scrape: 120_000,
  score: 5_000,
  businessSearch: 60_000,
  lookup: 5_000,
  health: 3_000,
};

const NEUTRAL_LEAD_SCORE = 50;
const CHAT_RETRY_REPLY = 'I apologize, I had trouble responding. Could you repeat that?';
const CHAT_FAILURE_REPLY = 'I apologize, I had a technical difficulty. Can I call you back?';

/**
 * HTTP client for the four Python AI services (STT/TTS, leads, business, LLM).
 *
 * Every method degrades instead of throwing: a missing model or a service that
 * is down must never take a live call or a campaign with it. Failures are
 * logged with the service name so they are visible, and callers get a neutral
 * fallback (empty transcript, silence, neutral score, a polite reply).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly urls: { stt: string; tts: string; leads: string; business: string; llm: string };

  constructor(config: ConfigService) {
    this.urls = {
      stt: config.get('STT_SERVICE_URL', 'http://localhost:8001'),
      tts: config.get('TTS_SERVICE_URL', 'http://localhost:8001'),
      leads: config.get('LEADS_SERVICE_URL', 'http://localhost:8002'),
      business: config.get('BUSINESS_SERVICE_URL', 'http://localhost:8003'),
      llm: config.get('LLM_SERVICE_URL', 'http://localhost:8004'),
    };
  }

  // ── Speech ──────────────────────────────────────────────────────────────────

  async transcribeAudio(audioBuffer: Buffer, language = 'en'): Promise<string> {
    try {
      const form = new FormData();
      form.append('audio', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
      form.append('language', language);
      const response = await axios.post(`${this.urls.stt}/stt`, form, {
        headers: form.getHeaders(), timeout: TIMEOUT_MS.stt,
      });
      return response.data.text || '';
    } catch (err) {
      this.logger.warn('STT error: ' + err.message);
      return '';
    }
  }

  /** WAV bytes, or an empty buffer on failure (the caller then plays silence). */
  async synthesizeSpeech(text: string, language = 'en'): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.urls.tts}/tts`,
        { text, language },
        { responseType: 'arraybuffer', timeout: TIMEOUT_MS.tts },
      );
      return Buffer.from(response.data);
    } catch (err) {
      this.logger.warn('TTS error: ' + err.message);
      return Buffer.alloc(0);
    }
  }

  // ── Leads ───────────────────────────────────────────────────────────────────

  async scrapeLeads(platform: string, query: string, maxResults = 100): Promise<any[]> {
    try {
      const response = await axios.post(`${this.urls.leads}/scrape`,
        { platform, query, max_results: maxResults }, { timeout: TIMEOUT_MS.scrape });
      return response.data.leads || [];
    } catch (err) {
      this.logger.warn('Lead scraper error: ' + err.message);
      return [];
    }
  }

  /** 0-100 from the XGBoost scorer; a neutral 50 when the service is unavailable. */
  async scoreLead(features: LeadScoreFeatures): Promise<number> {
    try {
      const response = await axios.post(`${this.urls.leads}/score`, features, { timeout: TIMEOUT_MS.score });
      const score = response.data?.score;
      return typeof score === 'number' ? score : NEUTRAL_LEAD_SCORE;
    } catch (err) {
      this.logger.warn('Lead scoring failed, using neutral score: ' + err.message);
      return NEUTRAL_LEAD_SCORE;
    }
  }

  // ── Business search ─────────────────────────────────────────────────────────

  /**
   * `endpoint` selects between the plain search and the find-opportunities
   * variant, which sorts worst-rated first and attaches an outreach script.
   */
  async searchBusinesses(query: BusinessSearchQuery, endpoint: 'search' | 'find-opportunities' = 'search') {
    try {
      const response = await axios.post(`${this.urls.business}/${endpoint}`, query, { timeout: TIMEOUT_MS.businessSearch });
      return response.data;
    } catch (err) {
      this.logger.warn('Business search error: ' + err.message);
      return { businesses: [], total: 0, error: 'Business service unavailable' };
    }
  }

  /** Region presets the business service supports (for the UI picker). */
  async getBusinessRegions(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.urls.business}/regions`, { timeout: TIMEOUT_MS.lookup });
      return response.data.regions || [];
    } catch (err) {
      this.logger.warn('Region list unavailable: ' + err.message);
      return [];
    }
  }

  // ── Conversation ────────────────────────────────────────────────────────────

  /**
   * The agent's next line.
   *
   * @param company Per-tenant facts the agent may state, from the caller's
   *   onboarding profile. Omitted/null keeps the generic script. One shared
   *   model serves every tenant this way: a fine-tune per customer would be a
   *   ~1GB model each, rebuilt whenever they edited their own data.
   */
  async generateResponse(
    history: ChatMessage[],
    maxTokens = 150,
    company?: Record<string, any> | null,
  ): Promise<string> {
    try {
      const response = await axios.post(`${this.urls.llm}/chat`,
        {
          conversation_history: history,
          max_tokens: maxTokens,
          ...(company ? { company } : {}),
        }, { timeout: TIMEOUT_MS.chat });
      return response.data.response || CHAT_RETRY_REPLY;
    } catch (err) {
      this.logger.warn('LLM chat error: ' + err?.message);
      return CHAT_FAILURE_REPLY;
    }
  }

  async qualifyLead(transcript: string): Promise<LeadQualification> {
    try {
      const response = await axios.post(`${this.urls.llm}/qualify`, { transcript }, { timeout: TIMEOUT_MS.qualify });
      return response.data;
    } catch (err) {
      this.logger.warn('LLM qualify error: ' + err?.message);
      return { outcome: 'contacted', score: NEUTRAL_LEAD_SCORE, notes: 'auto-qualified' };
    }
  }

  // ── Health ──────────────────────────────────────────────────────────────────

  /** Reachability of each Python service, checked in parallel. */
  async checkHealth(): Promise<Record<string, ServiceHealth>> {
    const services: Array<[string, string]> = [
      ['STT/TTS', `${this.urls.stt}/health`],
      ['Leads', `${this.urls.leads}/health`],
      ['Business', `${this.urls.business}/health`],
      ['LLM', `${this.urls.llm}/health`],
    ];
    const results = await Promise.all(services.map(([, url]) =>
      axios.get(url, { timeout: TIMEOUT_MS.health }).then(
        (): ServiceHealth => 'healthy',
        (): ServiceHealth => 'unavailable',
      ),
    ));
    return Object.fromEntries(services.map(([name], i) => [name, results[i]]));
  }
}
