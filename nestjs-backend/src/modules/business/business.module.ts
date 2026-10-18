import { Module } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessController } from './business.controller';
import { AiModule } from '../ai/ai.module';
@Module({
  imports: [AiModule],
  providers: [BusinessService],
  controllers: [BusinessController],
})
export class BusinessModule {}
