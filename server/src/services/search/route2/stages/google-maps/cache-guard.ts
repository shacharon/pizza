/**
 * Google Stage Cache Guard
 * 
 * Checks Redis cache BEFORE executing Google API handlers
 * If cache hit → return immediately, skip handler entirely
 * If cache miss → proceed to handler (which will fetch and cache)
 * 
 * Goal: Avoid handler execution overhead when results are cached
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';
import { getCacheService, raceWithCleanup } from './cache-manager.js';
import { generateTextSearchCacheKey, generateSearchCacheKey, type CacheKeyParams } from '../../../../../lib/cache/googleCacheUtils.js';
import type { RouteLLMMapping } from '../../types.js';

// Field mask for Google Places API (matches handlers)
const PLACES_FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri';

/**
 * Map providerLanguage to Google API language code
 * Matches logic in text-search.handler.ts
 */
function mapToGoogleLanguageCode(providerLanguage: 'he' | 'en' | 'ar' | 'ru' | 'es' | 'fr' | 'other'): string {
  const mapping: Record<string, string> = {
    'he': 'iw', // Hebrew (Google uses 'iw')
    'en': 'en',
    'ar': 'ar',
    'ru': 'ru',
    'es': 'es',
    'fr': 'fr',
    'other': 'en' // Fallback for 'other'
  };
  return mapping[providerLanguage] || 'en';
}

/**
 * Generate cache key for textSearch
 */
function generateTextSearchKey(mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }>): string {
  return generateTextSearchCacheKey({
    textQuery: mapping.providerTextQuery,
    languageCode: mapToGoogleLanguageCode(mapping.providerLanguage),
    regionCode: mapping.region,
    bias: mapping.bias ? {
      lat: mapping.bias.center.lat,
      lng: mapping.bias.center.lng,
      radiusMeters: mapping.bias.radiusMeters
    } : null,
    fieldMask: PLACES_FIELD_MASK,
    pipelineVersion: 'route2'
  });
}

/**
 * Generate cache key for nearbySearch
 */
function generateNearbySearchKey(mapping: Extract<RouteLLMMapping, { providerMethod: 'nearbySearch' }>): string {
  const cacheKeyParams: CacheKeyParams = {
    category: mapping.cuisineKey || mapping.typeKey || mapping.keyword,
    lat: mapping.location.lat,
    lng: mapping.location.lng,
    radius: mapping.radiusMeters,
    region: mapping.region,
    language: mapping.language
  };
  return generateSearchCacheKey(cacheKeyParams);
}

/**
 * Generate cache key for landmarkPlan
 * LandmarkPlan uses geocoded landmark + nearbySearch or textSearchWithBias
 * Cache key must match the actual search executed by the handler
 */
function generateLandmarkPlanKey(mapping: Extract<RouteLLMMapping, { providerMethod: 'landmarkPlan' }>): string {
  // Use landmarkId-based cache key if available (same as handler logic)
  // Otherwise fall back to generateSearchCacheKey with geocodeQuery
  if (mapping.landmarkId) {
    // When landmarkId exists, handler uses createLandmarkSearchCacheKey
    // Format: "landmark_search:{landmarkId}:{radius}:{category}:{region}"
    const category = mapping.cuisineKey || mapping.typeKey || 'restaurant';
    return `landmark_search:${mapping.landmarkId}:${mapping.radiusMeters}:${category}:${mapping.region || 'unknown'}`;
  }
  
  // Fallback: use generateSearchCacheKey (same as handler line 237-245)
  const cacheKeyParams: CacheKeyParams = {
    category: mapping.cuisineKey || mapping.typeKey || mapping.keyword || '',
    locationText: mapping.geocodeQuery,
    // Note: We don't have resolved lat/lng yet at guard time, so cache key won't match
    // This is a limitation - guard can only check landmarkId-based cache
    lat: 0, // Placeholder - won't match handler cache
    lng: 0, // Placeholder - won't match handler cache
    radius: mapping.radiusMeters,
    region: mapping.region,
    language: mapping.language
  };
  return generateSearchCacheKey(cacheKeyParams);
}

/**
 * Check cache for Google results before executing handler
 * 
 * @returns Cached results if hit, null if miss
 */
export async function checkGoogleCache(
  mapping: RouteLLMMapping,
  requestId: string
): Promise<any[] | null> {
  // Log guard entry for observability
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    event: 'google_cache_guard_enter',
    providerMethod: mapping.providerMethod
  }, '[ROUTE2] Cache guard checking for cached results');

  const cache = getCacheService();
  
  // If cache service not available, return null (proceed to handler)
  if (!cache) {
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'google_cache_guard_no_cache_service',
      providerMethod: mapping.providerMethod,
      reason: 'cache_service_not_initialized'
    }, '[ROUTE2] Cache service not available - proceeding to Google API');
    return null;
  }

  try {
    // Generate cache key based on provider method
    let cacheKey: string;
    let ttl: number;
    let queryForTTL: string | null;

    switch (mapping.providerMethod) {
      case 'textSearch':
        try {
          cacheKey = generateTextSearchKey(mapping);
          queryForTTL = mapping.providerTextQuery || mapping.textQuery || null;
          ttl = cache.getTTL(queryForTTL);
        } catch (error) {
          logger.warn({
            requestId,
            pipelineVersion: 'route2',
            event: 'google_cache_guard_failed',
            providerMethod: 'textSearch',
            whichKeyMissing: 'providerTextQuery or textQuery',
            error: error instanceof Error ? error.message : 'unknown'
          }, '[ROUTE2] textSearch cache guard failed - missing required fields');
          return null;
        }
        break;

      case 'nearbySearch':
        try {
          cacheKey = generateNearbySearchKey(mapping);
          // For nearbySearch, keyword can be null - getTTL handles this gracefully
          queryForTTL = mapping.keyword || null;
          ttl = cache.getTTL(queryForTTL);
        } catch (error) {
          logger.warn({
            requestId,
            pipelineVersion: 'route2',
            event: 'google_cache_guard_failed',
            providerMethod: 'nearbySearch',
            whichKeyMissing: 'location or radius',
            error: error instanceof Error ? error.message : 'unknown'
          }, '[ROUTE2] nearbySearch cache guard failed - missing required fields');
          return null;
        }
        break;

      case 'landmarkPlan':
        try {
          cacheKey = generateLandmarkPlanKey(mapping);
          // CRITICAL: landmarkPlan does NOT have enhancedTextQuery/textQuery
          // Use geocodeQuery (landmark name) or keyword as fallback for TTL calculation
          queryForTTL = mapping.geocodeQuery || mapping.keyword || null;
          ttl = cache.getTTL(queryForTTL);
        } catch (error) {
          logger.warn({
            requestId,
            pipelineVersion: 'route2',
            event: 'google_cache_guard_failed',
            providerMethod: 'landmarkPlan',
            whichKeyMissing: 'geocodeQuery or landmarkId',
            error: error instanceof Error ? error.message : 'unknown'
          }, '[ROUTE2] landmarkPlan cache guard failed - missing required fields');
          return null;
        }
        break;

      default:
        const _exhaustive: never = mapping;
        throw new Error(`Unknown providerMethod: ${(_exhaustive as any).providerMethod}`);
    }

    logger.debug({
      requestId,
      pipelineVersion: 'route2',
      event: 'google_cache_guard_check',
      providerMethod: mapping.providerMethod,
      cacheKey,
      ttlSeconds: ttl
    }, '[ROUTE2] Checking cache before Google stage');

    // Check cache using the same wrap() API, but with a no-op fetchFn
    // We pass a fetchFn that throws to ensure we only get cached results
    const throwingFetchFn = async (): Promise<any[]> => {
      throw new Error('CACHE_MISS_SENTINEL'); // Will never be called if cache hits
    };

    try {
      // Use raceWithCleanup for timeout protection
      const cachePromise = cache.wrap(cacheKey, ttl, throwingFetchFn);
      const results = await raceWithCleanup(cachePromise, 5000); // 5s timeout for cache check
      
      // If we got here, it's a cache hit
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'google_stage_skipped',
        reason: 'cache_hit',
        providerMethod: mapping.providerMethod,
        resultCount: Array.isArray(results) ? results.length : 0,
        cacheKey
      }, '[ROUTE2] Google stage skipped - results served from cache');

      return Array.isArray(results) ? results : [];

    } catch (error) {
      // CACHE_MISS_SENTINEL means cache miss, return null to proceed to handler
      if (error instanceof Error && error.message === 'CACHE_MISS_SENTINEL') {
        logger.debug({
          requestId,
          pipelineVersion: 'route2',
          event: 'google_cache_guard_miss',
          providerMethod: mapping.providerMethod,
          cacheKey
        }, '[ROUTE2] Cache miss - proceeding to Google handler');
        return null;
      }

      // Other errors (timeout, cache error) - return null to proceed to handler
      logger.debug({
        requestId,
        pipelineVersion: 'route2',
        event: 'google_cache_guard_error',
        providerMethod: mapping.providerMethod,
        error: error instanceof Error ? error.message : 'unknown',
        cacheKey
      }, '[ROUTE2] Cache check error - proceeding to Google handler');
      return null;
    }

  } catch (error) {
    // Guard initialization error - log and return null (proceed to handler)
    logger.warn({
      requestId,
      pipelineVersion: 'route2',
      event: 'google_cache_guard_failed',
      providerMethod: mapping.providerMethod,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] Cache guard failed - proceeding to Google handler');
    return null;
  }
}
