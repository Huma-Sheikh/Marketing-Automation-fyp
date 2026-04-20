import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { Subscription } from '../database/entities/subscription.entity';
import { User } from '../database/entities/user.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Subscription, User])],
  providers: [BillingService],
  controllers: [BillingController],
  exports: [BillingService],
})
export class BillingModule {}
