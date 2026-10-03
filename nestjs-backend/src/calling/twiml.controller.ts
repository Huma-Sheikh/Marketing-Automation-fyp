import { Controller, Post, Query, Res, Body, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { CallingService } from './calling.service';
import { MEDIA_STREAM_PATH } from './twilio-media-stream.server';

@Controller('twiml')
export class TwimlController {
  private readonly logger = new Logger(TwimlController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly callingService: CallingService,
  ) {}

  /**
   * Build the `wss://host/audio-stream` URL Twilio should dial.
   *
   * The previous implementation did `BASE_URL.replace('https://', '')`, which
   * produced `wss://http://localhost/audio-stream` for any http BASE_URL and
   * silently dropped the port. Parsing the URL properly keeps the host *and*
   * port, which matters because Twilio needs a publicly reachable address
   * (an ngrok/tunnel host in development).
   */
  private streamUrl(): string {
    const base = this.config.get('BASE_URL', 'http://localhost:3001');
    try {
      return `wss://${new URL(base).host}${MEDIA_STREAM_PATH}`;
    } catch {
      this.logger.error(`BASE_URL is not a valid URL: "${base}"`);
      return `wss://localhost${MEDIA_STREAM_PATH}`;
    }
  }

  private escapeXml(value: string): string {
    return String(value ?? '').replace(/[<>&'"]/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]),
    );
  }

  @Post('outbound')
  handleOutbound(
    @Query('leadId') leadId: string,
    @Query('campaignId') campaignId: string,
    @Res() res: Response,
  ) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${this.streamUrl()}">
      <Parameter name="leadId" value="${this.escapeXml(leadId)}"/>
      <Parameter name="campaignId" value="${this.escapeXml(campaignId)}"/>
    </Stream>
  </Connect>
</Response>`;
    res.type('text/xml').send(twiml);
  }

  @Post('inbound')
  handleInbound(@Res() res: Response) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${this.streamUrl()}"/>
  </Connect>
</Response>`;
    res.type('text/xml').send(twiml);
  }

  @Post('status')
  async handleStatus(@Body() body: any) {
    const duration = body?.CallDuration ? Number(body.CallDuration) : undefined;
    this.logger.log(`Call ${body?.CallSid}: ${body?.CallStatus} (${duration ?? 0}s)`);
    await this.callingService.recordStatusCallback(body?.CallSid, body?.CallStatus, duration);
    return { received: true };
  }
}
