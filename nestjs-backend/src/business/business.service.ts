import { Injectable } from '@nestjs/common';
import { AiService, BusinessSearchQuery } from '../ai/ai.service';

@Injectable()
export class BusinessService {
  constructor(private aiService: AiService) {}

  searchBusinesses(query: BusinessSearchQuery) {
    return this.aiService.searchBusinesses(query, 'search');
  }

  /**
   * Low-rated businesses in a category/region — the prospecting view. The
   * service sorts worst-first and attaches an outreach script per result.
   */
  findOpportunities(query: BusinessSearchQuery) {
    return this.aiService.searchBusinesses(query, 'find-opportunities');
  }

  getRegions() {
    return this.aiService.getBusinessRegions();
  }
}
