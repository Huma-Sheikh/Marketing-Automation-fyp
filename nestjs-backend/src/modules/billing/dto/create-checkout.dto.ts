import { IsIn } from 'class-validator';
import { PAID_PLANS, PaidPlan } from '../billing.constants';

export class CreateCheckoutDto {
  @IsIn(PAID_PLANS, { message: `plan must be one of: ${PAID_PLANS.join(', ')}` })
  plan: PaidPlan;
}
