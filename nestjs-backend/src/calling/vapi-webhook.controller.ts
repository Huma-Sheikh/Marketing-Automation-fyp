import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { CallingService } from './calling.service';

/**
 * Vapi "Server URL" target for calls placed on a tenant's Vapi number. Set the
 * Server URL of the Vapi assistant (or phone number) to
 * `${BASE_URL}/api/vapi/webhook`, and ideally a secret, which Vapi sends back
 * as `x-vapi-secret`.
 */
@Controller('vapi')
export class VapiWebhookController {
  constructor(private readonly callingService: CallingService) {}

  @Post('webhook')
  @HttpCode(200)
  async handle(@Body() body: any, @Headers('x-vapi-secret') secret?: string) {
    const authorised = await this.callingService.handleVapiEvent(body?.message, secret);
    if (!authorised) throw new UnauthorizedException('Invalid x-vapi-secret');
    return { received: true };
  }
}
