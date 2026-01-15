/**
 * Route Map Stage
 * 
 * Placeholder for future query routing logic
 * 
 * Current behavior:
 * - Accept IntentLiteResult
 * - Log stage timing
 * - Pass through data (no routing logic)
 * 
 * Future behavior (not implemented yet):
 * - Determine optimal search strategy
 * - Map query to provider-specific parameters
 * - Decide on radius, filters, query composition
 * 
 * Phase: Structural Scaffold (placeholder only)
 */

import type { IntentLiteResult, SearchPlan, PipelineContext } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute ROUTE_MAP stage
 * 
 * @param intentLiteResult Output from INTENT_LITE stage
 * @param context Pipeline context
 * @returns SearchPlan (currently just passes through data)
 */
export async function executeRouteMapStage(
  intentLiteResult: IntentLiteResult,
  context: PipelineContext
): Promise<SearchPlan> {
  const { requestId } = context;
  const startTime = Date.now();
  
  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'v2',
    stage: 'route_map',
    event: 'stage_started'
  }, 'stage_started');
  
  try {
    // Placeholder: Just pass through data
    // No routing or mapping logic yet
    const result: SearchPlan = {
      intentLiteResult,
      skipped: false,
      reason: 'placeholder_implementation'
    };
    
    const durationMs = Date.now() - startTime;
    
    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      stage: 'route_map',
      event: 'stage_completed',
      durationMs,
      skipped: result.skipped
    }, 'stage_completed');
    
    return result;
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logger.error({
      requestId,
      pipelineVersion: 'v2',
      stage: 'route_map',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, 'stage_failed');
    
    throw error;
  }
}
