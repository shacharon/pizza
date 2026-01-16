/**
 * ROUTE2 Orchestrator
 * 
 * SKELETON: Clean new pipeline with no V1/V2 dependencies
 * 
 * Flow:
 * 1. GATE2: Pre-filter (bypass/clarify/continue)
 * 2. INTENT2: Extract food + location
 * 3. ROUTE_LLM: Determine search mode
 * 4. GOOGLE_MAPS: Execute search
 * 5. Build response
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context } from './types.js';
import { executeGate2Stage } from './stages/gate2.stage.js';
import { executeIntent2Stage } from './stages/intent2.stage.js';
import { executeRouteLLMStage } from './stages/route-llm.stage.js';
import { executeGoogleMapsStage } from './stages/google-maps.stage.js';
import { resolveUserRegionCode } from './utils/region-resolver.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Execute ROUTE2 search pipeline
 * 
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Search response
 */
export async function searchRoute2(
  request: SearchRequest,
  ctx: Route2Context
): Promise<SearchResponse> {
  const { requestId, startTime } = ctx;

  // Log pipeline selection
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    event: 'pipeline_selected',
    query: request.query
  }, '[ROUTE2] Pipeline selected');

  try {
    // Resolve user region from device
    const { userRegionCode, source: userRegionSource } = await resolveUserRegionCode(ctx);
    ctx.userRegionCode = userRegionCode;

    // STAGE 1: GATE2
    const gateResult = await executeGate2Stage(request, ctx);

    // Handle BYPASS route
    if (gateResult.gate.route === 'BYPASS') {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'pipeline_bypassed',
        reason: 'not_food_related'
      }, '[ROUTE2] Pipeline bypassed');

      return {
        sessionId: request.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'en' as const,
              requestLanguage: 'en' as const,
              googleLanguage: 'en' as const
            },
            originalQuery: request.query
          },
          language: gateResult.gate.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'guide' as const,
          message: 'Not a food-related query. Try asking about restaurants or food.'
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0,
          source: 'route2_gate',
          failureReason: 'LOW_CONFIDENCE'
        }
      };
    }

    // CONTINUE - proceed to Intent2
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'next_stage_intent2'
    }, '[ROUTE2] Proceeding to intent2');

    // STAGE 2: INTENT2
    const intentResult = await executeIntent2Stage(gateResult.gate, request, ctx);

    // Compute final region (query overrides user)
    if (intentResult.queryRegionCode) {
      ctx.queryRegionCode = intentResult.queryRegionCode;
    }
    ctx.regionCodeFinal = intentResult.queryRegionCode ?? userRegionCode;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'region_resolved',
      userRegionCode,
      userRegionSource,
      queryRegionCode: ctx.queryRegionCode,
      regionCodeFinal: ctx.regionCodeFinal,
      mode: intentResult.mode,
      reason: intentResult.reason
    }, '[ROUTE2] Region and mode resolved');

    // STAGE 3: ROUTE_LLM
    const routePlan = await executeRouteLLMStage(intentResult, request, ctx);

    // STAGE 4: GOOGLE_MAPS
    const googleResult = await executeGoogleMapsStage(routePlan, intentResult, request, ctx);

    // Build response (SKELETON: minimal valid response)
    const totalDurationMs = Date.now() - startTime;

    const response: SearchResponse = {
      sessionId: request.sessionId || 'route2-session',
      query: {
        original: request.query,
        parsed: {
          query: intentResult.food.canonicalEn || 'restaurant',
          searchMode: routePlan.mode,
          filters: {},
          languageContext: {
            uiLanguage: 'he',
            requestLanguage: 'he',
            googleLanguage: 'he'
          },
          originalQuery: request.query
        },
        language: intentResult.language || 'he'
      },
      results: [], // Empty for skeleton
      chips: [],
      assist: {
        type: 'guide',
        message: 'ROUTE2 skeleton - no results yet'
      },
      meta: {
        tookMs: totalDurationMs,
        mode: routePlan.mode,
        appliedFilters: [],
        confidence: 0.5,
        source: 'route2_skeleton',
        failureReason: 'NONE'
      }
    };

    // Log pipeline completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_completed',
      durationMs: totalDurationMs,
      resultCount: 0
    }, '[ROUTE2] Pipeline completed');

    return response;

  } catch (error) {
    const durationMs = Date.now() - startTime;

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[ROUTE2] Pipeline failed');

    throw error;
  }
}

/**
 * Expected log output example:
 * 
 * ```
 * [ROUTE2] Pipeline selected { requestId, pipelineVersion:"route2", event:"pipeline_selected" }
 * [ROUTE2] gate2 started { requestId, pipelineVersion:"route2", stage:"gate2", event:"stage_started" }
 * [ROUTE2] gate2 completed { requestId, pipelineVersion:"route2", stage:"gate2", event:"stage_completed", durationMs:5 }
 * [ROUTE2] intent2 started { requestId, pipelineVersion:"route2", stage:"intent2", event:"stage_started" }
 * [ROUTE2] intent2 completed { requestId, pipelineVersion:"route2", stage:"intent2", event:"stage_completed", durationMs:3 }
 * [ROUTE2] route_llm started { requestId, pipelineVersion:"route2", stage:"route_llm", event:"stage_started" }
 * [ROUTE2] route_llm completed { requestId, pipelineVersion:"route2", stage:"route_llm", event:"stage_completed", durationMs:2 }
 * [ROUTE2] google_maps started { requestId, pipelineVersion:"route2", stage:"google_maps", event:"stage_started" }
 * [ROUTE2] google_maps completed { requestId, pipelineVersion:"route2", stage:"google_maps", event:"stage_completed", durationMs:0 }
 * [ROUTE2] Pipeline completed { requestId, pipelineVersion:"route2", event:"pipeline_completed", durationMs:15 }
 * ```
 */
