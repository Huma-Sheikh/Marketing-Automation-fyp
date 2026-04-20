import { Controller, Post, Query, Res, Body } from '@nestjs/common';
import { Response } from 'express';

@Controller('twiml')
export class TwimlController {

  @Post('outbound')
  handleOutbound(@Query('leadId') leadId: string, @Query('campaignId') campaignId: string, @Res() res: Response) {
    const baseUrl = (process.env.BASE_URL || 'https://yourdomain.com').replace('https://', '');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna" language="en-US">Please hold for just a moment.</Say>
  <Connect>
    <Stream url="wss://${baseUrl}/audio-stream" name="call-${leadId}">
      <Parameter name="leadId" value="${leadId}"/>
      <Parameter name="campaignId" value="${campaignId}"/>
    </Stream>
  </Connect>
</Response>`;
    res.type('text/xml').send(twiml);
  }

  @Post('inbound')
  handleInbound(@Res() res: Response) {
    const baseUrl = (process.env.BASE_URL || 'https://yourdomain.com').replace('https://', '');
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">Thank you for calling. Our AI assistant will be with you shortly.</Say>
  <Connect>
    <Stream url="wss://${baseUrl}/audio-stream"/>
  </Connect>
</Response>`;
    res.type('text/xml').send(twiml);
  }

  @Post('status')
  handleStatus(@Body() body: any) {
    console.log('Call status:', body.CallSid, body.CallStatus, body.CallDuration + 's');
    return { received: true };
  }
}
