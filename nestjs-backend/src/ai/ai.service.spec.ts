import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService } from './ai.service';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockConfig = {
  get: jest.fn().mockImplementation((key: string, def?: string) => {
    const urls: Record<string, string> = {
      STT_SERVICE_URL: 'http://localhost:8001',
      TTS_SERVICE_URL: 'http://localhost:8001',
      LEADS_SERVICE_URL: 'http://localhost:8002',
      BUSINESS_SERVICE_URL: 'http://localhost:8003',
      LLM_SERVICE_URL: 'http://localhost:8004',
    };
    return urls[key] ?? def;
  }),
};

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    jest.clearAllMocks();
  });

  // ─── transcribeAudio ──────────────────────────────────────────────────────────

  describe('transcribeAudio', () => {
    it('returns transcribed text from STT service', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { text: 'Hello world' } });

      const result = await service.transcribeAudio(Buffer.from('audio'));

      expect(result).toBe('Hello world');
    });

    it('returns empty string when STT service fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.transcribeAudio(Buffer.from('audio'));

      expect(result).toBe('');
    });

    it('returns empty string when response has no text field', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      const result = await service.transcribeAudio(Buffer.from('audio'));

      expect(result).toBe('');
    });
  });

  // ─── synthesizeSpeech ─────────────────────────────────────────────────────────

  describe('synthesizeSpeech', () => {
    it('returns audio Buffer from TTS service', async () => {
      const audioData = new Uint8Array([1, 2, 3]).buffer;
      mockedAxios.post.mockResolvedValueOnce({ data: audioData });

      const result = await service.synthesizeSpeech('Hello');

      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('returns empty Buffer when TTS service fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('TTS down'));

      const result = await service.synthesizeSpeech('Hello');

      expect(result.length).toBe(0);
    });
  });

  // ─── scrapeLeads ──────────────────────────────────────────────────────────────

  describe('scrapeLeads', () => {
    it('returns leads array from leads service', async () => {
      const leads = [{ firstName: 'Ahmed', email: 'a@co.ae' }];
      mockedAxios.post.mockResolvedValueOnce({ data: { leads } });

      const result = await service.scrapeLeads('linkedin', 'CEO Dubai', 10);

      expect(result).toEqual(leads);
    });

    it('returns empty array when leads service fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Service down'));

      const result = await service.scrapeLeads('linkedin', 'CEO', 5);

      expect(result).toEqual([]);
    });

    it('returns empty array when response has no leads field', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      const result = await service.scrapeLeads('twitter', 'test', 5);

      expect(result).toEqual([]);
    });
  });

  // ─── scoreLead ────────────────────────────────────────────────────────────────

  describe('scoreLead', () => {
    // Mirrors feature_names in model/scorer/training_summary.json.
    const FEATURES = {
      platform_origin: 5,
      job_title_seniority: 5,
      has_email: 1 as const,
      has_phone: 1 as const,
      company_size_indicator: 3,
      engagement_estimate: 80,
      industry_signal: 3,
      bio_completeness: 0.75,
    };

    it('sends the feature vector to the leads service unchanged', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { score: 91 } });

      await service.scoreLead(FEATURES);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/score'),
        FEATURES,
        expect.anything(),
      );
    });

    it('preserves a legitimate score of 0 instead of coercing it to 50', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { score: 0 } });

      expect(await service.scoreLead(FEATURES)).toBe(0);
    });

    it('returns score from leads service', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { score: 75 } });

      const result = await service.scoreLead(FEATURES);

      expect(result).toBe(75);
    });

    it('returns 50 as default when service fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Service down'));

      const result = await service.scoreLead(FEATURES);

      expect(result).toBe(50);
    });
  });

  // ─── searchBusinesses ─────────────────────────────────────────────────────────

  describe('searchBusinesses', () => {
    const QUERY = { location: 'Dubai', category: 'restaurant' };

    it('returns the full service payload, not just the array', async () => {
      const payload = { businesses: [{ name: 'Cafe X', rating: 3.5 }], total: 1 };
      mockedAxios.post.mockResolvedValueOnce({ data: payload });

      expect(await service.searchBusinesses(QUERY)).toEqual(payload);
    });

    it('posts to /search by default', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await service.searchBusinesses(QUERY);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/search$/), QUERY, expect.anything(),
      );
    });

    it('posts to /find-opportunities when that endpoint is requested', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      await service.searchBusinesses(QUERY, 'find-opportunities');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/find-opportunities$/), QUERY, expect.anything(),
      );
    });

    it('forwards the optional region and rating filters untouched', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });
      const filtered = { ...QUERY, region_code: 'ae-dubai', max_rating: 3.5, max_results: 40 };

      await service.searchBusinesses(filtered);

      expect(mockedAxios.post).toHaveBeenCalledWith(expect.any(String), filtered, expect.anything());
    });

    it('degrades to an empty result set when the service is down', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('timeout'));

      const result = await service.searchBusinesses(QUERY);

      expect(result.businesses).toEqual([]);
      expect(result.error).toBeDefined();
    });
  });

  // ─── getBusinessRegions ─────────────────────────────────────────────

  describe('getBusinessRegions', () => {
    it('returns the region presets', async () => {
      const regions = [{ code: 'ae-dubai', label: 'Dubai, UAE' }];
      mockedAxios.get.mockResolvedValueOnce({ data: { regions } });

      expect(await service.getBusinessRegions()).toEqual(regions);
    });

    it('returns an empty list when the service is unreachable', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('down'));

      expect(await service.getBusinessRegions()).toEqual([]);
    });
  });

  // ─── generateResponse ─────────────────────────────────────────────────────────

  describe('generateResponse', () => {
    it('returns generated response from LLM service', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { response: 'Would you like a demo?' },
      });

      const result = await service.generateResponse([{ role: 'user', content: 'Hi' }]);

      expect(result).toBe('Would you like a demo?');
    });

    it('returns fallback message when LLM service fails', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('LLM down'));

      const result = await service.generateResponse([]);

      expect(result).toContain('technical difficulty');
    });

    it('returns apology fallback when response field missing', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: {} });

      const result = await service.generateResponse([]);

      expect(result).toContain('trouble responding');
    });
  });

  // ─── qualifyLead ──────────────────────────────────────────────────────────────

  describe('qualifyLead', () => {
    it('returns qualification data from LLM service', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        data: { outcome: 'qualified', score: 85, notes: 'Interested in demo' },
      });

      const result = await service.qualifyLead('Yes, I would love to see a demo');

      expect(result.outcome).toBe('qualified');
      expect(result.score).toBe(85);
    });

    it('returns default qualification on error', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('LLM down'));

      const result = await service.qualifyLead('some transcript');

      expect(result).toEqual({ outcome: 'contacted', score: 50, notes: 'auto-qualified' });
    });
  });

  // ─── checkHealth ──────────────────────────────────────────────────────────────

  describe('checkHealth', () => {
    it('marks all services healthy when they respond', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

      const result = await service.checkHealth() as Record<string, string>;

      expect(result['STT/TTS']).toBe('healthy');
      expect(result['Leads']).toBe('healthy');
      expect(result['Business']).toBe('healthy');
      expect(result['LLM']).toBe('healthy');
    });

    it('marks specific service unavailable when it fails', async () => {
      mockedAxios.get
        .mockResolvedValueOnce({ data: {} }) // STT/TTS
        .mockRejectedValueOnce(new Error('down')) // Leads
        .mockResolvedValueOnce({ data: {} }) // Business
        .mockResolvedValueOnce({ data: {} }); // LLM

      const result = await service.checkHealth() as Record<string, string>;

      expect(result['STT/TTS']).toBe('healthy');
      expect(result['Leads']).toBe('unavailable');
      expect(result['Business']).toBe('healthy');
      expect(result['LLM']).toBe('healthy');
    });

    it('marks all services unavailable when all fail', async () => {
      mockedAxios.get.mockRejectedValue(new Error('all down'));

      const result = await service.checkHealth() as Record<string, string>;

      expect(Object.values(result).every((v) => v === 'unavailable')).toBe(true);
    });
  });
});
