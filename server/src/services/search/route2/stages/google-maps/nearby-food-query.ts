/**
 * Nearby Search (New) cannot take a free-text keyword.
 * A real food word must go out as Text Search biased to the user's circle.
 * A generic "restaurant / near me" query stays on type-only Nearby Search.
 */

import type { NearbyMapping } from '../route-llm/schemas.js';

const GENERIC_NEARBY_KEYWORDS = new Set([
  'restaurant',
  'restaurants',
  'food',
  'place',
  'places',
  'מסעדה',
  'מסעדות',
  'אוכל',
]);

export function nearbyFoodTextQuery(keyword: string, region: string): string | null {
  const trimmed = keyword.trim().replace(/\s+/g, ' ');
  if (!trimmed || GENERIC_NEARBY_KEYWORDS.has(trimmed.toLowerCase())) {
    return null;
  }

  if (region && region !== 'IL') {
    if (trimmed.includes('איטלק') || trimmed.toLowerCase().includes('italian')) {
      return 'Italian restaurant';
    }
    return trimmed.toLowerCase().includes('restaurant') ? trimmed : `${trimmed} restaurant`;
  }

  return trimmed;
}

export type NearbyGoogleCall =
  | { api: 'searchNearby'; body: Record<string, unknown> }
  | { api: 'searchText'; textQuery: string; body: Record<string, unknown> };

export function buildNearbyGoogleCall(mapping: NearbyMapping): NearbyGoogleCall {
  const textQuery = nearbyFoodTextQuery(mapping.keyword, mapping.region);
  const languageCode = mapping.language === 'he' ? 'he' : 'en';

  if (!textQuery) {
    const body: Record<string, unknown> = {
      locationRestriction: {
        circle: {
          center: {
            latitude: mapping.location.lat,
            longitude: mapping.location.lng,
          },
          radius: mapping.radiusMeters,
        },
      },
      languageCode,
      includedTypes: ['restaurant'],
      rankPreference: 'DISTANCE',
    };
    if (mapping.region) body.regionCode = mapping.region;
    return { api: 'searchNearby', body };
  }

  const body: Record<string, unknown> = {
    textQuery,
    languageCode,
    locationBias: {
      circle: {
        center: {
          latitude: mapping.location.lat,
          longitude: mapping.location.lng,
        },
        radius: mapping.radiusMeters,
      },
    },
  };
  if (mapping.region) body.regionCode = mapping.region;
  return { api: 'searchText', textQuery, body };
}
