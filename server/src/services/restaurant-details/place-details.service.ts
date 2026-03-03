/**
 * Place Details Service
 * Fetches a single place by placeId from Google Places API (New) for the restaurant details page.
 */

import { logger } from '../../lib/logger/structured-logger.js';
import { fetchWithTimeout } from '../../utils/fetch-with-timeout.js';
import { mapGooglePlaceToResult } from '../search/route2/stages/google-maps/result-mapper.js';
import type { RestaurantResult } from '../search/types/restaurant.types.js';

const PLACE_DETAILS_FIELD_MASK =
  'id,displayName,formattedAddress,location,rating,userRatingCount,priceLevel,' +
  'currentOpeningHours,regularOpeningHours,photos,types,googleMapsUri,businessStatus,' +
  'internationalPhoneNumber,websiteUri';

const PLACES_TIMEOUT_MS = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);

/**
 * Fetch a single place by placeId. Returns null if not found or on error.
 * Uses same mapping as search results so details page DTO matches card data shape.
 */
export async function getPlaceDetailsByPlaceId(placeId: string): Promise<RestaurantResult | null> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.warn({ event: 'place_details_skip', reason: 'GOOGLE_API_KEY missing' }, '[PlaceDetails] API key not configured');
    return null;
  }

  const sanitizedId = placeId.trim();
  if (!sanitizedId) return null;

  const resourceName = sanitizedId.includes('/') ? sanitizedId : `places/${sanitizedId}`;
  const url = `https://places.googleapis.com/v1/${resourceName}`;

  try {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'GET',
        headers: {
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': PLACE_DETAILS_FIELD_MASK
        }
      },
      { timeoutMs: PLACES_TIMEOUT_MS, stage: 'place_details', provider: 'google_places' }
    );

    if (response.status === 404) {
      logger.debug({ placeId: sanitizedId, event: 'place_details_not_found' }, '[PlaceDetails] Place not found');
      return null;
    }

    if (!response.ok) {
      const body = await response.text();
      logger.warn({
        placeId: sanitizedId,
        status: response.status,
        errorBody: body.substring(0, 200),
        event: 'place_details_error'
      }, '[PlaceDetails] Google API error');
      return null;
    }

    const place = await response.json();
    const mapped = mapGooglePlaceToResult(place) as RestaurantResult;
    if (place.internationalPhoneNumber) mapped.phoneNumber = place.internationalPhoneNumber;
    if (place.websiteUri) mapped.website = place.websiteUri;
    return mapped;
  } catch (err) {
    logger.warn({
      placeId: sanitizedId,
      error: err instanceof Error ? err.message : String(err),
      event: 'place_details_fetch_error'
    }, '[PlaceDetails] Fetch failed');
    return null;
  }
}
