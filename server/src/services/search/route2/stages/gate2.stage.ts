/**
 * GATE2 Stage - ROUTE2 Pipeline
 * 
 * SKELETON: Placeholder logic only
 * 
 * Purpose: Fast pre-filter to determine if request should:
 * - BYPASS: Not food-related
 * - ASK_CLARIFY: Missing critical info
 * - CONTINUE: Proceed to intent extraction
 */

import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2Result } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute GATE2 stage
 * 
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Gate decision
 */
export async function executeGate2Stage(
  request: SearchRequest,
  ctx: Route2Context
): Promise<Gate2Result> {
  const { requestId } = ctx;
  const startTime = Date.now();

  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'gate2',
    event: 'stage_started',
    query: request.query
  }, '[ROUTE2] gate2 started');

  try {
    // SKELETON: Always return CONTINUE (no real logic yet)
    const result: Gate2Result = {
      route: 'CONTINUE',
      reason: 'skeleton_placeholder'
    };

    const durationMs = Date.now() - startTime;

    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'gate2',
      event: 'stage_completed',
      durationMs,
      route: result.route
    }, '[ROUTE2] gate2 completed');

    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'gate2',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] gate2 failed');

    throw error;
  }
}
