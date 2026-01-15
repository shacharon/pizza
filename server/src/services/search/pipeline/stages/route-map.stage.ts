/**
 * Route Map Stage - V2 Pipeline
 * 
 * Deterministic routing logic to determine search mode
 * 
 * Behavior:
 * - Use nearbysearch if ANY of: user coords, isRelative location, or explicit radius
 * - Otherwise use textsearch
 * - No LLM calls, pure deterministic logic
 * 
 * Phase: V2 Pipeline Real Implementation
 */

import type { IntentLiteResult, SearchPlan, PipelineContext } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Execute ROUTE_MAP stage
 * 
 * Determines optimal search mode based on intent and available data
 * 
 * @param intentLiteResult Output from INTENT_LITE stage
 * @param context Pipeline context
 * @returns SearchPlan with mode and radius
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
    // Deterministic routing logic
    // Rule: Use nearbysearch if ANY of these conditions:
    // 1. Request has user coords
    // 2. Location is relative (near me, closest, etc.)
    // 3. Intent specifies radius
    const hasUserCoords = !!context.request.userLocation;
    const isRelativeLocation = intentLiteResult.location.isRelative;
    const hasExplicitRadius = !!intentLiteResult.radiusMeters;
    
    let mode: 'nearbysearch' | 'textsearch';
    
    if (hasUserCoords || isRelativeLocation || hasExplicitRadius) {
      mode = 'nearbysearch';
      logger.debug({
        requestId,
        hasUserCoords,
        isRelativeLocation,
        hasExplicitRadius,
        decision: 'nearbysearch'
      }, '[RouteMap] Routing to nearbysearch');
    } else {
      mode = 'textsearch';
      logger.debug({
        requestId,
        hasUserCoords,
        isRelativeLocation,
        hasExplicitRadius,
        decision: 'textsearch'
      }, '[RouteMap] Routing to textsearch');
    }
    
    // Determine radius
    // Use explicit radius if provided, otherwise use default (2000m as per spec)
    const radius = intentLiteResult.radiusMeters ?? 2000;
    
    const result: SearchPlan = {
      mode,
      radius,
      intentLiteResult,
      skipped: false
    };
    
    const durationMs = Date.now() - startTime;
    
    // Log stage completion
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      stage: 'route_map',
      event: 'stage_completed',
      durationMs,
      mode,
      radius,
      hasUserCoords,
      isRelativeLocation,
      hasExplicitRadius
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
