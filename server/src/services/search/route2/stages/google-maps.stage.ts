/**
 * GOOGLE_MAPS Stage - ROUTE2 Pipeline
 * 
 * Executes Google Places API (New) calls based on route-specific mapping
 * Dispatches to correct API method based on providerMethod discriminator
 * 
 * API Version: Places API (New) - v1
 * Endpoints:
 * - POST https://places.googleapis.com/v1/places:searchText
 * - POST https://places.googleapis.com/v1/places:searchNearby
 * 
 * Cache Strategy:
 * - L0: In-flight deduplication (concurrent requests share promise)
 * - L1: In-memory (60s TTL, 500 entries max)
 * - L2: Redis (300-900s TTL based on query intent)
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, RouteLLMMapping, GoogleMapsResult } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { GoogleCacheService } from '../../../../lib/cache/googleCacheService.js';
import { createHash } from 'node:crypto';
import {
  generateSearchCacheKey,
  generateTextSearchCacheKey,
  type CacheKeyParams
} from '../../../../lib/cache/googleCacheUtils.js';
import { getConfig } from '../../../../config/env.js';
import { getRedisClient } from '../../../../lib/redis/redis-client.js';
import { fetchWithTimeout, type TimeoutError, type FetchErrorKind } from '../../../../utils/fetch-with-timeout.js';

// Field mask for Google Places API (New) - includes opening hours data
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri';

// Initialize Redis and Cache Service (module-level singleton)
let cacheService: GoogleCacheService | null = null;
let cacheInitialized = false;

/**
 * P0 Fix: Wrapper for Promise.race that properly cleans up timeout
 * Prevents zombie promises and memory leaks from dangling timeouts
 * 
 * @param cachePromise - The cache operation promise
 * @param timeoutMs - Timeout in milliseconds
 * @returns Result from cache or throws timeout error
 */
async function raceWithCleanup<T>(
  cachePromise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  
  try {
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Cache operation timeout')), timeoutMs);
    });
    
    // Race between cache and timeout
    const result = await Promise.race([cachePromise, timeoutPromise]);
    
    return result;
    
  } finally {
    // P0 Fix: Always clear timeout to prevent memory leak
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    
    // Note: cachePromise continues running if it loses the race
    // This is acceptable - Redis will complete the operation
    // The important fix is clearing the timeout to prevent memory leaks
  }
}

async function initializeCacheService(): Promise<void> {
  if (cacheInitialized) return;
  cacheInitialized = true;

  // Check if caching is enabled via environment flag
  const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false'; // Enabled by default
  if (!enableCache) {
    logger.info({
      event: 'CACHE_SERVICE_READY',
      hasRedis: false,
      cacheEnabled: false,
      msg: '[GoogleMapsCache] Caching disabled via ENABLE_GOOGLE_CACHE=false'
    });
    return;
  }

  // Get Redis URL from env or use default localhost
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  logger.info({
    event: 'CACHE_INIT_ATTEMPT',
    redisUrl: redisUrl.replace(/:[^:@]+@/, ':****@'),
    msg: '[GoogleMapsCache] Attempting Redis connection'
  });

  try {
    // Use shared Redis client
    const redis = await getRedisClient({
      url: redisUrl,
      maxRetriesPerRequest: 2,
      connectTimeout: 2000,
      commandTimeout: 500, // 500ms command timeout for cache operations
      enableOfflineQueue: false
    });

    if (redis) {
      cacheService = new GoogleCacheService(redis, logger);
      logger.info({
        event: 'CACHE_SERVICE_READY',
        hasRedis: true,
        commandTimeout: 500,
        msg: '[GoogleMapsCache] ✓ Cache service active with shared Redis client'
      });
    } else {
      throw new Error('Shared Redis client unavailable');
    }
  } catch (err) {
    // Non-fatal: just disable caching
    logger.warn({
      event: 'CACHE_SERVICE_DISABLED',
      error: (err as Error).message,
      msg: '[GoogleMapsCache] Redis unavailable, caching disabled (non-fatal, will use direct Google API)'
    });
    cacheService = null;
  }
}

function getCacheService(): GoogleCacheService | null {
  return cacheService;
}

// Initialize cache on module load (non-blocking)
initializeCacheService().catch((err) => {
  logger.warn({
    error: err.message,
    msg: '[GoogleMapsCache] Cache initialization failed (non-fatal)'
  });
});

/**
 * Execute GOOGLE_MAPS stage
 * 
 * @param mapping Route-specific mapping from RouteLLM (discriminated union)
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Google Maps results
 */
export async function executeGoogleMapsStage(
  mapping: RouteLLMMapping,
  request: SearchRequest,
  ctx: Route2Context
): Promise<GoogleMapsResult> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'google_maps',
    event: 'stage_started',
    providerMethod: mapping.providerMethod,
    region: mapping.region,
    language: mapping.language
  }, '[ROUTE2] google_maps started');

  try {
    let results: any[] = [];

    // Dispatch to correct Google API based on providerMethod
    switch (mapping.providerMethod) {
      case 'textSearch':
        results = await executeTextSearch(mapping, ctx);
        break;

      case 'nearbySearch':
        results = await executeNearbySearch(mapping, ctx);
        break;

      case 'landmarkPlan':
        results = await executeLandmarkPlan(mapping, ctx);
        break;

      default:
        // Exhaustiveness check
        const _exhaustive: never = mapping;
        throw new Error(`Unknown providerMethod: ${(_exhaustive as any).providerMethod}`);
    }

    const durationMs = Date.now() - startTime;

    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'google_maps',
      event: 'stage_completed',
      durationMs,
      providerMethod: mapping.providerMethod,
      resultCount: results.length,
      region: mapping.region,
      language: mapping.language
    }, '[ROUTE2] google_maps completed');

    return {
      results,
      providerMethod: mapping.providerMethod,
      durationMs
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    // Extract errorKind from TimeoutError if available
    const errorKind = (error && typeof error === 'object' && 'errorKind' in error) 
      ? (error as TimeoutError).errorKind 
      : undefined;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'google_maps',
      event: 'stage_failed',
      durationMs,
      providerMethod: mapping.providerMethod,
      errorKind: errorKind || 'UNKNOWN',
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] google_maps failed');

    throw error;
  }
}

/**
 * Execute Google Places Text Search (New API)
 * Includes retry logic for low results and L1/L2 caching
 */
async function executeTextSearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchText',
    textQuery: mapping.textQuery,
    region: mapping.region,
    language: mapping.language,
    hasBias: !!mapping.bias || !!mapping.cityText,
    ...(mapping.cityText && { cityText: mapping.cityText })
  }, '[GOOGLE] Calling Text Search API (New)');

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      error: 'GOOGLE_API_KEY not configured'
    }, '[GOOGLE] API key missing');
    return [];
  }

  const cache = getCacheService();
  const fetchFn = async (): Promise<any[]> => {
    try {
      // First attempt
      let results = await executeTextSearchAttempt(mapping, apiKey, requestId);

      // Retry logic for low results (Fix #4) - must materially change request
      if (results.length <= 1 && mapping.bias) {
        logger.info({
          requestId,
          provider: 'google_places_new',
          method: 'searchText',
          event: 'textsearch_retry_low_results',
          beforeCount: results.length,
          reason: 'low_results_with_bias',
          originalBias: mapping.bias,
          originalTextQuery: mapping.textQuery,
          originalLanguage: mapping.language
        }, '[GOOGLE] Low results detected, retrying with bias removed');

        // Retry strategy: Remove bias entirely to get broader results
        const retryMapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
          ...mapping,
          bias: undefined
        };

        const retryResults = await executeTextSearchAttempt(retryMapping, apiKey, requestId);

        logger.info({
          requestId,
          provider: 'google_places_new',
          method: 'searchText',
          event: 'textsearch_retry_completed',
          beforeCount: results.length,
          afterCount: retryResults.length,
          strategyUsed: 'removed_bias',
          improvement: retryResults.length - results.length
        }, '[GOOGLE] Retry completed');

        if (retryResults.length > results.length) {
          results = retryResults;
        }
      }

      return results;
    } catch (error) {
      // Don't cache errors - let them propagate
      throw error;
    }
  };

  try {
    let results: any[];
    let fromCache = false;

    // Safe cache usage with comprehensive error handling
    if (cache) {
      try {
        // Validate cache service is still operational
        if (typeof cache.wrap !== 'function') {
          throw new Error('Cache service wrap method not available');
        }

        // Generate cache key with all request parameters
        const cacheKey = generateTextSearchCacheKey({
          textQuery: mapping.textQuery,
          languageCode: mapping.language === 'he' ? 'he' : 'en',
          regionCode: mapping.region,
          bias: mapping.bias ? {
            lat: mapping.bias.center.lat,
            lng: mapping.bias.center.lng,
            radiusMeters: mapping.bias.radiusMeters
          } : null,
          fieldMask: PLACES_FIELD_MASK,
          pipelineVersion: 'route2'
        });
        const ttl = cache.getTTL(mapping.textQuery);

        logger.info({
          requestId,
          event: 'CACHE_WRAP_ENTER',
          providerMethod: 'textSearch',
          cacheKey,
          ttlSeconds: ttl
        });

        // P0 Fix: Use raceWithCleanup to prevent timeout memory leaks
        const cachePromise = cache.wrap(cacheKey, ttl, fetchFn);
        results = await raceWithCleanup(cachePromise, 10000);
        const wrapDuration = Date.now() - startTime;
        fromCache = wrapDuration < 100;

        logger.info({
          requestId,
          event: 'CACHE_WRAP_EXIT',
          providerMethod: 'textSearch',
          servedFrom: fromCache ? 'cache' : 'google_api',
          cacheTier: fromCache ? (wrapDuration < 5 ? 'L1' : 'L2') : 'MISS',
          durationMs: wrapDuration
        });
      } catch (cacheError) {
        // Cache error: fallback to direct fetch (non-fatal)
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
          // If both cache and fetch fail, rethrow fetch error
          logger.error({
            requestId,
            error: (fetchError as Error).message,
            msg: '[GOOGLE] Both cache and fetch failed'
          });
          throw fetchError;
        }
      }
    } else {
      // No cache: direct fetch
      logger.info({
        requestId,
        event: 'CACHE_BYPASS',
        providerMethod: 'textSearch',
        reason: 'cache_service_not_available'
      });
      results = await fetchFn();
    }

    const durationMs = Date.now() - startTime;
    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      durationMs,
      resultCount: results.length,
      fieldMaskUsed: PLACES_FIELD_MASK,
      servedFrom: fromCache ? 'cache' : 'google_api'
    }, '[GOOGLE] Text Search completed');

    return results;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      durationMs,
      error: errorMsg
    }, '[GOOGLE] Text Search failed');

    throw error;
  }
}

/**
 * Execute a single Text Search attempt (helper for retry logic)
 */
async function executeTextSearchAttempt(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  apiKey: string,
  requestId: string
): Promise<any[]> {
  const results: any[] = [];
  let nextPageToken: string | undefined;
  const maxResults = 20; // Limit total results across pages

  // If cityText exists and no bias is set, geocode the city to create location bias
  let enrichedMapping = mapping;
  if (mapping.cityText && !mapping.bias) {
    try {
      const cityCoords = await callGoogleGeocodingAPI(
        mapping.cityText,
        mapping.region,
        apiKey,
        requestId
      );

      if (cityCoords) {
        logger.info({
          requestId,
          cityText: mapping.cityText,
          coords: cityCoords,
          event: 'city_geocoded_for_bias'
        }, '[GOOGLE] City geocoded successfully, applying location bias');

        enrichedMapping = {
          ...mapping,
          bias: {
            type: 'locationBias' as const,
            center: cityCoords,
            radiusMeters: 20000 // 20km radius for city-level bias
          }
        };
      } else {
        logger.warn({
          requestId,
          cityText: mapping.cityText,
          event: 'city_geocoding_failed'
        }, '[GOOGLE] City geocoding returned no results, proceeding without bias');
      }
    } catch (error) {
      logger.warn({
        requestId,
        cityText: mapping.cityText,
        error: error instanceof Error ? error.message : 'unknown',
        event: 'city_geocoding_error'
      }, '[GOOGLE] City geocoding failed, proceeding without bias');
    }
  }

  // Build request body
  const requestBody = buildTextSearchBody(enrichedMapping, requestId);
  const textQueryNormalized = requestBody.textQuery?.trim().toLowerCase() || '';

  const textQueryHash = createHash('sha256')
    .update(textQueryNormalized)
    .digest('hex')
    .substring(0, 12);

  logger.info({
    requestId,
    event: 'textsearch_request_payload',
    textQueryLen: requestBody.textQuery?.length || 0,
    textQueryHash,
    languageCode: requestBody.languageCode,
    regionCode: requestBody.regionCode || null,
    regionCodeSent: !!requestBody.regionCode,
    hasBias: !!requestBody.locationBias,
    biasSource: enrichedMapping.cityText && enrichedMapping.bias ? 'cityText_geocoded' : (mapping.bias ? 'provided' : null),
    maxResultCount: maxResults
  }, '[GOOGLE] Text Search request payload');

  // Fetch first page
  const firstResponse = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
  if (firstResponse.places) {
    results.push(...firstResponse.places.map((r: any) => mapGooglePlaceToResult(r)));
    nextPageToken = firstResponse.nextPageToken;
  }

  // Fetch additional pages if needed (up to maxResults)
  while (nextPageToken && results.length < maxResults) {
    // New API: no delay needed for pagination
    const pageBody = { ...requestBody, pageToken: nextPageToken };
    const pageResponse = await callGooglePlacesSearchText(pageBody, apiKey, requestId);

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
}

/**
 * Build Text Search API request body (New API)
 * 
 * NOTE: Text Search does NOT support includedTypes field!
 * Use textQuery like "מסעדה בשרית אשקלון" or "pizza restaurant" instead.
 * The LLM mappers already include the place type in the textQuery.
 */
function buildTextSearchBody(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  requestId?: string
): any {
  const body: any = {
    textQuery: mapping.textQuery,
    languageCode: mapping.language === 'he' ? 'he' : 'en'
    // NOTE: Do NOT include includedTypes - not supported by searchText endpoint
    // Rely on textQuery containing place type (e.g., "מסעדה", "restaurant")
  };

  // Add region code
  if (mapping.region) {
    body.regionCode = mapping.region;
  }

  // Add location bias if present - validate first
  if (mapping.bias && mapping.bias.type === 'locationBias') {
    const { center, radiusMeters } = mapping.bias;
    const validatedBias = validateLocationBias(center, requestId);

    if (validatedBias) {
      body.locationBias = {
        circle: {
          center: {
            latitude: validatedBias.lat,
            longitude: validatedBias.lng
          },
          radius: radiusMeters
        }
      };
    }
  }

  // Log that we're relying on textQuery for type filtering
  logger.debug({
    textQuery: mapping.textQuery,
    note: 'Text Search relies on textQuery for place type filtering (no includedTypes support)'
  }, '[GOOGLE] Building Text Search request without includedTypes');

  return body;
}

/**
 * Validate location bias coordinates
 * Returns validated coordinates or null if invalid
 */
function validateLocationBias(
  center: { lat: number; lng: number },
  requestId?: string
): { lat: number; lng: number } | null {
  const { lat, lng } = center;

  // Check valid ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    logger.warn({
      requestId,
      event: 'bias_invalid_discarded',
      reason: 'out_of_range',
      lat,
      lng
    }, '[GOOGLE] Invalid bias coordinates discarded');
    return null;
  }

  // Detect potential swapped coordinates for Israel region
  // Israel: lat ~29-33, lng ~34-36
  // If both values are ~34-35, likely swapped or invalid
  if (Math.abs(lat - lng) < 0.5 && lat > 32 && lat < 36 && lng > 32 && lng < 36) {
    logger.warn({
      requestId,
      event: 'bias_invalid_discarded',
      reason: 'suspicious_duplicate_values',
      lat,
      lng
    }, '[GOOGLE] Suspicious bias coordinates (possible swap) discarded');
    return null;
  }

  return { lat, lng };
}

/**
 * Call Google Places Search Text API (New API)
 */
async function callGooglePlacesSearchText(
  body: any,
  apiKey: string,
  requestId: string
): Promise<any> {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  
  // Allow timeout to be configurable via env (default 8000ms)
  const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);

  // Pre-request diagnostics (safe logging - no secrets)
  const callStartTime = Date.now();
  logger.info({
    requestId,
    provider: 'google_places_new',
    providerMethod: 'searchText',
    endpoint: 'searchText',
    hostname: 'places.googleapis.com',
    path: '/v1/places:searchText',
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
        providerMethod: 'searchText',
        endpoint: 'searchText',
        status: response.status,
        errorKind,
        host: 'places.googleapis.com',
        timeoutMs,
        durationMs: callDurationMs,
        errorBody: errorText.substring(0, 200),
        guidance: 'Check: 1) API key has Places API (New) enabled, 2) Billing is active, 3) Outbound HTTPS access'
      }, '[GOOGLE] Text Search API HTTP error');

      throw new Error(`Google Places API (New) searchText failed: HTTP ${response.status} - Check API key permissions and billing`);
    }

    const data = await response.json();
    callDurationMs = Date.now() - callStartTime;
    
    logger.info({
      requestId,
      provider: 'google_places_new',
      providerMethod: 'searchText',
      durationMs: callDurationMs,
      placesCount: data.places?.length || 0,
      event: 'google_api_call_success'
    }, '[GOOGLE] API call succeeded');
    
    return data;
    
  } catch (err) {
    callDurationMs = Date.now() - callStartTime;
    
    // Extract error kind from TimeoutError if available
    if (!errorKind && err && typeof err === 'object' && 'errorKind' in err) {
      errorKind = (err as TimeoutError).errorKind;
    }
    
    // Log catch block error
    logger.error({
      requestId,
      provider: 'google_places_new',
      providerMethod: 'searchText',
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
 */
async function callGooglePlacesSearchNearby(
  body: any,
  apiKey: string,
  requestId: string
): Promise<any> {
  const url = 'https://places.googleapis.com/v1/places:searchNearby';
  
  // Allow timeout to be configurable via env (default 8000ms)
  const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);

  // Pre-request diagnostics (safe logging - no secrets)
  const callStartTime = Date.now();
  logger.info({
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
    
    logger.info({
      requestId,
      provider: 'google_places_new',
      providerMethod: 'searchNearby',
      durationMs: callDurationMs,
      placesCount: data.places?.length || 0,
      event: 'google_api_call_success'
    }, '[GOOGLE] API call succeeded');
    
    return data;
    
  } catch (err) {
    callDurationMs = Date.now() - callStartTime;
    
    // Extract error kind from TimeoutError if available
    if (!errorKind && err && typeof err === 'object' && 'errorKind' in err) {
      errorKind = (err as TimeoutError).errorKind;
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

/**
 * Map Google Place result (New API) to internal RestaurantResult shape
 * P0 Security Fix: Returns photo references only (no API keys)
 * 
 * New API response structure:
 * {
 *   id: "places/ChIJ...",
 *   displayName: { text: "...", languageCode: "..." },
 *   formattedAddress: "...",
 *   location: { latitude: ..., longitude: ... },
 *   rating: ...,
 *   userRatingCount: ...,
 *   priceLevel: "PRICE_LEVEL_...",
 *   currentOpeningHours: { openNow: true/false },
 *   photos: [{ name: "places/.../photos/..." }],
 *   types: [...],
 *   googleMapsUri: "..."
 * }
 */
function mapGooglePlaceToResult(place: any): any {
  // Extract place ID from resource name (places/ChIJxxx -> ChIJxxx)
  const placeId = place.id ? place.id.split('/').pop() || place.id : 'unknown';

  return {
    id: placeId, // Use place_id as internal ID
    placeId: placeId,
    source: 'google_places' as const,
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress || '',
    location: {
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0
    },
    rating: place.rating,
    userRatingsTotal: place.userRatingCount,
    priceLevel: parsePriceLevel(place.priceLevel),
    openNow: place.currentOpeningHours?.openNow !== undefined
      ? place.currentOpeningHours.openNow
      : 'UNKNOWN',
    // P0 Security: Return photo reference only (no key)
    photoReference: place.photos?.[0]
      ? buildPhotoReference(place.photos[0].name)
      : undefined,
    photoReferences: place.photos?.slice(0, 5).map((photo: any) =>
      buildPhotoReference(photo.name)
    ) || [],
    googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    tags: place.types || []
  };
}

/**
 * Build photo reference for New Places API
 * P0 Security Fix: Returns photo reference only (no API key)
 * Client must use backend proxy endpoint to fetch actual photo
 * Uses resource name format: places/ChIJ.../photos/...
 */
function buildPhotoReference(photoName: string): string {
  // P0 Security: Return reference only, no key parameter
  // Format: places/{placeId}/photos/{photoId}
  return photoName;
}

/**
 * Parse price level from New API format
 * New API uses enum: "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
 * Legacy API uses numbers: 0, 1, 2, 3, 4
 */
function parsePriceLevel(priceLevel: string | undefined): number | undefined {
  if (!priceLevel) return undefined;

  const priceLevelMap: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4
  };

  return priceLevelMap[priceLevel];
}

/**
 * Execute Google Places Nearby Search (New API)
 * Includes L1/L2 caching
 */
async function executeNearbySearch(
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
 * Execute Landmark Plan (two-phase search)
 * 1. Geocode the landmark (using legacy Geocoding API)
 * 2. Search nearby or with bias based on afterGeocode (using New Places API)
 */
async function executeLandmarkPlan(
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
      return [];
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
