import { ConfigService } from '@nestjs/config';
export declare class AiService {
    private config;
    private readonly logger;
    private STT_URL;
    private TTS_URL;
    private LEADS_URL;
    private BUSINESS_URL;
    private LLM_URL;
    constructor(config: ConfigService);
    transcribeAudio(audioBuffer: Buffer, language?: string): Promise<string>;
    synthesizeSpeech(text: string, language?: string): Promise<Buffer>;
    scrapeLeads(platform: string, query: string, maxResults?: number): Promise<any[]>;
    scoreLead(features: object): Promise<number>;
    searchBusinesses(location: string, category: string): Promise<any[]>;
    generateResponse(history: Array<{
        role: string;
        content: string;
    }>, maxTokens?: number): Promise<string>;
    qualifyLead(transcript: string): Promise<{
        outcome: string;
        score: number;
        notes: string;
    }>;
    checkHealth(): Promise<object>;
}
