/**
 * Request/response contracts with the Python AI services. Field names are
 * snake_case because they are sent to FastAPI as-is.
 */

/** POST business-service /search and /find-opportunities. */
export interface BusinessSearchQuery {
  location: string;
  category: string;
  region_code?: string;
  radius_meters?: number;
  min_rating?: number;
  max_rating?: number;
  max_results?: number;
}

/**
 * Feature vector for the XGBoost lead scorer. These names must match
 * `feature_names` in python-services/leads-service/model/scorer/training_summary.json
 * exactly; the service rejects unknown keys so a rename fails loudly.
 */
export interface LeadScoreFeatures {
  platform_origin: number;        // 1-5, source platform quality
  job_title_seniority: number;    // 1-5, CEO/founder = 5
  has_email: 0 | 1;
  has_phone: 0 | 1;
  company_size_indicator: number; // 1 = solo, 3 = SME, 5 = enterprise
  engagement_estimate: number;    // 0-100
  industry_signal: number;        // 1 = low-value, 5 = high-value industry
  bio_completeness: number;       // 0.0-1.0, how much of the profile is filled in
}

export interface ChatMessage {
  role: string;
  content: string;
}

/** Outcome of llm-service /qualify for one call transcript. */
export interface LeadQualification {
  outcome: string;
  score: number;
  notes: string;
}

export type ServiceHealth = 'healthy' | 'unavailable';
