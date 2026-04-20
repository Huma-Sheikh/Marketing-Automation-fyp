import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WhitelabelService } from './whitelabel.service';
import { WhitelabelController } from './whitelabel.controller';
import { Agency } from '../database/entities/agency.entity';
@Module({
  imports: [TypeOrmModule.forFeature([Agency])],
  providers: [WhitelabelService],
  controllers: [WhitelabelController],
  exports: [WhitelabelService],
})
export class WhitelabelModule {}
