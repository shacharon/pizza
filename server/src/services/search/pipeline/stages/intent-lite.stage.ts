/**
 * Intent Lite Stage
 * 
 * Placeholder for future lightweight intent extraction
 * 
 * Current behavior:
 * - Accept GateResult
 * - Log stage timing
 * - Pass through gate data (no processing)
 * 
 * Future behavior (not implemented yet):
 * - Apply deterministic heuristics for common patterns
 * - No LLM calls (keep it fast)
 * - Refine food/location anchors
 * 
 * Phase: Structural Scaffold (placeholder only)
 */

import type { GateResult, IntentLiteResult, PipelineContext } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute INTENT_LITE stage
 * 
 * @param gateResult Output from GATE stage
 * @param context Pipeline context
 * @returns IntentLiteResult (currently just passes through gate data)
 */
export async function executeIntentLiteStage(
  gateResult: GateResult,
  context: PipelineContext
): Promise<IntentLiteResult> {
  const { requestId } = context;
  const startTime = Date.now();
  
  // Log stage start
  logger.info({
    requestId,
    pipelineVersion: 'v2',
    stage: 'intent_lite',
    event: 'stage_started'
  }, 'stage_started');
  
  try {
    // Placeholder: Just pass through gate data
    // No heuristics or processing yet
    const result: IntentLiteResult = {
      gateResult,
      skipped: false,
      reason: 'placeholder_implementation'
    };
    
    const durationMs = Date.now() - startTime;
    
    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      stage: 'intent_lite',
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
      stage: 'intent_lite',
      event: 'stage_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, 'stage_failed');
    
    throw error;
  }
}
