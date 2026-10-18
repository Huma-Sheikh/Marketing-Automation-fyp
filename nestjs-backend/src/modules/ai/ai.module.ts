import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

/** Client for the Python AI microservices; imported by every module that needs a model. */
@Module({
  providers: [AiService],
  controllers: [AiController],
  exports: [AiService],
})
export class AiModule {}
