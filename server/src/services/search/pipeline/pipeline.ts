/**
 * V2 Search Pipeline Runner
 * 
 * Main orchestration for the new pipeline architecture:
 * GATE -> INTENT_LITE -> ROUTE_MAP -> Existing Flow
 * 
 * Key principles:
 * - All stages are placeholders (no business logic yet)
 * - Delegates to existing search flow after pipeline stages
 * - Returns EXACT same response as V1
 * - Structured logging for observability
 * 
 * Phase: Structural Scaffold (no behavior changes)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { PipelineContext, PipelineResult } from './types.js';
import { GateAdapter } from './adapters/gate-adapter.js';
import { executeIntentLiteStage } from './stages/intent-lite.stage.js';
import { executeRouteMapStage } from './stages/route-map.stage.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Pipeline Dependencies
 * Services needed to run the pipeline
 */
export interface PipelineDependencies {
  gateAdapter: GateAdapter;
  // Delegate function to call existing V1 flow
  delegateToExistingFlow: (
    request: SearchRequest,
    traceId?: string,
    requestId?: string,
    skipAssistant?: boolean
  ) => Promise<SearchResponse>;
}

/**
 * Run V2 Search Pipeline
 * 
 * Executes all pipeline stages and delegates to existing flow
 * 
 * @param request Search request from client
 * @param context Pipeline context (requestId, timing, etc.)
 * @param deps Pipeline dependencies
 * @returns SearchResponse (identical to V1)
 */
export async function runSearchPipelineV2(
  request: SearchRequest,
  context: PipelineContext,
  deps: PipelineDependencies
): Promise<SearchResponse> {
  const { requestId, traceId, sessionId, startTime, skipAssistant } = context;
  const pipelineStartTime = Date.now();
  
  // Log pipeline selection
  logger.info({
    requestId,
    pipelineVersion: 'v2',
    event: 'pipeline_selected',
    query: request.query
  }, 'pipeline_selected');
  
  try {
    // ========================================================================
    // STAGE 1: GATE
    // ========================================================================
    const gateStartTime = Date.now();
    const gateResult = await deps.gateAdapter.execute(request.query, context);
    const gateDurationMs = Date.now() - gateStartTime;
    
    logger.debug({
      requestId,
      stage: 'gate',
      route: gateResult.route,
      confidence: gateResult.confidence,
      region: gateResult.region,
      hasFood: gateResult.hasFood,
      hasLocation: gateResult.hasLocation
    }, '[V2 Pipeline] Gate stage completed');
    
    // ========================================================================
    // STAGE 2: INTENT_LITE (Placeholder)
    // ========================================================================
    const intentLiteStartTime = Date.now();
    const intentLiteResult = await executeIntentLiteStage(gateResult, context);
    const intentLiteDurationMs = Date.now() - intentLiteStartTime;
    
    logger.debug({
      requestId,
      stage: 'intent_lite',
      skipped: intentLiteResult.skipped
    }, '[V2 Pipeline] Intent Lite stage completed');
    
    // ========================================================================
    // STAGE 3: ROUTE_MAP (Placeholder)
    // ========================================================================
    const routeMapStartTime = Date.now();
    const searchPlan = await executeRouteMapStage(intentLiteResult, context);
    const routeMapDurationMs = Date.now() - routeMapStartTime;
    
    logger.debug({
      requestId,
      stage: 'route_map',
      skipped: searchPlan.skipped
    }, '[V2 Pipeline] Route Map stage completed');
    
    // ========================================================================
    // STAGE 4: DELEGATE TO EXISTING FLOW
    // ========================================================================
    // All placeholder stages complete - now delegate to existing V1 logic
    // This ensures we return the EXACT same response as V1
    logger.debug({
      requestId,
      message: 'Delegating to existing V1 flow'
    }, '[V2 Pipeline] Delegating to V1 flow');
    
    const delegateStartTime = Date.now();
    const response = await deps.delegateToExistingFlow(
      request,
      traceId,
      requestId,
      skipAssistant
    );
    const delegateDurationMs = Date.now() - delegateStartTime;
    
    // ========================================================================
    // PIPELINE COMPLETE
    // ========================================================================
    const totalPipelineMs = Date.now() - pipelineStartTime;
    const pipelineOverheadMs = totalPipelineMs - delegateDurationMs;
    
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      event: 'pipeline_completed',
      totalPipelineMs,
      pipelineOverheadMs,
      delegateDurationMs,
      stages: {
        gateDurationMs,
        intentLiteDurationMs,
        routeMapDurationMs
      }
    }, 'pipeline_completed');
    
    // Return the response from V1 flow (no modifications)
    return response;
    
  } catch (error) {
    const totalPipelineMs = Date.now() - pipelineStartTime;
    
    logger.error({
      requestId,
      pipelineVersion: 'v2',
      event: 'pipeline_failed',
      totalPipelineMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, 'pipeline_failed');
    
    throw error;
  }
}

/**
 * Create pipeline dependencies from orchestrator
 * Helper to wire up dependencies
 */
export function createPipelineDependencies(
  gateAdapter: GateAdapter,
  delegateToExistingFlow: PipelineDependencies['delegateToExistingFlow']
): PipelineDependencies {
  return {
    gateAdapter,
    delegateToExistingFlow
  };
}
