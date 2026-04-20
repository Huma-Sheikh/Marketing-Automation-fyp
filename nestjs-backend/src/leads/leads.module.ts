import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { Lead } from '../database/entities/lead.entity';
import { AiModule } from '../ai/ai.module';
@Module({
  imports: [TypeOrmModule.forFeature([Lead]), AiModule],
  providers: [LeadsService],
  controllers: [LeadsController],
  exports: [LeadsService],
})
export class LeadsModule {}
