/**
 * GOOGLE_MAPS Stage - ROUTE2 Pipeline
 * 
 * SKELETON: Placeholder logic only
 * 
 * Purpose: Execute Google Places API search
 * Future: Call PlacesProviderService with proper params
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, IntentResult, RouteLLMResult, GoogleMapsResult } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute GOOGLE_MAPS stage
 * 
 * @param routePlan Routing decision
 * @param intentDecision Intent routing decision
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Google Maps results
 */
export async function executeGoogleMapsStage(
  routePlan: RouteLLMResult,
  intentDecision: IntentResult,
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
    mode: routePlan.mode
  }, '[ROUTE2] google_maps started');

  try {
    // SKELETON: Return empty results (no Google call yet)
    const result: GoogleMapsResult = {
      results: []
    };

    const durationMs = Date.now() - startTime;

    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'google_maps',
      event: 'stage_completed',
      durationMs,
      resultCount: result.results.length
    }, '[ROUTE2] google_maps completed');

    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'google_maps',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] google_maps failed');

    throw error;
  }
}
