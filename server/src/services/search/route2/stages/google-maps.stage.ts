/**
 * GOOGLE_MAPS Stage - ROUTE2 Pipeline
 * Thin orchestrator that routes to appropriate handlers based on providerMethod
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

// Import cache guard
import { checkGoogleCache } from './google-maps/cache-guard.js';

// Import handlers
import { executeTextSearch } from './google-maps/text-search.handler.js';
import { executeNearbySearch } from './google-maps/nearby-search.handler.js';
import { executeLandmarkPlan } from './google-maps/landmark-plan.handler.js';

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
    let servedFrom: 'cache' | 'google_api' = 'google_api';

    // CACHE GUARD: Check cache before executing handler
    const cachedResults = await checkGoogleCache(mapping, requestId);

    if (cachedResults !== null) {
      // Cache hit - skip handler execution
      results = cachedResults;
      servedFrom = 'cache';

      // Update context to mark as served from cache
      if (ctx.google) {
        ctx.google.servedFrom = 'cache';
      } else {
        ctx.google = { servedFrom: 'cache' };
      }
    } else {
      // Cache miss - execute handler (which will fetch from Google API and cache)
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

      // Mark as served from Google API
      if (ctx.google) {
        ctx.google.servedFrom = 'google_api';
      } else {
        ctx.google = { servedFrom: 'google_api' };
      }

      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'google_stage_executed',
        servedFrom: 'google_api',
        providerMethod: mapping.providerMethod,
        resultCount: results.length
      }, '[ROUTE2] Google stage executed via API');
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
      servedFrom,
      region: mapping.region,
      language: mapping.language
    }, '[ROUTE2] google_maps completed');

    return {
      results,
      providerMethod: mapping.providerMethod,
      durationMs,
      servedFrom
    };

  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Extract errorKind from TimeoutError if available
    const errorKind = (error && typeof error === 'object' && 'errorKind' in error)
      ? (error as any).errorKind
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
