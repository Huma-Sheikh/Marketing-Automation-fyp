import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';

export interface BusinessSearchQuery {
  location: string;
  category: string;
  region_code?: string;
  radius_meters?: number;
  min_rating?: number;
  max_rating?: number;
  max_results?: number;
}

export interface LeadScoreFeatures {
  platform_origin: number;        // 1-5, source platform quality
  job_title_seniority: number;    // 1-5, CEO/founder = 5
  has_email: 0 | 1;
  has_phone: 0 | 1;
  company_size_indicator: number; // 1 = solo, 3 = SME, 5 = enterprise
  engagement_estimate: number;    // 0-100
  industry_signal: number;        // 1 = low-value, 5 = high-value industry
  bio_completeness: number;       // 0.0-1.0, how much of the profile is filled in
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private STT_URL: string;
  private TTS_URL: string;
  private LEADS_URL: string;
  private BUSINESS_URL: string;
  private LLM_URL: string;

  constructor(private config: ConfigService) {
    this.STT_URL = config.get('STT_SERVICE_URL', 'http://localhost:8001');
    this.TTS_URL = config.get('TTS_SERVICE_URL', 'http://localhost:8001');
    this.LEADS_URL = config.get('LEADS_SERVICE_URL', 'http://localhost:8002');
    this.BUSINESS_URL = config.get('BUSINESS_SERVICE_URL', 'http://localhost:8003');
    this.LLM_URL = config.get('LLM_SERVICE_URL', 'http://localhost:8004');
  }

  async transcribeAudio(audioBuffer: Buffer, language = 'en'): Promise<string> {
    try {
      const form = new FormData();
      form.append('audio', audioBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
      form.append('language', language);
      const response = await axios.post(`${this.STT_URL}/stt`, form, {
        headers: form.getHeaders(), timeout: 10000,
      });
      return response.data.text || '';
    } catch (err) {
      this.logger.warn('STT error: ' + err.message);
      return '';
    }
  }

  async synthesizeSpeech(text: string, language = 'en'): Promise<Buffer> {
    try {
      const response = await axios.post(
        `${this.TTS_URL}/tts`,
        { text, language },
        { responseType: 'arraybuffer', timeout: 15000 },
      );
      return Buffer.from(response.data);
    } catch (err) {
      this.logger.warn('TTS error: ' + err.message);
      // Return empty buffer - call will have silence
      return Buffer.alloc(0);
    }
  }

  async scrapeLeads(platform: string, query: string, maxResults = 100): Promise<any[]> {
    try {
      const response = await axios.post(`${this.LEADS_URL}/scrape`,
        { platform, query, max_results: maxResults }, { timeout: 120000 });
      return response.data.leads || [];
    } catch (err) {
      this.logger.warn('Lead scraper error: ' + err.message);
      return [];
    }
  }

  /**
   * Feature vector for the XGBoost lead scorer. These names are a contract with
   * leads-service: they must match `feature_names` in
   * python-services/leads-service/model/scorer/training_summary.json exactly.
   * The service rejects unknown keys, so a rename here fails loudly rather than
   * silently scoring every lead the same.
   */
  async scoreLead(features: LeadScoreFeatures): Promise<number> {
    try {
      const response = await axios.post(`${this.LEADS_URL}/score`, features, { timeout: 5000 });
      const score = response.data?.score;
      return typeof score === 'number' ? score : 50;
    } catch (err) {
      this.logger.warn('Lead scoring failed, using neutral score: ' + err.message);
      return 50;
    }
  }

  /**
   * Business search. `endpoint` selects between the plain search and the
   * find-opportunities variant, which sorts worst-rated first and attaches an
   * outreach script - the whole point of the sentiment model.
   */
  async searchBusinesses(query: BusinessSearchQuery, endpoint: 'search' | 'find-opportunities' = 'search') {
    try {
      const response = await axios.post(`${this.BUSINESS_URL}/${endpoint}`, query, { timeout: 60000 });
      return response.data;
    } catch (err) {
      this.logger.warn('Business search error: ' + err.message);
      return { businesses: [], total: 0, error: 'Business service unavailable' };
    }
  }

  /** Region presets the business service supports (for the UI picker). */
  async getBusinessRegions(): Promise<any[]> {
    try {
      const response = await axios.get(`${this.BUSINESS_URL}/regions`, { timeout: 5000 });
      return response.data.regions || [];
    } catch (err) {
      this.logger.warn('Region list unavailable: ' + err.message);
      return [];
    }
  }

  /**
   * @param company Per-tenant facts the agent may state, from the caller's
   *   onboarding profile. Omitted/null keeps the generic script, which is what
   *   every existing caller gets. One shared model serves every tenant this
   *   way — a fine-tune per customer would be a ~1GB model each, rebuilt
   *   whenever they edited their own data.
   */
  async generateResponse(
    history: Array<{ role: string; content: string }>,
    maxTokens = 150,
    company?: Record<string, any> | null,
  ): Promise<string> {
    try {
      const response = await axios.post(`${this.LLM_URL}/chat`,
        {
          conversation_history: history,
          max_tokens: maxTokens,
          ...(company ? { company } : {}),
        }, { timeout: 8000 });
      return response.data.response || "I apologize, I had trouble responding. Could you repeat that?";
    } catch {
      return "I apologize, I had a technical difficulty. Can I call you back?";
    }
  }

  async qualifyLead(transcript: string): Promise<{ outcome: string; score: number; notes: string }> {
    try {
      const response = await axios.post(`${this.LLM_URL}/qualify`, { transcript }, { timeout: 10000 });
      return response.data;
    } catch {
      return { outcome: 'contacted', score: 50, notes: 'auto-qualified' };
    }
  }

  async checkHealth(): Promise<object> {
    const services = [
      { name: 'STT/TTS', url: `${this.STT_URL}/health` },
      { name: 'Leads', url: `${this.LEADS_URL}/health` },
      { name: 'Business', url: `${this.BUSINESS_URL}/health` },
      { name: 'LLM', url: `${this.LLM_URL}/health` },
    ];
    const results: Record<string, string> = {};
    for (const svc of services) {
      try {
        await axios.get(svc.url, { timeout: 3000 });
        results[svc.name] = 'healthy';
      } catch {
        results[svc.name] = 'unavailable';
      }
    }
    return results;
  }
}
