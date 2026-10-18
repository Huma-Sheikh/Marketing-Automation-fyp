import { Body, Controller, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { BillingService } from './billing.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billingService: BillingService,
    private readonly config: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  @Post('checkout') @UseGuards(JwtAuthGuard)
  createCheckout(@Body() body: CreateCheckoutDto, @CurrentUser('id') userId: string) {
    const base = this.frontendUrl;
    return this.billingService.createCheckoutSession(userId, body.plan, `${base}/billing/success`, `${base}/billing`);
  }

  @Post('portal') @UseGuards(JwtAuthGuard)
  createPortal(@CurrentUser('id') userId: string) {
    return this.billingService.createBillingPortal(userId, `${this.frontendUrl}/billing`);
  }

  @Get('subscription') @UseGuards(JwtAuthGuard)
  getSubscription(@CurrentUser('id') userId: string) {
    return this.billingService.getSubscription(userId);
  }

  /** Stripe → us. Unauthenticated; trust comes from the signature check. Receives the raw body (see main.ts). */
  @Post('webhook')
  handleWebhook(@Req() req: any, @Headers('stripe-signature') signature: string) {
    return this.billingService.handleWebhook(req.rawBody || req.body, signature);
  }
}
