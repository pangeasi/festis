import rawData from '../festivales_modofestival.json';
import type { Festival, FestivalsPayload } from './types';

export const payload = rawData as unknown as FestivalsPayload;

export const festivals: Festival[] = payload.festivals.map((festival) => ({
  ...festival,
  artists: festival.artists ?? [],
  official_sources: festival.official_sources ?? [],
  social_urls: festival.social_urls ?? [],
  ticket_prices: festival.ticket_prices ?? [],
  program: festival.program ?? [],
  lineup_url: festival.lineup_url ?? null,
  lineup_source: festival.lineup_source ?? null,
  lineup_confidence: festival.lineup_confidence ?? null,
  lineup_extraction_method: festival.lineup_extraction_method ?? null,
  lineup_model: festival.lineup_model ?? null,
  lineup_extracted_at: festival.lineup_extracted_at ?? null,
  styles: festival.styles ?? [],
}));
