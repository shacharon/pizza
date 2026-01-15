/**
 * ROUTE_LLM Stage - ROUTE2 Pipeline
 * 
 * SKELETON: Placeholder logic only
 * 
 * Purpose: Deterministic routing to choose search mode
 * (textsearch vs nearbysearch) and radius
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Intent2Result, RouteLLMResult } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute ROUTE_LLM stage
 * 
 * @param intent Intent extraction result
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Routing decision
 */
export async function executeRouteLLMStage(
  intent: Intent2Result,
  request: SearchRequest,
  ctx: Route2Context
): Promise<RouteLLMResult> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'route_llm',
    event: 'stage_started'
  }, '[ROUTE2] route_llm started');

  try {
    // SKELETON: Always return textsearch with 2000m radius
    const result: RouteLLMResult = {
      mode: 'textsearch',
      radiusMeters: 2000
    };

    const durationMs = Date.now() - startTime;

    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'route_llm',
      event: 'stage_completed',
      durationMs,
      mode: result.mode,
      radiusMeters: result.radiusMeters
    }, '[ROUTE2] route_llm completed');

    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'route_llm',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] route_llm failed');

    throw error;
  }
}
