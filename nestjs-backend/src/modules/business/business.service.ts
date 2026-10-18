import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service';
import { BusinessSearchQuery } from '../ai/ai.types';

/** Business prospecting via business-service (Google Places + review sentiment). */
@Injectable()
export class BusinessService {
  constructor(private readonly aiService: AiService) {}

  searchBusinesses(query: BusinessSearchQuery) {
    return this.aiService.searchBusinesses(query, 'search');
  }

  /**
   * Low-rated businesses in a category/region: the prospecting view. The
   * service sorts worst-first and attaches an outreach script per result.
   */
  findOpportunities(query: BusinessSearchQuery) {
    return this.aiService.searchBusinesses(query, 'find-opportunities');
  }

  getRegions() {
    return this.aiService.getBusinessRegions();
  }
}
