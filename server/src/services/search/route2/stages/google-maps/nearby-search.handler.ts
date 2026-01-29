/**
 * Nearby Search Handler
 * Handles Google Places Nearby Search API calls with caching and pagination
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { fetchWithTimeout, type FetchErrorKind } from '../../../../../utils/fetch-with-timeout.js';
import { generateSearchCacheKey, type CacheKeyParams } from '../../../../../lib/cache/googleCacheUtils.js';
import { getCacheService, raceWithCleanup } from './cache-manager.js';
import { mapGooglePlaceToResult } from './result-mapper.js';
import type { RouteLLMMapping, Route2Context } from '../../types.js';

// Field mask for Google Places API (New) - includes opening hours data
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri';

/**
 * Execute Google Places Nearby Search (New API)
 * Includes L1/L2 caching
 */
export async function executeNearbySearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchNearby',
    location: mapping.location,
    radiusMeters: mapping.radiusMeters,
    keyword: mapping.keyword,
    region: mapping.region,
    language: mapping.language,
    anchorSource: 'USER_LOCATION'
  }, '[GOOGLE] Calling Nearby Search API (New) - anchor: user location');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchNearby',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  // Prepare cache key parameters
  const cacheKeyParams: CacheKeyParams = {
    category: mapping.keyword,
    lat: mapping.location.lat,
    lng: mapping.location.lng,
    radius: mapping.radiusMeters,
    region: mapping.region,
    language: mapping.language
  };

  const cache = getCacheService();
  const fetchFn = async (): Promise<any[]> => {
    const results: any[] = [];
    let nextPageToken: string | undefined;
    const maxResults = 20;

    const requestBody = buildNearbySearchBody(mapping);

    // Fetch first page
    const firstResponse = await callGooglePlacesSearchNearby(requestBody, apiKey, requestId);
    if (firstResponse.places) {
      results.push(...firstResponse.places.map((r: any) => mapGooglePlaceToResult(r)));
      nextPageToken = firstResponse.nextPageToken;
    }

    // Fetch additional pages if needed
    while (nextPageToken && results.length < maxResults) {
      const pageBody = { ...requestBody, pageToken: nextPageToken };
      const pageResponse = await callGooglePlacesSearchNearby(pageBody, apiKey, requestId);

      if (pageResponse.places) {
        const remaining = maxResults - results.length;
        const newResults = pageResponse.places.slice(0, remaining);
        results.push(...newResults.map((r: any) => mapGooglePlaceToResult(r)));
        nextPageToken = pageResponse.nextPageToken;
      } else {
        break;
      }
    }

    return results;
  };

  try {
    let results: any[];
    let fromCache = false;

    if (cache) {
      try {
        // Validate cache service
        if (typeof cache.wrap !== 'function') {
          throw new Error('Cache service wrap method not available');
        }

        const cacheKey = generateSearchCacheKey(cacheKeyParams);
        const ttl = cache.getTTL(mapping.keyword);

        logger.debug({
          requestId,
          event: 'CACHE_WRAP_ENTER',
          providerMethod: 'nearbySearch',
          cacheKey,
          ttlSeconds: ttl
        });

        // P0 Fix: Use raceWithCleanup to prevent timeout memory leaks
        const cachePromise = cache.wrap(cacheKey, ttl, fetchFn);
        results = await raceWithCleanup(cachePromise, 10000);
        fromCache = (Date.now() - startTime) < 100;
      } catch (cacheError) {
        logger.warn({
          requestId,
          error: (cacheError as Error).message,
          stack: (cacheError as Error).stack,
          msg: '[GOOGLE] Cache error, falling back to direct fetch (non-fatal)'
        });

        // Execute direct fetch as fallback
        try {
          results = await fetchFn();
        } catch (fetchError) {
          logger.error({
            requestId,
            error: (fetchError as Error).message,
            msg: '[GOOGLE] Both cache and fetch failed'
          });
          throw fetchError;
        }
      }
    } else {
      logger.info({
        requestId,
        event: 'CACHE_BYPASS',
        providerMethod: 'nearbySearch',
        reason: 'cache_service_not_available'
      });
      results = await fetchFn();
    }

    const durationMs = Date.now() - startTime;
    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'searchNearby',
      durationMs,
      resultCount: results.length,
      fieldMaskUsed: PLACES_FIELD_MASK,
      servedFrom: fromCache ? 'cache' : 'google_api'
    }, '[GOOGLE] Nearby Search completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchNearby',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Nearby Search failed');

    throw error;
  }
}

/**
 * Build Nearby Search API request body (New API)
 */
function buildNearbySearchBody(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>
): any {
  // Normalize keyword for non-IL regions
  let normalizedKeyword = mapping.keyword;
  if (mapping.region && mapping.region !== 'IL') {
    // Convert to English with "restaurant" suffix
    if (mapping.keyword.includes('איטלק') || mapping.keyword.toLowerCase().includes('italian')) {
      normalizedKeyword = 'Italian restaurant';
    } else {
      // Generic: append "restaurant" if not present
      normalizedKeyword = mapping.keyword.toLowerCase().includes('restaurant')
        ? mapping.keyword
        : `${mapping.keyword} restaurant`;
    }
  }

  const body: any = {
    locationRestriction: {
      circle: {
        center: {
          latitude: mapping.location.lat,
          longitude: mapping.location.lng
        },
        radius: mapping.radiusMeters
      }
    },
    languageCode: mapping.language === 'he' ? 'he' : 'en',
    includedTypes: ['restaurant'],
    rankPreference: 'DISTANCE'
  };

  // Add region code (only if valid)
  if (mapping.region) {
    body.regionCode = mapping.region;
  }

  return body;
}

/**
 * Call Google Places Search Nearby API (New API)
 * Exported for reuse by landmark-plan handler
 */
export async function callGooglePlacesSearchNearby(
  body: any,
  apiKey: string,
  requestId: string
): Promise<any> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  
  // Allow timeout to be configurable via env (default 8000ms)
  const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);

  // Pre-request diagnostics (safe logging - no secrets)
  const callStartTime = Date.now();
  logger.debug({
    requestId,
    provider: 'google_places_new',
    providerMethod: 'searchNearby',
    endpoint: 'searchNearby',
    hostname: 'places.googleapis.com',
    path: '/v1/places:searchNearby',
    timeoutMs,
    googleApiKeyPresent: !!apiKey,
    keyLen: apiKey?.length || 0,
    method: 'POST',
    event: 'google_api_call_start'
  }, '[GOOGLE] Starting API call');

  let errorKind: FetchErrorKind | undefined;
  let callDurationMs: number;

  try {
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': PLACES_FIELD_MASK
      },
      body: JSON.stringify(body)
    }, {
      timeoutMs,
      requestId,
      stage: 'google_maps',
      provider: 'google_places',
      enableDnsPreflight: process.env.ENABLE_DNS_PREFLIGHT === 'true'
    });
    
    callDurationMs = Date.now() - callStartTime;

    if (!response.ok) {
      callDurationMs = Date.now() - callStartTime;
      const errorText = await response.text();
      errorKind = 'HTTP_ERROR';

      // Log error details with guidance
      logger.error({
        requestId,
        provider: 'google_places_new',
        providerMethod: 'searchNearby',
        endpoint: 'searchNearby',
        status: response.status,
        errorKind,
        host: 'places.googleapis.com',
        timeoutMs,
        durationMs: callDurationMs,
        errorBody: errorText.substring(0, 200),
        guidance: 'Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access'
      }, '[GOOGLE] Nearby Search API HTTP error');

      throw new Error(`Google Places API (New) searchNearby failed: HTTP ${response.status} - Check API key permissions and billing`);
    }

    const data = await response.json();
    callDurationMs = Date.now() - callStartTime;
    
    // Threshold-based logging: INFO if slow (>2000ms), DEBUG otherwise
    const isSlow = callDurationMs > 2000;
    const logLevel = isSlow ? 'info' : 'debug';

    logger[logLevel]({
      requestId,
      provider: 'google_places_new',
      providerMethod: 'searchNearby',
      durationMs: callDurationMs,
      placesCount: data.places?.length || 0,
      event: 'google_api_call_success',
      ...(isSlow && { slow: true })
    }, '[GOOGLE] API call succeeded');
    
    return data;
    
  } catch (err) {
    callDurationMs = Date.now() - callStartTime;
    
    // Extract error kind from TimeoutError if available
    if (!errorKind && err && typeof err === 'object' && 'errorKind' in err) {
      errorKind = (err as any).errorKind;
    }
    
    // Log catch block error
    logger.error({
      requestId,
      provider: 'google_places_new',
      providerMethod: 'searchNearby',
      errorKind: errorKind || 'UNKNOWN',
      host: 'places.googleapis.com',
      timeoutMs,
      durationMs: callDurationMs,
      error: err instanceof Error ? err.message : String(err),
      event: 'google_api_call_failed'
    }, '[GOOGLE] API call failed in catch block');
    
    throw err;
  }
}
