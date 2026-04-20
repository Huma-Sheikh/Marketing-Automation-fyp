import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as FormData from 'form-data';
import { Controller, Get, UseGuards } from '@nestjs/common';

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

  async scoreLead(features: object): Promise<number> {
    try {
      const response = await axios.post(`${this.LEADS_URL}/score`, features, { timeout: 5000 });
      return response.data.score || 50;
    } catch {
      return 50;
    }
  }

  async searchBusinesses(location: string, category: string): Promise<any[]> {
    try {
      const response = await axios.post(`${this.BUSINESS_URL}/search`,
        { location, category }, { timeout: 30000 });
      return response.data.businesses || [];
    } catch (err) {
      this.logger.warn('Business search error: ' + err.message);
      return [];
    }
  }

  async generateResponse(
    history: Array<{ role: string; content: string }>,
    maxTokens = 150,
  ): Promise<string> {
    try {
      const response = await axios.post(`${this.LLM_URL}/chat`,
        { conversation_history: history, max_tokens: maxTokens }, { timeout: 8000 });
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
