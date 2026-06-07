export type Festival = {
  name: string;
  slug: string;
  festival_url: string | null;
  ticket_url: string | null;
  date_text: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  city: string | null;
  region: string | null;
  styles: string[];
  image_url: string | null;
  image_full_url: string | null;
  image_alt: string | null;
  edition: string | null;
  countdown: string | null;
  status: string | null;
  description: string | null;
  artists: string[];
  official_url?: string | null;
  social_urls?: FestivalSocialUrl[];
  ticket_prices?: FestivalTicketPrice[];
  ticket_price_summary?: string | null;
  program?: FestivalProgramItem[];
  official_sources?: string[];
  official_enriched_at?: string | null;
  official_enrichment_model?: string | null;
  official_enrichment_confidence?: 'high' | 'medium' | 'low' | null;
  lineup_url: string | null;
  lineup_source: 'local' | 'festival' | 'ticket' | 'search' | 'official' | null;
  lineup_confidence: 'high' | 'medium' | 'low' | null;
  lineup_extraction_method: 'llm' | 'heuristic' | null;
  lineup_model: string | null;
  lineup_extracted_at: string | null;
};

export type FestivalSocialUrl = {
  platform: string;
  url: string;
};

export type FestivalTicketPrice = {
  label: string | null;
  price_text: string | null;
  amount: number | null;
  currency: string | null;
  source_url: string | null;
};

export type FestivalProgramItem = {
  date: string | null;
  time: string | null;
  stage: string | null;
  artist: string | null;
  title: string | null;
  source_url: string | null;
};

export type FestivalsPayload = {
  source: string;
  extracted_at: string;
  count: number;
  festivals: Festival[];
};

export type SelectOption = {
  label: string;
  value: string;
};
