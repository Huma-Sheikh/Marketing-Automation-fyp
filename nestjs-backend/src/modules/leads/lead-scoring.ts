import { LeadScoreFeatures } from '../ai/ai.types';

/**
 * Pure feature engineering for the XGBoost lead scorer. Every helper produces
 * features on the scale the model was trained on (see
 * python-services/leads-service/model/scorer/training_summary.json); nothing
 * here touches the database or the network, so it is unit-tested directly.
 */

const PLATFORM_SCORES: Record<string, number> = { linkedin: 5, instagram: 4, twitter: 3, tiktok: 3, facebook: 2 };

/** Profile fields that count towards bio completeness. */
const PROFILE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'location', 'website'];

/** 1-5: how much a lead from this platform is typically worth. */
export function platformScore(platform: string): number {
  return PLATFORM_SCORES[platform] ?? 2;
}

/** 1-5: seniority implied by the job title (founder/CEO = 5). */
export function jobTitleScore(title: string | null | undefined): number {
  if (!title) return 1;
  const t = title.toLowerCase();
  if (t.includes('ceo') || t.includes('founder') || t.includes('owner')) return 5;
  if (t.includes('director') || t.includes('vp') || t.includes('vice president') || t.includes('head of')) return 4;
  if (t.includes('manager') || t.includes('lead')) return 3;
  return 2;
}

/**
 * 0-1: fraction of the profile fields we actually got a value for. A fuller
 * profile is both a richer lead and a signal the scrape found a real account.
 */
export function bioCompleteness(raw: Record<string, unknown>): number {
  const filled = PROFILE_FIELDS.filter(f => raw[f] != null && String(raw[f]).trim() !== '').length;
  return Math.round((filled / PROFILE_FIELDS.length) * 100) / 100;
}

export function buildScoreFeatures(platform: string, raw: Record<string, any>): LeadScoreFeatures {
  return {
    platform_origin: platformScore(platform),
    job_title_seniority: jobTitleScore(raw.jobTitle),
    has_email: raw.email ? 1 : 0,
    has_phone: raw.phone ? 1 : 0,
    // A scrape gives no company-size or industry signal yet, so both stay
    // neutral. Populate them when the NER/enrichment step starts returning them.
    company_size_indicator: 3,
    industry_signal: 3,
    engagement_estimate: typeof raw.engagement === 'number' ? raw.engagement : 50,
    bio_completeness: bioCompleteness(raw),
  };
}
