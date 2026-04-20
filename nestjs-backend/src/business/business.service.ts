import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
@Injectable()
export class BusinessService {
  constructor(private aiService: AiService) {}
  async searchBusinesses(location: string, category: string) {
    return this.aiService.searchBusinesses(location, category);
  }
}
