/**
 * Landmark Plan Handler
 * Handles two-phase search: 1) Geocode landmark, 2) Search nearby or with bias
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { fetchWithTimeout } from '../../../../../utils/fetch-with-timeout.js';
import { generateSearchCacheKey, type CacheKeyParams } from '../../../../../lib/cache/googleCacheUtils.js';
import { getCacheService, raceWithCleanup } from './cache-manager.js';
import { mapGooglePlaceToResult } from './result-mapper.js';
import { callGooglePlacesSearchText } from './text-search.handler.js';
import { callGooglePlacesSearchNearby } from './nearby-search.handler.js';
import type { RouteLLMMapping, Route2Context } from '../../types.js';

// Field mask for Google Places API (New) - includes opening hours data
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri';

/**
 * Execute Landmark Plan (two-phase search)
 * 1. Geocode the landmark (using legacy Geocoding API)
 * 2. Search nearby or with bias based on afterGeocode (using New Places API)
 */
export async function executeLandmarkPlan(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }>,
  ctx: Route2Context
): Promise<{ results: any[], servedFrom: 'cache' | 'google_api' }> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'landmarkPlan',
    geocodeQuery: mapping.geocodeQuery,
    afterGeocode: mapping.afterGeocode,
    radiusMeters: mapping.radiusMeters,
    keyword: mapping.keyword,
    region: mapping.region,
    language: mapping.language,
    anchorSource: 'GEOCODE_ANCHOR',
    anchorText: mapping.geocodeQuery
  }, '[GOOGLE] Executing Landmark Plan (two-phase) - anchor: geocoded landmark');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return { results: [], servedFrom: 'google_api' };
  }

  try {
    // Phase 1: Geocode the landmark (uses legacy Geocoding API)
    const geocodeStartTime = Date.now();
    const geocodeResult = await callGoogleGeocodingAPI(
      mapping.geocodeQuery,
      mapping.region,
      apiKey,
      requestId
    );

    if (!geocodeResult) {
      logger.warn({
        requestId,
        provider: 'google_places_new',
        method: 'landmarkPlan',
        geocodeQuery: mapping.geocodeQuery
      }, '[GOOGLE] Geocoding returned no results');
      return { results: [], servedFrom: 'google_api' };
    }

    const geocodeDurationMs = Date.now() - geocodeStartTime;
    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      phase: 'geocode',
      durationMs: geocodeDurationMs,
      location: geocodeResult
    }, '[GOOGLE] Landmark geocoded successfully');

    // Phase 2: Search based on afterGeocode strategy (using New Places API)
    const searchStartTime = Date.now();
    let results: any[] = [];
    let fromCache = false;

    // Prepare cache key parameters using geocoded location
    const cacheKeyParams: CacheKeyParams = {
      category: mapping.keyword,
      locationText: mapping.geocodeQuery, // Include landmark name for cache differentiation
      lat: geocodeResult.lat,
      lng: geocodeResult.lng,
      radius: mapping.radiusMeters,
      region: mapping.region,
      language: mapping.language
    };

    const cache = getCacheService();

    const fetchFn = async (): Promise<any[]> => {
      if (mapping.afterGeocode === 'nearbySearch') {
        // Normalize keyword for non-IL regions
        let normalizedKeyword = mapping.keyword;
        if (mapping.region && mapping.region !== 'IL') {
          if (mapping.keyword.includes('איטלק') || mapping.keyword.toLowerCase().includes('italian')) {
            normalizedKeyword = 'Italian restaurant';
          } else {
            normalizedKeyword = mapping.keyword.toLowerCase().includes('restaurant')
              ? mapping.keyword
              : `${mapping.keyword} restaurant`;
          }
        }

        // Use Nearby Search centered on geocoded location
        const requestBody = {
          locationRestriction: {
            circle: {
              center: {
                latitude: geocodeResult.lat,
                longitude: geocodeResult.lng
              },
              radius: mapping.radiusMeters
            }
          },
          languageCode: mapping.language === 'he' ? 'he' : 'en',
          includedTypes: ['restaurant'],
          rankPreference: 'DISTANCE'
        };

        if (mapping.region) {
          (requestBody as any).regionCode = mapping.region;
        }

        logger.debug({
          requestId,
          originalKeyword: mapping.keyword,
          normalizedKeyword,
          region: mapping.region
        }, '[GOOGLE] Keyword normalized for nearby search');

        const response = await callGooglePlacesSearchNearby(requestBody, apiKey, requestId);
        return response.places ? response.places.map((r: any) => mapGooglePlaceToResult(r)) : [];

      } else {
        // Use Text Search with location bias
        const requestBody: any = {
          textQuery: mapping.keyword,
          languageCode: mapping.language === 'he' ? 'he' : 'en',
          locationBias: {
            circle: {
              center: {
                latitude: geocodeResult.lat,
                longitude: geocodeResult.lng
              },
              radius: mapping.radiusMeters
            }
          }
        };

        if (mapping.region) {
          requestBody.regionCode = mapping.region;
        }

        const response = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
        return response.places ? response.places.map((r: any) => mapGooglePlaceToResult(r)) : [];
      }
    };

    // Execute with cache
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
          providerMethod: 'landmarkPlan',
          cacheKey,
          ttlSeconds: ttl
        });

        // P0 Fix: Use raceWithCleanup to prevent timeout memory leaks
        const cachePromise = cache.wrap(cacheKey, ttl, fetchFn);
        results = await raceWithCleanup(cachePromise, 10000);
        fromCache = (Date.now() - searchStartTime) < 100;
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
        providerMethod: 'landmarkPlan',
        reason: 'cache_service_not_available'
      });
      results = await fetchFn();
    }

    const searchDurationMs = Date.now() - searchStartTime;
    const totalDurationMs = Date.now() - startTime;

    const servedFrom = fromCache ? 'cache' as const : 'google_api' as const;

    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      phase: 'search',
      afterGeocode: mapping.afterGeocode,
      searchDurationMs,
      totalDurationMs,
      resultCount: results.length,
      fieldMaskUsed: PLACES_FIELD_MASK,
      servedFrom
    }, '[GOOGLE] Landmark Plan completed');

    return { results, servedFrom };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'landmarkPlan',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Landmark Plan failed');

    // IMPORTANT: Throw error to propagate to pipeline
    // Do NOT return [] - that would be treated as "success with 0 results"
    throw error;
  }
}

/**
 * Call Google Geocoding API to get coordinates for a location query
 * (Geocoding API remains unchanged - uses legacy endpoint)
 */
async function callGoogleGeocodingAPI(
  address: string,
  region: string | null,
  apiKey: string,
  requestId: string
): Promise<{ lat: number; lng: number } | null> {
  const params = new URLSearchParams({
    key: apiKey,
    address: address
  });

  if (region) {
    params.append('region', region.toLowerCase());
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  const response = await fetchWithTimeout(url, {
    method: 'GET',
    headers: {
      'Accept': 'application/json'
    }
  }, {
    timeoutMs: 8000,
    requestId,
    stage: 'google_maps',
    provider: 'google_geocoding'
  });

  if (!response.ok) {
    throw new Error(`Google Geocoding API HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    logger.warn({
      requestId,
      provider: 'google_geocoding',
      status: data.status,
      errorMessage: data.error_message
    }, '[GOOGLE] Geocoding non-OK status');

    if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
      throw new Error(`Google Geocoding API error: ${data.status} - ${data.error_message || 'no details'}`);
    }
  }

  if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
    return null;
  }

  // Return the first result's location
  const location = data.results[0].geometry.location;
  return {
    lat: location.lat,
    lng: location.lng
  };
}
