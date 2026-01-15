/**
 * INTENT2 Stage - ROUTE2 Pipeline
 * 
 * SKELETON: Placeholder logic only
 * 
 * Purpose: Extract structured food + location intent from query
 * Future: LLM-based extraction with strict schema
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2Result, Intent2Result } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute INTENT2 stage
 * 
 * @param gate Gate result
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Intent extraction result
 */
export async function executeIntent2Stage(
  gate: Gate2Result,
  request: SearchRequest,
  ctx: Route2Context
): Promise<Intent2Result> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'intent2',
    event: 'stage_started',
    query: request.query
  }, '[ROUTE2] intent2 started');

  try {
    // SKELETON: Return empty intent (no parsing yet)
    const result: Intent2Result = {};

    const durationMs = Date.now() - startTime;

    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent2',
      event: 'stage_completed',
      durationMs,
      hasFood: !!result.food,
      hasLocation: !!result.location
    }, '[ROUTE2] intent2 completed');

    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent2',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] intent2 failed');

    throw error;
  }
}
