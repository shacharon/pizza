/**
 * Text Search Handler (ORCHESTRATION)
 * Handles Google Places Text Search API calls with retries, caching, and pagination
 * 
 * Architecture:
 * - Orchestrates cache, retry, and pagination strategies
 * - Delegates pagination to pagination-handler
 * - Delegates retry logic to retry-strategy
 * - Handles API communication and error recovery
 */

import { createHash } from 'node:crypto';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { fetchWithTimeout, type FetchErrorKind } from '../../../../../utils/fetch-with-timeout.js';
import { generateTextSearchCacheKey } from '../../../../../lib/cache/googleCacheUtils.js';
import { getCacheService, raceWithCleanup } from './cache-manager.js';
import { fetchAllPages } from './pagination-handler.js';
import { executeRetryStrategy } from './retry-strategy.js';
import { normalizeTextQuery } from './textquery-normalizer.js';
import type { RouteLLMMapping, Route2Context } from '../../types.js';
import { getCuisineSearchTerms, getCuisineRestaurantLabel, type CuisineKey } from '../../shared/cuisine-tokens.js';

// Field mask for Google Places API (New) - includes opening hours data
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri';

/**
 * Cuisine-aware textQuery builder
 * 
 * If cuisineKey is present, strengthens the textQuery by ensuring cuisine terms are included
 * This prevents Google from returning non-relevant results (e.g., shawarma when searching for Italian)
 * 
 * Rules:
 * 1. If cuisineKey provided AND textQuery doesn't contain cuisine term → prepend cuisine label
 * 2. Keep original textQuery if it already contains cuisine term
 * 3. Never remove cuisine constraints from original query
 * 
 * @param originalTextQuery From mapper or fallback
 * @param cuisineKey Canonical cuisine identifier (e.g., 'italian')
 * @param searchLanguage Language for Google API (he/en)
 * @param cityText Optional city name to preserve
 * @returns Enhanced textQuery with cuisine enforcement
 */
function buildCuisineAwareTextQuery(
  originalTextQuery: string,
  cuisineKey: CuisineKey | null | undefined,
  searchLanguage: 'he' | 'en',
  cityText?: string | null,
  requestId?: string
): string {
  // No cuisine key → return original
  if (!cuisineKey) {
    return originalTextQuery;
  }

  // Get cuisine search terms for this language
  const cuisineTerms = getCuisineSearchTerms(cuisineKey, searchLanguage);
  const restaurantLabel = getCuisineRestaurantLabel(cuisineKey, searchLanguage);

  // Check if textQuery already contains any cuisine term (case-insensitive)
  const queryLower = originalTextQuery.toLowerCase();
  const hasCuisineTerm = cuisineTerms.some(term =>
    queryLower.includes(term.toLowerCase())
  );

  if (hasCuisineTerm) {
    logger.debug({
      requestId,
      event: 'cuisine_textquery_unchanged',
      originalTextQuery,
      cuisineKey,
      reason: 'already_contains_cuisine_term'
    }, '[CUISINE] TextQuery already contains cuisine term, keeping original');
    return originalTextQuery;
  }

  // TextQuery doesn't contain cuisine term → strengthen it
  // Use restaurant label (e.g., "מסעדה איטלקית") instead of just cuisine
  const enhancedTextQuery = cityText
    ? `${restaurantLabel} ${cityText}`.trim()
    : restaurantLabel;

  logger.info({
    requestId,
    event: 'cuisine_textquery_strengthened',
    originalTextQuery,
    enhancedTextQuery,
    cuisineKey,
    searchLanguage,
    restaurantLabel,
    reason: 'cuisine_term_missing'
  }, '[CUISINE] Enhanced textQuery with cuisine enforcement');

  return enhancedTextQuery;
}

// City center geocoding cache (in-memory, 1 hour TTL)
const CITY_GEOCODE_CACHE = new Map<string, { coords: { lat: number; lng: number }; cachedAt: number }>();
const CITY_GEOCODE_CACHE_TTL_MS = 3600_000; // 1 hour

/**
 * Execute Google Places Text Search (New API)
 * Includes retry logic for low results and L1/L2 caching
 */
export async function executeTextSearch(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  ctx: Route2Context
): Promise<any[]> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // hasBiasPlanned = will attempt to apply bias (from LLM, userLocation, or city geocode)
  const biasSource = mapping.bias
    ? 'userLocation_or_llm'
    : (mapping.cityText ? 'cityText_pending_geocode' : null);

  logger.info({
    requestId,
    provider: 'google_places_new',
    method: 'searchText',
    providerTextQuery: mapping.providerTextQuery,
    providerLanguage: mapping.providerLanguage,
    region: mapping.region,
    hasBiasPlanned: !!mapping.bias || !!mapping.cityText,
    biasSource,
    mode: (mapping as any).mode,
    ...(mapping.cityText && { cityText: mapping.cityText }),
    ...(mapping.bias && {
      biasLat: mapping.bias.center.lat,
      biasLng: mapping.bias.center.lng,
      biasRadiusMeters: mapping.bias.radiusMeters
    })
  }, '[GOOGLE] Calling Text Search API (New) - using providerTextQuery/providerLanguage');

  // ASSERTION: Fail fast if old canonicalTextQuery field is present
  if ((mapping as any).canonicalTextQuery !== undefined) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      error: 'canonicalTextQuery field found in mapping (should use providerTextQuery)',
      mapping: JSON.stringify(mapping)
    }, '[GOOGLE] FATAL: canonicalTextQuery field found - refactor incomplete');
    throw new Error('canonicalTextQuery field found in mapping - use providerTextQuery instead');
  }

  // ASSERTION: Require providerTextQuery and providerLanguage
  if (!mapping.providerTextQuery || !mapping.providerLanguage) {
    logger.error({
      requestId,
      provider: 'google_places_new',
      method: 'searchText',
      error: 'providerTextQuery or providerLanguage missing',
      hasProviderTextQuery: !!mapping.providerTextQuery,
      hasProviderLanguage: !!mapping.providerLanguage
    }, '[GOOGLE] FATAL: providerTextQuery/providerLanguage missing');
    throw new Error('providerTextQuery and providerLanguage are required');
  }

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
      const initialResults = await executeTextSearchAttempt(mapping, apiKey, requestId);

      // Retry logic for low results (delegated to retry-strategy)
      const retryResult = await executeRetryStrategy(
        initialResults,
        mapping,
        (retryMapping) => executeTextSearchAttempt(retryMapping, apiKey, requestId),
        requestId
      );

      return retryResult.results;
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
        // CRITICAL: Use providerTextQuery (not textQuery) - this is what's actually sent to Google
        const cacheKey = generateTextSearchCacheKey({
          textQuery: mapping.providerTextQuery, // What's sent to Google API
          languageCode: mapToGoogleLanguageCode(mapping.providerLanguage), // Use providerLanguage
          regionCode: mapping.region,
          bias: mapping.bias ? {
            lat: mapping.bias.center.lat,
            lng: mapping.bias.center.lng,
            radiusMeters: mapping.bias.radiusMeters
          } : null,
          fieldMask: PLACES_FIELD_MASK,
          pipelineVersion: 'route2'
        });
        const ttl = cache.getTTL(mapping.providerTextQuery || mapping.textQuery);

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
      // Only log if this is unexpected (should have been initialized at startup)
      const enableCache = process.env.ENABLE_GOOGLE_CACHE !== 'false';
      if (enableCache) {
        logger.warn({
          requestId,
          event: 'CACHE_BYPASS',
          providerMethod: 'textSearch',
          reason: 'cache_not_initialized',
          note: 'Cache should have been initialized at startup'
        });
      }
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
 * Handles bias enrichment (cityText geocoding) and delegates pagination
 */
async function executeTextSearchAttempt(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  apiKey: string,
  requestId: string
): Promise<any[]> {
  const maxResults = 20; // Fetch up to 20 unique results (iterate pages if needed)
  const maxPages = 3; // Safety cap: max 3 Google API requests per attempt

  // Use providerTextQuery directly (already deterministically built in mapper)
  const finalTextQuery = mapping.providerTextQuery;
  const finalLanguage = mapping.providerLanguage;

  logger.info({
    requestId,
    event: 'google_textsearch_using_provider_fields',
    providerTextQuery: finalTextQuery,
    providerLanguage: finalLanguage,
    mode: (mapping as any).mode,
    source: 'mapper_deterministic_builder'
  }, '[GOOGLE] Using providerTextQuery/providerLanguage from mapper');

  // CUISINE ENFORCEMENT: Strengthen textQuery if cuisineKey is present
  // NOTE: This is a FALLBACK - mapper should already handle this in KEYED mode
  const cuisineEnhancedQuery = buildCuisineAwareTextQuery(
    finalTextQuery,
    mapping.cuisineKey as CuisineKey | null | undefined,
    finalLanguage === 'he' ? 'he' : 'en',
    mapping.cityText,
    requestId
  );

  // P0 FIX: When explicit city exists, prefer city-center bias over userLocation
  // Use smaller radius (10km) for city-center bias instead of 20km default
  let enrichedMapping = {
    ...mapping,
    textQuery: cuisineEnhancedQuery // Use cuisine-enhanced query (fallback only)
  };

  const hasExplicitCity = !!mapping.cityText;
  const shouldPreferCityBias = hasExplicitCity && !mapping.bias;

  if (shouldPreferCityBias) {
    // Check cache first
    const cacheKey = `${mapping.cityText!.toLowerCase().trim()}_${mapping.region || 'IL'}`;
    const cached = CITY_GEOCODE_CACHE.get(cacheKey);
    let cityCoords: { lat: number; lng: number } | null = null;
    let servedFromCache = false;

    if (cached && Date.now() - cached.cachedAt < CITY_GEOCODE_CACHE_TTL_MS) {
      cityCoords = cached.coords;
      servedFromCache = true;
    } else {
      // Geocode via API
      try {
        cityCoords = await callGoogleGeocodingAPI(
          mapping.cityText!,
          mapping.region,
          apiKey,
          requestId
        );

        if (cityCoords) {
          // Cache the result
          CITY_GEOCODE_CACHE.set(cacheKey, {
            coords: cityCoords,
            cachedAt: Date.now()
          });
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

    if (cityCoords) {
      // P0 FIX: Use smaller radius for explicit city searches (10km instead of 20km)
      const radiusMeters = 10000; // 10km for city-center focus

      logger.info({
        requestId,
        event: 'city_center_resolved',
        cityText: mapping.cityText,
        lat: cityCoords.lat,
        lng: cityCoords.lng,
        servedFromCache,
        radiusMeters,
        hadOriginalBias: !!mapping.bias,
        biasSource: 'cityCenter'
      }, '[GOOGLE] City center resolved, applying city-center bias');

      // CRITICAL: Mutate the original mapping object so cityCenter is available for ranking
      // The mapping object is passed by reference from the orchestrator
      (mapping as any).cityCenter = cityCoords;

      enrichedMapping = {
        ...mapping,
        textQuery: cuisineEnhancedQuery, // Use cuisine-enhanced query
        bias: {
          type: 'locationBias' as const,
          center: cityCoords,
          radiusMeters // Smaller radius for city-specific searches
        },
        // Store cityCenter for ranking distance calculation
        cityCenter: cityCoords
      };
    } else if (!servedFromCache) {
      logger.warn({
        requestId,
        cityText: mapping.cityText,
        event: 'city_geocoding_failed'
      }, '[GOOGLE] City geocoding returned no results, proceeding without bias');
    }
  }

  // Build request body
  const requestBody = buildTextSearchBody(enrichedMapping, requestId);
  const providerTextQueryNormalized = requestBody.textQuery?.trim().toLowerCase() || '';

  const textQueryHash = createHash('sha256')
    .update(providerTextQueryNormalized)
    .digest('hex')
    .substring(0, 12);

  // hasBiasApplied = final request body includes locationBias
  // Determine bias source for logging
  let finalBiasSource = null;
  if (requestBody.locationBias) {
    if (enrichedMapping.cityText && enrichedMapping.bias && !mapping.bias) {
      finalBiasSource = 'cityCenter';  // P0 FIX: Better label
    } else if (mapping.bias) {
      // Bias came from mapper (either LLM or userLocation)
      finalBiasSource = 'userLocation';
    }
  }

  // P0 FIX: Enhanced logging with final text query and mode
  logger.info({
    requestId,
    event: 'textsearch_request_payload',
    providerTextQuery: requestBody.textQuery,  // What's actually sent to Google
    textQueryLen: requestBody.textQuery?.length || 0,
    textQueryHash,
    mode: (mapping as any).mode,
    hasExplicitCity: !!mapping.cityText,
    languageCode: requestBody.languageCode,
    regionCode: requestBody.regionCode || null,
    regionCodeSent: !!requestBody.regionCode,
    hasBiasApplied: !!requestBody.locationBias,
    biasSource: finalBiasSource,
    ...(requestBody.locationBias && {
      biasLat: requestBody.locationBias.circle.center.latitude,
      biasLng: requestBody.locationBias.circle.center.longitude,
      biasRadiusMeters: requestBody.locationBias.circle.radius
    }),
    maxResultCount: maxResults
  }, '[GOOGLE] Text Search request payload (providerTextQuery)');

  // NEW: Log when bias is actually applied to Google request
  if (requestBody.locationBias) {
    logger.info({
      requestId,
      event: 'google_textsearch_bias_applied',
      biasType: finalBiasSource || 'unknown',
      lat: requestBody.locationBias.circle.center.latitude,
      lng: requestBody.locationBias.circle.center.longitude,
      radiusMeters: requestBody.locationBias.circle.radius
    }, '[GOOGLE] Location bias ACTUALLY applied to Google request');
  }

  // Delegate pagination to pagination-handler
  const results = await fetchAllPages(requestBody, apiKey, requestId, maxResults, maxPages);

  return results;
}

/**
 * Map language code to Google Places API format
 * Google supports many languages, but we normalize to standard BCP-47 codes
 * 
 * @param language Language from mapper (he, en, es, ru, ar, fr, other)
 * @returns BCP-47 language code for Google API (defaults to 'en' for unsupported)
 */
function mapToGoogleLanguageCode(language: string): string {
  // Supported languages (BCP-47 format)
  const supported = ['he', 'en', 'es', 'ru', 'ar', 'fr'];

  if (supported.includes(language)) {
    return language;
  }

  // Fallback to English for unsupported languages
  return 'en';
}

/**
 * Build Text Search API request body (New API)
 * 
 * Uses providerTextQuery and providerLanguage from mapper (deterministically built).
 * 
 * NOTE: Text Search does NOT support includedTypes field!
 * Use textQuery like "Italian restaurant in Gedera" or "מסעדה איטלקית בגדרה" instead.
 */
function buildTextSearchBody(
  mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>,
  requestId?: string
): any {
  // Use providerLanguage (deterministically set in mapper)
  const languageCode = mapToGoogleLanguageCode(mapping.providerLanguage);

  // CRITICAL: Log Google API call language
  logger.info({
    requestId,
    event: 'google_call_language',
    providerMethod: 'textSearch',
    languageCode,  // What we're sending to Google
    providerLanguage: mapping.providerLanguage,  // From mapper
    regionCode: mapping.region,
    providerTextQuery: mapping.providerTextQuery?.substring(0, 50),
    mode: (mapping as any).mode,
    languageSource: 'mapper_deterministic_builder'
  }, '[GOOGLE] Text Search API call language (from mapper providerLanguage)');

  const body: any = {
    textQuery: mapping.providerTextQuery, // Use providerTextQuery (not textQuery)
    languageCode
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
