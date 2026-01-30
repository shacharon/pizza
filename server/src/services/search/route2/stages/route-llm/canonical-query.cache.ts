/**
 * Canonical Query Cache Service
 * Caches LLM-generated canonical queries to reduce costs and latency
 * 
 * Cache Key: (rawQueryHash, uiLanguage, regionCode)
 * TTL: 24 hours (86400 seconds)
 */

import { createHash } from 'crypto';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { getCacheService } from '../google-maps/cache-manager.js';
import type { CanonicalQueryOutput } from './canonical-query.generator.js';

const CANONICAL_QUERY_CACHE_TTL = 86400; // 24 hours in seconds

/**
 * Generate cache key for canonical query
 */
export function generateCanonicalQueryCacheKey(
  rawQuery: string,
  uiLanguage: string,
  regionCode: string
): string {
  const queryHash = createHash('sha256')
    .update(rawQuery.toLowerCase().trim())
    .digest('hex')
    .substring(0, 16);

  return `canonical_query:${queryHash}:${uiLanguage}:${regionCode}`;
}

/**
 * Get cached canonical query or generate new one
 */
export async function getCachedCanonicalQuery(
  rawQuery: string,
  uiLanguage: 'he' | 'en',
  regionCode: string,
  generatorFn: () => Promise<CanonicalQueryOutput>,
  requestId: string | undefined
): Promise<CanonicalQueryOutput> {
  const cache = getCacheService();

  // If no cache available, call generator directly
  if (!cache) {
    logger.debug({
      requestId,
      event: 'canonical_query_cache_bypass',
      reason: 'cache_service_not_available'
    }, '[CANONICAL] Cache not available, calling generator');

    return await generatorFn();
  }

  const cacheKey = generateCanonicalQueryCacheKey(rawQuery, uiLanguage, regionCode);
  const startTime = Date.now();

  try {
    logger.debug({
      requestId,
      event: 'canonical_query_cache_check',
      cacheKey,
      ttlSeconds: CANONICAL_QUERY_CACHE_TTL
    }, '[CANONICAL] Checking cache');

    // Try to get from cache or generate
    const result = await cache.wrap<CanonicalQueryOutput>(
      cacheKey,
      CANONICAL_QUERY_CACHE_TTL,
      generatorFn
    );

    const durationMs = Date.now() - startTime;
    const fromCache = durationMs < 100; // Fast response = cache hit

    logger.info({
      requestId,
      event: 'canonical_query_cache_result',
      servedFrom: fromCache ? 'cache' : 'generator',
      cacheTier: fromCache ? (durationMs < 5 ? 'L1' : 'L2') : 'MISS',
      durationMs,
      wasRewritten: result.wasRewritten
    }, `[CANONICAL] Canonical query ${fromCache ? 'served from cache' : 'generated'}`);

    return result;

  } catch (error) {
    // Cache error: fallback to direct generation
    logger.warn({
      requestId,
      error: (error as Error).message,
      msg: '[CANONICAL] Cache error, falling back to direct generation'
    });

    return await generatorFn();
  }
}
