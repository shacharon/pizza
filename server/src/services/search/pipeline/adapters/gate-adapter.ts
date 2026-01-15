/**
 * Gate Adapter
 * 
 * Wraps the existing IntentGateService and maps IntentGateResult to GateResult
 * 
 * Key responsibilities:
 * - Call existing IntentGateService
 * - Map IntentGateResult -> GateResult
 * - Resolve region code with priority (device coords → session → config)
 * - Determine routing (INTENT_LITE, ASK_CLARIFY, BYPASS)
 * - Log stage timing
 * 
 * Phase: Real GATE logic implementation
 */

import { IntentGateService } from '../../../intent/intent-gate.service.js';
import type { IntentGateResult } from '../../../intent/intent-gate.types.js';
import type { GateResult, PipelineContext } from '../types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { resolveRegionCode } from '../utils/region-resolver.js';

/**
 * Determine routing decision based on GATE analysis
 * 
 * Rules:
 * 1. Not food-related → BYPASS
 * 2. Food-related but missing BOTH anchors → ASK_CLARIFY
 * 3. Has at least one anchor → INTENT_LITE
 */
function determineRoute(gateResult: IntentGateResult): {
  route: 'INTENT_LITE' | 'ASK_CLARIFY' | 'BYPASS';
  routeReason: string;
  isFoodRelated: boolean;
} {
  // Check if query is food-related
  // Food-related = has food anchor OR has modifiers (modifiers imply food context)
  const isFoodRelated = gateResult.hasFood || gateResult.hasModifiers;
  
  // Rule 1: Not food-related → BYPASS
  if (!isFoodRelated) {
    return {
      route: 'BYPASS',
      routeReason: 'not_food_related',
      isFoodRelated: false
    };
  }
  
  // Rule 2: Food-related but missing BOTH anchors → ASK_CLARIFY
  if (!gateResult.hasFood && !gateResult.hasLocation) {
    return {
      route: 'ASK_CLARIFY',
      routeReason: 'missing_both_anchors',
      isFoodRelated: true
    };
  }
  
  // Rule 3: Has at least one anchor → INTENT_LITE
  return {
    route: 'INTENT_LITE',
    routeReason: 'has_food_or_location',
    isFoodRelated: true
  };
}

/**
 * Map IntentGateResult to GateResult with region and routing
 * Adds pipeline-specific fields (regionCode, isFoodRelated, routing)
 */
function mapToGateResult(
  gateResult: IntentGateResult,
  regionCode: string,
  regionSource: 'device_coords' | 'session_cache' | 'default_config'
): GateResult {
  const routing = determineRoute(gateResult);
  
  return {
    language: gateResult.language,
    isFoodRelated: routing.isFoodRelated,
    hasFood: gateResult.hasFood,
    food: {
      raw: gateResult.food.raw,
      canonical: gateResult.food.canonical,
    },
    hasLocation: gateResult.hasLocation,
    location: {
      raw: gateResult.location.raw,
      canonical: gateResult.location.canonical,
      isRelative: gateResult.location.isRelative,
      requiresUserLocation: gateResult.location.requiresUserLocation,
    },
    hasModifiers: gateResult.hasModifiers,
    modifiers: {
      openNow: gateResult.modifiers.openNow,
      cheap: gateResult.modifiers.cheap,
      glutenFree: gateResult.modifiers.glutenFree,
      vegetarian: gateResult.modifiers.vegetarian,
      vegan: gateResult.modifiers.vegan,
      kosher: gateResult.modifiers.kosher,
      delivery: gateResult.modifiers.delivery,
      takeaway: gateResult.modifiers.takeaway,
      exclude: gateResult.modifiers.exclude,
    },
    confidence: gateResult.confidence,
    route: routing.route,
    routeReason: routing.routeReason,
    regionCode,
    debug: {
      hasFoodAnchor: gateResult.hasFood,
      hasLocationAnchor: gateResult.hasLocation,
      regionSource
    }
  };
}

/**
 * Gate Adapter
 * Wraps IntentGateService for use in V2 pipeline
 */
export class GateAdapter {
  constructor(private readonly gateService: IntentGateService) {}
  
  /**
   * Execute GATE stage
   * 
   * @param query User query text
   * @param context Pipeline context (includes request and sessionService)
   * @returns GateResult with routing decision and region
   */
  async execute(query: string, context: PipelineContext): Promise<GateResult> {
    const { requestId, traceId, sessionId, request, sessionService } = context;
    const startTime = Date.now();
    
    // Log stage start
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      stage: 'gate',
      event: 'stage_started'
    }, 'stage_started');
    
    try {
      // Call existing IntentGateService
      const gateResult = await this.gateService.analyze(query, {
        requestId,
        ...(traceId && { traceId }),
        sessionId
      });
      
      // Resolve region code with priority order
      const { regionCode, source } = await resolveRegionCode(
        request.userLocation,
        sessionId,
        sessionService
      );
      
      // Map to GateResult with routing and region
      const result = mapToGateResult(gateResult, regionCode, source);
      
      const durationMs = Date.now() - startTime;
      
      // Enhanced logging with real routing and region
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        stage: 'gate',
        event: 'stage_completed',
        durationMs,
        route: result.route,
        routeReason: result.routeReason,
        isFoodRelated: result.isFoodRelated,
        regionCode: result.regionCode,
        regionSource: source,
        confidence: result.confidence,
        hasFood: result.hasFood,
        hasLocation: result.hasLocation,
        hasModifiers: result.hasModifiers
      }, 'stage_completed');
      
      return result;
      
    } catch (error) {
      const durationMs = Date.now() - startTime;
      
      logger.error({
        requestId,
        pipelineVersion: 'v2',
        stage: 'gate',
        event: 'stage_failed',
        durationMs,
        error: error instanceof Error ? error.message : 'unknown'
      }, 'stage_failed');
      
      throw error;
    }
  }
}
