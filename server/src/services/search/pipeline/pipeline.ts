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
import type { PipelineContext, PipelineResult, GateResult, IntentLiteResult, SearchPlan } from './types.js';
import type { ParsedIntent, LanguageContext, RestaurantResult } from '../types/search.types.js';
import { GateAdapter } from './adapters/gate-adapter.js';
import { executeIntentLiteStage } from './stages/intent-lite.stage.js';
import { executeRouteMapStage } from './stages/route-map.stage.js';
import { executeGoogleExecuteStage } from './stages/google-execute.stage.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Pipeline Dependencies
 * Services needed to run the pipeline
 */
export interface PipelineDependencies {
  gateAdapter: GateAdapter;
  sessionService?: import('../types/search.types.js').ISessionService; // NEW
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
      routeReason: gateResult.routeReason,
      isFoodRelated: gateResult.isFoodRelated,
      confidence: gateResult.confidence,
      regionCode: gateResult.regionCode,
      regionSource: gateResult.debug?.regionSource,
      hasFood: gateResult.hasFood,
      hasLocation: gateResult.hasLocation
    }, '[V2 Pipeline] Gate stage completed');
    
    // ========================================================================
    // CHECK FOR EARLY EXITS
    // ========================================================================
    if (gateResult.route === 'BYPASS') {
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        route: 'BYPASS',
        reason: gateResult.routeReason
      }, '[V2 Pipeline] Gate routed to BYPASS - returning empty results');
      
      const response = buildBypassResponse(request, gateResult, context);
      const totalPipelineMs = Date.now() - pipelineStartTime;
      
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        event: 'pipeline_completed',
        totalPipelineMs,
        route: 'BYPASS'
      }, 'pipeline_completed');
      
      return response;
    }
    
    if (gateResult.route === 'ASK_CLARIFY') {
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        route: 'ASK_CLARIFY',
        reason: gateResult.routeReason
      }, '[V2 Pipeline] Gate routed to ASK_CLARIFY - requesting clarification');
      
      const response = buildClarifyResponse(request, gateResult, context);
      const totalPipelineMs = Date.now() - pipelineStartTime;
      
      logger.info({
        requestId,
        pipelineVersion: 'v2',
        event: 'pipeline_completed',
        totalPipelineMs,
        route: 'ASK_CLARIFY'
      }, 'pipeline_completed');
      
      return response;
    }
    
    // ========================================================================
    // STAGE 2: INTENT_LITE
    // ========================================================================
    const intentLiteStartTime = Date.now();
    const intentLiteResult = await executeIntentLiteStage(gateResult, context);
    const intentLiteDurationMs = Date.now() - intentLiteStartTime;
    
    logger.debug({
      requestId,
      stage: 'intent_lite',
      targetType: intentLiteResult.targetType,
      confidence: intentLiteResult.confidence,
      fallback: intentLiteResult.fallback
    }, '[V2 Pipeline] Intent Lite stage completed');
    
    // ========================================================================
    // STAGE 3: ROUTE_MAP
    // ========================================================================
    const routeMapStartTime = Date.now();
    const searchPlan = await executeRouteMapStage(intentLiteResult, context);
    const routeMapDurationMs = Date.now() - routeMapStartTime;
    
    logger.debug({
      requestId,
      stage: 'route_map',
      mode: searchPlan.mode
    }, '[V2 Pipeline] Route Map stage completed');
    
    // ========================================================================
    // STAGE 4: GOOGLE EXECUTE
    // ========================================================================
    const googleExecuteStartTime = Date.now();
    const results = await executeGoogleExecuteStage(
      intentLiteResult,
      searchPlan,
      gateResult,
      context
    );
    const googleExecuteDurationMs = Date.now() - googleExecuteStartTime;
    
    // Build SearchResponse from results
    const response = buildSearchResponseFromResults(
      results,
      intentLiteResult,
      searchPlan,
      gateResult,
      context,
      startTime
    );
    
    // ========================================================================
    // PIPELINE COMPLETE
    // ========================================================================
    const totalPipelineMs = Date.now() - pipelineStartTime;
    
    logger.info({
      requestId,
      pipelineVersion: 'v2',
      event: 'pipeline_completed',
      totalPipelineMs,
      resultCount: response.results.length,
      stages: {
        gateDurationMs,
        intentLiteDurationMs,
        routeMapDurationMs,
        googleExecuteDurationMs
      }
    }, 'pipeline_completed');
    
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
  sessionService: import('../types/search.types.js').ISessionService | undefined,
  delegateToExistingFlow: PipelineDependencies['delegateToExistingFlow']
): PipelineDependencies {
  return {
    gateAdapter,
    ...(sessionService && { sessionService }),
    delegateToExistingFlow
  };
}

/**
 * Build SearchResponse from Google Places results
 * 
 * Creates a complete SearchResponse structure from the pipeline stages
 */
function buildSearchResponseFromResults(
  results: RestaurantResult[],
  intentLiteResult: IntentLiteResult,
  searchPlan: SearchPlan,
  gateResult: GateResult,
  context: PipelineContext,
  startTime: number
): SearchResponse {
  const { sessionId } = context;
  
  // Build minimal ParsedIntent
  const languageContext: LanguageContext = {
    uiLanguage: gateResult.language === 'he' ? 'he' : 'en',
    requestLanguage: gateResult.language as any,
    googleLanguage: gateResult.language === 'he' ? 'he' : 'en'
  };
  
  const parsedIntent: ParsedIntent = {
    query: intentLiteResult.food.canonical,
    originalQuery: context.request.query,
    searchMode: searchPlan.mode,
    filters: {
      ...(intentLiteResult.virtual?.openNow !== undefined && { openNow: intentLiteResult.virtual.openNow }),
      dietary: []
    },
    languageContext,
    language: languageContext.googleLanguage,
    ...(intentLiteResult.location.text && context.request.userLocation && {
      location: {
        place: intentLiteResult.location.text,
        coords: context.request.userLocation
      }
    }),
    ...(intentLiteResult.food.canonical && {
      canonical: {
        category: intentLiteResult.food.canonical,
        ...(intentLiteResult.location.text && { locationText: intentLiteResult.location.text })
      }
    })
  };
  
  // Determine failure reason
  const failureReason = results.length === 0 ? 'NO_RESULTS' : 'NONE';
  
  // Calculate total time
  const tookMs = Date.now() - startTime;
  
  // Build response (V2 skips assistant for now)
  const response: SearchResponse = {
    sessionId,
    query: {
      original: context.request.query,
      parsed: parsedIntent,
      language: gateResult.language
    },
    results,
    chips: [], // Empty for now
    assist: null as any, // V2 skips assistant
    meta: {
      tookMs,
      mode: parsedIntent.searchMode,
      appliedFilters: [],
      confidence: intentLiteResult.confidence,
      source: 'google_places',
      failureReason,
      transparency: {
        searchMode: 'FULL',
        searchModeReason: 'v2_pipeline',
        locationUsed: {
          text: intentLiteResult.location.text || '',
          source: context.request.userLocation ? 'gps' : 'unknown',
          coords: context.request.userLocation || null
        },
        radiusUsedMeters: searchPlan.radius,
        radiusSource: intentLiteResult.radiusMeters ? 'explicit' : 
                     (searchPlan.mode === 'nearbysearch' ? 'default_near_me' : 'fallback')
      }
    }
  };
  
  return response;
}

/**
 * Build BYPASS response (non-food query)
 * Returns empty results with appropriate reason
 */
export function buildBypassResponse(
  request: SearchRequest,
  gateResult: import('./types.js').GateResult,
  context: PipelineContext
): import('../types/search-response.dto.js').SearchResponse {
  const { sessionId, startTime } = context;
  
  // Build minimal intent
  const languageContext: import('../types/search.types.js').LanguageContext = {
    uiLanguage: gateResult.language === 'he' ? 'he' : 'en',
    requestLanguage: gateResult.language as any,
    googleLanguage: gateResult.language === 'he' ? 'he' : 'en'
  };
  
  const parsedIntent: import('../types/search.types.js').ParsedIntent = {
    query: request.query,
    originalQuery: request.query,
    searchMode: 'textsearch',
    filters: {},
    languageContext,
    language: languageContext.googleLanguage
  };
  
  const tookMs = Date.now() - startTime;
  
  return {
    sessionId,
    query: {
      original: request.query,
      parsed: parsedIntent,
      language: gateResult.language
    },
    results: [],
    chips: [],
    assist: null as any,
    meta: {
      tookMs,
      mode: 'textsearch',
      appliedFilters: [],
      confidence: gateResult.confidence,
      source: 'bypass',
      failureReason: 'NO_RESULTS' // Closest match for non-food related
    }
  };
}

/**
 * Build ASK_CLARIFY response (missing anchors)
 * Returns empty results indicating clarification needed
 */
export function buildClarifyResponse(
  request: SearchRequest,
  gateResult: import('./types.js').GateResult,
  context: PipelineContext
): import('../types/search-response.dto.js').SearchResponse {
  const { sessionId, startTime } = context;
  
  // Build minimal intent
  const languageContext: import('../types/search.types.js').LanguageContext = {
    uiLanguage: gateResult.language === 'he' ? 'he' : 'en',
    requestLanguage: gateResult.language as any,
    googleLanguage: gateResult.language === 'he' ? 'he' : 'en'
  };
  
  const parsedIntent: import('../types/search.types.js').ParsedIntent = {
    query: request.query,
    originalQuery: request.query,
    searchMode: 'textsearch',
    filters: {},
    languageContext,
    language: languageContext.googleLanguage
  };
  
  const tookMs = Date.now() - startTime;
  
  // Build clarification message based on language
  const clarificationText = gateResult.language === 'he' 
    ? 'אנא ספק פרטים נוספים על מה שאתה מחפש'
    : 'Please provide more details about what you\'re looking for';
  
  return {
    sessionId,
    query: {
      original: request.query,
      parsed: parsedIntent,
      language: gateResult.language
    },
    results: [],
    chips: [],
    assist: null as any,
    requiresClarification: true,
    clarification: {
      question: clarificationText,
      choices: [] // Empty choices for now
    },
    meta: {
      tookMs,
      mode: 'textsearch',
      appliedFilters: [],
      confidence: gateResult.confidence,
      source: 'clarify',
      failureReason: 'LOW_CONFIDENCE' // Closest match for missing info
    }
  };
}
