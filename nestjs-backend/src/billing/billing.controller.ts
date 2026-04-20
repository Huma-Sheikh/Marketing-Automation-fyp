import { Controller, Post, Get, Body, Headers, Req, UseGuards, Request } from '@nestjs/common';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
@Controller('billing')
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Post('checkout') @UseGuards(JwtAuthGuard)
  createCheckout(@Body() body: { plan: string }, @Request() req) {
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createCheckoutSession(req.user.id, body.plan, `${base}/billing/success`, `${base}/billing`);
  }

  @Post('portal') @UseGuards(JwtAuthGuard)
  createPortal(@Request() req) {
    const base = process.env.FRONTEND_URL || 'http://localhost:3000';
    return this.billingService.createBillingPortal(req.user.id, `${base}/billing`);
  }

  @Get('subscription') @UseGuards(JwtAuthGuard)
  getSubscription(@Request() req) { return this.billingService.getSubscription(req.user.id); }

  @Post('webhook')
  handleWebhook(@Req() req: any, @Headers('stripe-signature') sig: string) {
    return this.billingService.handleWebhook(req.rawBody || req.body, sig);
  }
}
