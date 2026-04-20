import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import { Call } from '../database/entities/call.entity';
import { Lead } from '../database/entities/lead.entity';

@Injectable()
export class CallingService {
  private readonly logger = new Logger(CallingService.name);
  private activeConversations = new Map<string, Array<{ role: string; content: string }>>();
  private twilioClient: any = null;
  private fromNumber: string;

  constructor(
    @InjectRepository(Call) private callRepo: Repository<Call>,
    @InjectRepository(Lead) private leadRepo: Repository<Lead>,
    @InjectQueue('calling') private callingQueue: Queue,
    private config: ConfigService,
  ) {
    this.fromNumber = config.get('TWILIO_PHONE_NUMBER', '');
    try {
      const twilio = require('twilio');
      this.twilioClient = new twilio.Twilio(
        config.get('TWILIO_ACCOUNT_SID'),
        config.get('TWILIO_AUTH_TOKEN'),
      );
    } catch (e) {
      this.logger.warn('Twilio client init failed - check credentials');
    }
  }

  async startCampaignCalls(campaignId: string, leads: Lead[], settings: any) {
    const maxConcurrent = settings?.maxConcurrentCalls || 60;
    let queued = 0;
    for (const lead of leads) {
      if (!lead.phone) continue;
      await this.callingQueue.add('dial-lead', {
        leadId: lead.id, phoneNumber: lead.phone, campaignId,
        leadName: `${lead.firstName || ''} ${lead.lastName || ''}`.trim(), settings,
      }, { attempts: 2, backoff: 30000, removeOnComplete: true });
      queued++;
    }
    this.logger.log(`Queued ${queued} calls for campaign ${campaignId}`);
    return { queued, maxConcurrent };
  }

  async initiateCall(leadId: string, phoneNumber: string, campaignId: string): Promise<string> {
    const baseUrl = this.config.get('BASE_URL', 'https://yourdomain.com');
    if (!this.twilioClient) throw new Error('Twilio not configured');
    const call = await this.twilioClient.calls.create({
      to: phoneNumber,
      from: this.fromNumber,
      url: `${baseUrl}/api/twiml/outbound?leadId=${leadId}&campaignId=${campaignId}`,
      statusCallback: `${baseUrl}/api/twiml/status`,
      statusCallbackMethod: 'POST',
      machineDetection: 'DetectMessageEnd',
      timeout: 30,
    });
    await this.callRepo.save(this.callRepo.create({
      leadId, campaignId, twilioCallSid: call.sid, status: 'initiated',
    }));
    this.activeConversations.set(call.sid, []);
    this.logger.log(`Call initiated: ${call.sid} to ${phoneNumber}`);
    return call.sid;
  }

  async handleAudioChunk(callSid: string, audioBase64: string, aiService: any): Promise<Buffer | null> {
    try {
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      const transcript = await aiService.transcribeAudio(audioBuffer);
      if (!transcript || transcript.trim().length < 3) return null;

      const history = this.activeConversations.get(callSid) || [];
      history.push({ role: 'user', content: transcript });

      const aiResponse = await aiService.generateResponse(history);
      history.push({ role: 'assistant', content: aiResponse });
      this.activeConversations.set(callSid, history);

      return await aiService.synthesizeSpeech(aiResponse);
    } catch (err) {
      this.logger.error(`Audio processing error for ${callSid}: ${err.message}`);
      return null;
    }
  }

  async handleCallComplete(callSid: string, duration: number, aiService: any) {
    const history = this.activeConversations.get(callSid);
    if (history && history.length > 0) {
      const transcriptText = history.map(m => (m.role === 'user' ? 'Lead' : 'Agent') + ': ' + m.content).join('\n');
      const qualification = await aiService.qualifyLead(transcriptText);
      await this.callRepo.update({ twilioCallSid: callSid }, {
        status: 'completed', durationSeconds: duration,
        transcript: transcriptText, outcome: qualification.outcome,
      });
      const call = await this.callRepo.findOne({ where: { twilioCallSid: callSid } });
      if (call?.leadId) {
        await this.leadRepo.update(call.leadId, { status: qualification.outcome || 'contacted' });
      }
    }
    this.activeConversations.delete(callSid);
  }

  getActiveCallCount(): number { return this.activeConversations.size; }

  async stopCampaign(campaignId: string) {
    await this.callingQueue.pause();
    const jobs = await this.callingQueue.getJobs(['waiting', 'delayed']);
    for (const job of jobs) {
      if (job.data.campaignId === campaignId) await job.remove();
    }
    await this.callingQueue.resume();
  }
}
