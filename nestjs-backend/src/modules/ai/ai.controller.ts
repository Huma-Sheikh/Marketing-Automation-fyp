import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /** { "STT/TTS": "healthy" | "unavailable", Leads, Business, LLM } */
  @Get('health')
  checkHealth() {
    return this.aiService.checkHealth();
  }
}
