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
import { createLandmarkResolutionCacheKey, createLandmarkSearchCacheKey } from '../route-llm/landmark-normalizer.js';
import { mapCuisineToIncludedTypes, mapTypeToIncludedTypes } from './cuisine-to-types-mapper.js';

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
): Promise<any[]> {
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
    return [];
  }

  try {
    // Phase 1: Resolve landmark (with two-tier caching)
    const geocodeStartTime = Date.now();
    let geocodeResult: { lat: number; lng: number };
    let landmarkSource: string;
    
    // Check if we have known coordinates (from landmark registry)
    if (mapping.resolvedLatLng) {
      geocodeResult = mapping.resolvedLatLng;
      landmarkSource = 'registry_cache';
      
      logger.info({
        requestId,
        event: 'landmark_resolved',
        landmarkId: mapping.landmarkId || 'unknown',
        latLng: `${geocodeResult.lat.toFixed(4)},${geocodeResult.lng.toFixed(4)}`,
        source: landmarkSource
      }, '[LANDMARK] Resolved from registry (no geocoding needed)');
    } else {
      // Need to geocode (with resolution cache)
      const cache = getCacheService();
      const resolutionCacheKey = createLandmarkResolutionCacheKey(
        mapping.geocodeQuery,
        mapping.region
      );
      
      const geocodeFn = async (): Promise<{ lat: number; lng: number } | null> => {
        return await callGoogleGeocodingAPI(
          mapping.geocodeQuery,
          mapping.region,
          apiKey,
          requestId
        );
      };
      
      let geocodeResultNullable: { lat: number; lng: number } | null = null;
      
      if (cache) {
        try {
          // Cache landmark resolution (TTL: 7 days for landmarks)
          const cachePromise = cache.wrap(resolutionCacheKey, 604800, geocodeFn);
          geocodeResultNullable = await raceWithCleanup(cachePromise, 10000);
          landmarkSource = 'geocode_cache_or_api';
        } catch (cacheError) {
          logger.warn({
            requestId,
            error: (cacheError as Error).message,
            msg: '[LANDMARK] Resolution cache error, falling back to direct geocode'
          });
          geocodeResultNullable = await geocodeFn();
          landmarkSource = 'geocode_api';
        }
      } else {
        geocodeResultNullable = await geocodeFn();
        landmarkSource = 'geocode_api';
      }
      
      if (!geocodeResultNullable) {
        logger.warn({
          requestId,
          provider: 'google_places_new',
          method: 'landmarkPlan',
          geocodeQuery: mapping.geocodeQuery
        }, '[GOOGLE] Geocoding returned no results');
        return [];
      }
      
      geocodeResult = geocodeResultNullable;
      
      logger.info({
        requestId,
        event: 'landmark_resolved',
        landmarkId: mapping.landmarkId || 'unknown',
        latLng: `${geocodeResult.lat.toFixed(4)},${geocodeResult.lng.toFixed(4)}`,
        source: landmarkSource,
        geocodeDurationMs: Date.now() - geocodeStartTime
      }, '[LANDMARK] Resolved from geocoding');
    }

    // Phase 2: Search around landmark (with search cache)
    const searchStartTime = Date.now();
    let results: any[] = [];
    let fromCache = false;
    
    // Determine includedTypes from cuisineKey/typeKey (language-independent, like NEARBY)
    let includedTypes: string[];
    if (mapping.cuisineKey) {
      includedTypes = mapCuisineToIncludedTypes(mapping.cuisineKey);
    } else if (mapping.typeKey) {
      includedTypes = mapTypeToIncludedTypes(mapping.typeKey);
    } else {
      includedTypes = ['restaurant']; // Fallback
    }
    
    // Log landmark search payload (observability)
    logger.info({
      requestId,
      event: 'landmark_search_payload_built',
      landmarkId: mapping.landmarkId || 'unknown',
      latLng: `${geocodeResult.lat.toFixed(4)},${geocodeResult.lng.toFixed(4)}`,
      radius: mapping.radiusMeters,
      cuisineKey: mapping.cuisineKey || null,
      typeKey: mapping.typeKey || null,
      includedTypes: includedTypes.slice(0, 3),
      searchLanguage: mapping.language,
      afterGeocode: mapping.afterGeocode
    }, '[LANDMARK] Search payload built (language-independent)');

    const cache = getCacheService();

    const fetchFn = async (): Promise<any[]> => {
      if (mapping.afterGeocode === 'nearbySearch') {
        // Use Nearby Search centered on landmark location
        // Map language to Google API format
        const supportedLanguages = ['he', 'en', 'es', 'ru', 'ar', 'fr'];
        const languageCode = supportedLanguages.includes(mapping.language) ? mapping.language : 'en';
        
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
          languageCode,
          includedTypes, // Language-independent types from cuisineKey
          rankPreference: 'DISTANCE'
        };

        if (mapping.region) {
          (requestBody as any).regionCode = mapping.region;
        }

        const response = await callGooglePlacesSearchNearby(requestBody, apiKey, requestId);
        return response.places ? response.places.map((r: any) => mapGooglePlaceToResult(r)) : [];

      } else {
        // Use Text Search with location bias
        // Map language to Google API format
        const supportedLanguages = ['he', 'en', 'es', 'ru', 'ar', 'fr'];
        const languageCode = supportedLanguages.includes(mapping.language) ? mapping.language : 'en';
        
        const requestBody: any = {
          textQuery: mapping.keyword,
          languageCode,
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

    // Execute with landmark search cache (two-tier caching)
    if (cache) {
      try {
        // Use landmarkId-based cache key for perfect multilingual sharing
        const searchCacheKey = mapping.landmarkId
          ? createLandmarkSearchCacheKey(
              mapping.landmarkId,
              mapping.radiusMeters,
              mapping.cuisineKey,
              mapping.typeKey,
              mapping.region
            )
          : generateSearchCacheKey({
              category: mapping.cuisineKey || mapping.typeKey || mapping.keyword,
              locationText: mapping.geocodeQuery,
              lat: geocodeResult.lat,
              lng: geocodeResult.lng,
              radius: mapping.radiusMeters,
              region: mapping.region,
              language: mapping.language
            });
        
        const ttl = cache.getTTL(mapping.keyword);

        logger.debug({
          requestId,
          event: 'CACHE_WRAP_ENTER',
          providerMethod: 'landmarkPlan',
          cacheKey: searchCacheKey,
          ttlSeconds: ttl,
          landmarkId: mapping.landmarkId || null
        });

        // P0 Fix: Use raceWithCleanup to prevent timeout memory leaks
        const cachePromise = cache.wrap(searchCacheKey, ttl, fetchFn);
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
      servedFrom: fromCache ? 'cache' : 'google_api'
    }, '[GOOGLE] Landmark Plan completed');

    return results;

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
