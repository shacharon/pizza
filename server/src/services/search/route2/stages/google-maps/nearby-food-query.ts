/**
 * Nearby Search (New) cannot take a free-text keyword.
 * A real food word goes out as Text Search inside a rectangle built from the user's circle.
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

/** Text Search (New) hard fence is a rectangle. Build it from the same circle Nearby Search uses. */
export function circleToTextSearchRectangle(
  lat: number,
  lng: number,
  radiusMeters: number
): {
  low: { latitude: number; longitude: number };
  high: { latitude: number; longitude: number };
} {
  const metersPerDegreeLat = 111320;
  const latRad = (lat * Math.PI) / 180;
  const dLat = radiusMeters / metersPerDegreeLat;
  const dLng = radiusMeters / (metersPerDegreeLat * Math.max(Math.cos(latRad), 0.01));
  return {
    low: { latitude: lat - dLat, longitude: lng - dLng },
    high: { latitude: lat + dLat, longitude: lng + dLng },
  };
}

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
    locationRestriction: {
      rectangle: circleToTextSearchRectangle(
        mapping.location.lat,
        mapping.location.lng,
        mapping.radiusMeters
      ),
    },
  };
  if (mapping.region) body.regionCode = mapping.region;
  return { api: 'searchText', textQuery, body };
}
