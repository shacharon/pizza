/**
 * Text Search Handler
 * Handles Google Places Text Search API calls with retries, caching, and pagination
 */

import { createHash } from 'node:crypto';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { fetchWithTimeout, type FetchErrorKind } from '../../../../../utils/fetch-with-timeout.js';
import { generateTextSearchCacheKey } from '../../../../../lib/cache/googleCacheUtils.js';
import { getCacheService, raceWithCleanup } from './cache-manager.js';
import { mapGooglePlaceToResult } from './result-mapper.js';
import { filterPlacesByBusinessStatus, filterResultsByBusinessStatus, logBusinessStatusMetrics } from './business-status.js';
import type { RouteLLMMapping, Route2Context } from '../../types.js';
import { retryWithBackoff } from '../../../../../lib/reliability/retry-handler.js';
import { geocodeCity } from './textsearch/geocoding-service.js';
import { validateLocationBias } from './textsearch/location-bias-validator.js';
import { getTextSearchFieldMask } from './textsearch/field-mask-builder.js';

/**
 * Execute Google Places Text Search (New API)
 * Includes retry logic for low results and L1/L2 caching
 */
export async function executeTextSearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  ctx: Route2Context
): Promise<{ results: any[], servedFrom: 'cache' | 'google_api' }> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // hasBiasPlanned = will attempt to apply bias (either from LLM or city geocode)
  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchText',
    textQuery: mapping.textQuery,
    region: mapping.region,
    language: mapping.language,
    hasBiasPlanned: !!mapping.bias || !!mapping.cityText,
    biasSource: mapping.bias ? 'llm_locationBias' : (mapping.cityText ? 'cityText_pending_geocode' : null),
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
    return { results: [], servedFrom: 'google_api' };
  }

  const cache = getCacheService();
  const fetchFn = async (): Promise<any[]> => {
    try {
      let attempt = await executeTextSearchAttempt(mapping, apiKey, requestId);
      let results = attempt.results;
      let metrics = attempt.metrics;

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

        const retryMapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
          ...mapping,
          bias: undefined
        };

        const retryAttempt = await executeTextSearchAttempt(retryMapping, apiKey, requestId);

        logger.info({
          requestId,
          provider: 'google_places_new',
          method: 'searchText',
          event: 'textsearch_retry_completed',
          beforeCount: results.length,
          afterCount: retryAttempt.results.length,
          strategyUsed: 'removed_bias',
          improvement: retryAttempt.results.length - results.length
        }, '[GOOGLE] Retry completed');

        if (retryAttempt.results.length > results.length) {
          results = retryAttempt.results;
          metrics = retryAttempt.metrics;
        }
      }

      logBusinessStatusMetrics({
        requestId,
        permanentlyClosedCount: metrics.permanentlyClosedCount,
        tempClosedCount: metrics.tempClosedCount,
        missingStatusCount: metrics.missingStatusCount,
        placeIdsFiltered: metrics.permanentlyClosedPlaceIds.length ? metrics.permanentlyClosedPlaceIds : undefined,
        logger
      });

      return results;
    } catch (error) {
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
          fieldMask: getTextSearchFieldMask(),
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
        // raceWithCleanup handles dangling promise rejections internally
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

    // Exclude any permanently closed from cache (stale entries)
    const beforeCount = results.length;
    const resultsFiltered = filterResultsByBusinessStatus(results);
    const afterCount = resultsFiltered.length;
    if (fromCache && beforeCount > afterCount) {
      logger.debug(
        { requestId, event: 'google_places_cache_evicted_permanently_closed', beforeCount, afterCount, placeIds: results.filter((r: any) => r.businessStatus === 'CLOSED_PERMANENTLY').map((r: any) => r.placeId) },
        '[GOOGLE] Evicted permanently closed places from cache'
      );
    }

    const durationMs = Date.now() - startTime;
    const servedFrom = fromCache ? 'cache' as const : 'google_api' as const;

    logger.info({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      durationMs,
      resultCount: resultsFiltered.length,
      fieldMaskUsed: getTextSearchFieldMask(),
      servedFrom
    }, '[GOOGLE] Text Search completed');

    return { results: resultsFiltered, servedFrom };

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

/** Metrics from a single Text Search attempt (for business_status logging) */
interface TextSearchAttemptMetrics {
  permanentlyClosedCount: number;
  tempClosedCount: number;
  missingStatusCount: number;
  permanentlyClosedPlaceIds: string[];
}

/**
 * Execute a single Text Search attempt (helper for retry logic)
 * Filters CLOSED_PERMANENTLY before mapping; returns results + metrics for logging.
 */
async function executeTextSearchAttempt(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  apiKey: string,
  requestId: string
): Promise<{ results: any[]; metrics: TextSearchAttemptMetrics }> {
  const results: any[] = [];
  let nextPageToken: string | undefined;
  const maxResults = 20; // Limit total results across pages
  const metrics: TextSearchAttemptMetrics = {
    permanentlyClosedCount: 0,
    tempClosedCount: 0,
    missingStatusCount: 0,
    permanentlyClosedPlaceIds: []
  };

  const processBatch = (places: any[]) => {
    const out = filterPlacesByBusinessStatus(places);
    metrics.permanentlyClosedCount += out.permanentlyClosedCount;
    metrics.tempClosedCount += out.tempClosedCount;
    metrics.missingStatusCount += out.missingStatusCount;
    metrics.permanentlyClosedPlaceIds.push(...out.permanentlyClosedPlaceIds);
    results.push(...out.filtered.map((r: any) => mapGooglePlaceToResult(r)));
  };

  // If cityText exists and no bias is set, geocode the city to create location bias
  let enrichedMapping = mapping;
  if (mapping.cityText && !mapping.bias) {
    try {
      const cityCoords = await geocodeCity(
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
          hadOriginalBias: !!mapping.bias,
          event: 'city_geocoded_for_bias'
        }, '[GOOGLE] City geocoded successfully, applying location bias');

        // CORRECTNESS FIX: Preserve original locationBias if it exists (from LLM)
        // Only use geocoded bias as fallback when no bias provided
        // This ensures LLM-generated bias is not dropped when cityText exists
        enrichedMapping = {
          ...mapping,
          bias: mapping.bias || {
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

  // hasBiasApplied = final request body includes locationBias
  logger.info({
    requestId,
    event: 'textsearch_request_payload',
    textQueryLen: requestBody.textQuery?.length || 0,
    textQueryHash,
    languageCode: requestBody.languageCode,
    regionCode: requestBody.regionCode || null,
    regionCodeSent: !!requestBody.regionCode,
    hasBiasApplied: !!requestBody.locationBias,
    biasSource: enrichedMapping.cityText && enrichedMapping.bias ? 'cityText_geocoded' : (mapping.bias ? 'llm_locationBias' : null),
    maxResultCount: maxResults
  }, '[GOOGLE] Text Search request payload');

  // Fetch first page
  const firstResponse = await callGooglePlacesSearchText(requestBody, apiKey, requestId);
  if (firstResponse.places) {
    processBatch(firstResponse.places);
    nextPageToken = firstResponse.nextPageToken;
  }

  // Fetch additional pages if needed (up to maxResults)
  while (nextPageToken && results.length < maxResults) {
    const pageBody = { ...requestBody, pageToken: nextPageToken };
    const pageResponse = await callGooglePlacesSearchText(pageBody, apiKey, requestId);

    if (pageResponse.places) {
      const remaining = maxResults - results.length;
      const newPlaces = pageResponse.places.slice(0, remaining);
      processBatch(newPlaces);
      nextPageToken = pageResponse.nextPageToken;
    } else {
      break;
    }
  }

  return { results, metrics };
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
 * Call Google Places Search Text API (New API)
 * Exported for reuse by landmark-plan handler
 */
export async function callGooglePlacesSearchText(
  body: any,
  apiKey: string,
  requestId: string
): Promise<any> {
  const url = 'https://places.googleapis.com/v1/places:searchText';

  // Allow timeout to be configurable via env (default 8000ms)
  const timeoutMs = parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS || '8000', 10);

  // Retry configuration: 3 attempts with exponential backoff [0ms, 500ms, 1000ms]
  const maxAttempts = 3;
  const backoffMs = [0, 500, 1000];

  // Retry predicate: only retry on 429 (rate limit) or 5xx (server errors)
  const isRetryable = (err: any, attempt: number) => {
    // Check for HTTP status in error message or status property
    const errorMsg = err?.message || '';
    const status = err?.status;

    // Rate limiting (429) or server errors (5xx)
    const isRateLimitError = errorMsg.includes('HTTP 429') || status === 429;
    const isServerError = /HTTP 5\d\d/.test(errorMsg) || (typeof status === 'number' && status >= 500 && status < 600);

    return isRateLimitError || isServerError;
  };

  // Retry callback for logging
  const onRetry = (err: any, attempt: number, nextDelay: number) => {
    logger.warn({
      requestId,
      provider: 'google_places_new',
      providerMethod: 'searchText',
      attempt: attempt + 1,
      maxAttempts,
      nextDelayMs: nextDelay,
      error: err?.message || String(err)
    }, '[GOOGLE] Retriable error - will retry after delay');
  };

  // Pre-request diagnostics (safe logging - no secrets)
  const callStartTime = Date.now();
  logger.debug({
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

  // Execute with retry
  return await retryWithBackoff({
    maxAttempts,
    backoffMs,
    isRetryable,
    onRetry,
    fn: async () => {
      let errorKind: FetchErrorKind | undefined;
      let callDurationMs: number;

      try {
        const response = await fetchWithTimeout(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': getTextSearchFieldMask()
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

          const error = new Error(`Google Places API (New) searchText failed: HTTP ${response.status} - Check API key permissions and billing`);
          (error as any).status = response.status;
          throw error;
        }

        const data = await response.json();
        callDurationMs = Date.now() - callStartTime;

        // Threshold-based logging: INFO if slow (>2000ms), DEBUG otherwise
        const isSlow = callDurationMs > 2000;
        const logLevel = isSlow ? 'info' : 'debug';

        logger[logLevel]({
          requestId,
          provider: 'google_places_new',
          providerMethod: 'searchText',
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
  });
}

