export type BusinessQuery = {
  location: string;
  category: string;
  region_code?: string;
  radius_meters?: number;
  min_rating?: number;
  max_rating?: number;
  max_results?: number;
};

export type Region = { code: string; label: string };

export type Business = {
  place_id?: string;
  name: string;
  address?: string;
  phone?: string | null;
  phone_intl?: string | null;
  website?: string | null;
  rating: number | null;
  review_count?: number | null;
  sentiment?: string;
  business_category?: string;
  opportunity?: string;
  outreach_script?: string;
  [key: string]: any;
};

export type BusinessSearchResult = { businesses?: Business[]; error?: string };
