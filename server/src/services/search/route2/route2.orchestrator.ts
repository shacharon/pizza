/**
 * ROUTE2 Orchestrator
 * 
 * SKELETON: Clean new pipeline with no V1/V2 dependencies
 * 
 * Flow:
 * 1. GATE2: Pre-filter (stop/clarify/continue)
 * 2. INTENT: Router (textsearch/nearby/landmark)
 * 3. ROUTE_LLM: Determine search mode
 * 4. GOOGLE_MAPS: Execute search
 * 5. Build response
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context } from './types.js';
import { executeGate2Stage } from './stages/gate2.stage.js';
import { executeIntentStage } from './stages/intent/intent.stage.js';
import { executeRouteLLM } from './stages/route-llm/route-llm.dispatcher.js';
import { executeGoogleMapsStage } from './stages/google-maps.stage.js';
import { resolveUserRegionCode } from './utils/region-resolver.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { wsManager } from '../../../server.js';

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

    // EARLY STOP: Gate2 error (timeout/failure)
    if (gateResult.error) {
      logger.error({
        requestId,
        pipelineVersion: 'route2',
        event: 'pipeline_failed',
        reason: 'gate2_error',
        errorCode: gateResult.error.code,
        errorMessage: gateResult.error.message
      }, '[ROUTE2] Pipeline failed - gate2 error');

      throw new Error(`${gateResult.error.code}: ${gateResult.error.message}`);
    }

    // EARLY STOP: Not food-related (genuine NO from LLM)
    if (gateResult.gate.route === 'STOP') {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'pipeline_stopped',
        reason: 'not_food_related',
        foodSignal: gateResult.gate.foodSignal
      }, '[ROUTE2] Pipeline stopped - not food related');

      return {
        requestId,
        sessionId: request.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'he' as const,
              requestLanguage: 'he' as const,
              googleLanguage: 'he' as const
            },
            originalQuery: request.query
          },
          language: gateResult.gate.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'guide' as const,
          message: "זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: 'פיצה בתל אביב'."
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: gateResult.gate.confidence,
          source: 'route2_gate_stop',
          failureReason: 'LOW_CONFIDENCE'
        }
      };
    }

    // EARLY STOP: Uncertain/unclear query - ask for clarification
    if (gateResult.gate.route === 'ASK_CLARIFY') {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'pipeline_clarify',
        reason: 'uncertain_query',
        foodSignal: gateResult.gate.foodSignal
      }, '[ROUTE2] Pipeline asking for clarification');

      return {
        requestId,
        sessionId: request.sessionId || 'route2-session',
        query: {
          original: request.query,
          parsed: {
            query: request.query,
            searchMode: 'textsearch' as const,
            filters: {},
            languageContext: {
              uiLanguage: 'he' as const,
              requestLanguage: 'he' as const,
              googleLanguage: 'he' as const
            },
            originalQuery: request.query
          },
          language: gateResult.gate.language
        },
        results: [],
        chips: [],
        assist: {
          type: 'clarify' as const,
          message: "כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה. לדוגמה: 'סושי באשקלון' או 'פיצה ליד הבית'."
        },
        meta: {
          tookMs: Date.now() - startTime,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: gateResult.gate.confidence,
          source: 'route2_gate_clarify',
          failureReason: 'LOW_CONFIDENCE'
        }
      };
    }

    // CONTINUE - proceed to Intent
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'next_stage_intent',
      foodSignal: gateResult.gate.foodSignal
    }, '[ROUTE2] Proceeding to intent');

    // STAGE 2: INTENT (router-only)
    const intentDecision = await executeIntentStage(request, ctx);

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'intent_decided',
      route: intentDecision.route,
      region: intentDecision.region,
      language: intentDecision.language,
      confidence: intentDecision.confidence,
      reason: intentDecision.reason
    }, '[ROUTE2] Intent routing decided');

    // STAGE 3: ROUTE_LLM (dispatch to route-specific mapper)
    const mapping = await executeRouteLLM(intentDecision, request, ctx);

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'route_llm_mapped',
      providerMethod: mapping.providerMethod,
      region: mapping.region,
      language: mapping.language
    }, '[ROUTE2] Route-LLM mapping completed');

    // STAGE 4: GOOGLE_MAPS
    const googleResult = await executeGoogleMapsStage(mapping, request, ctx);

    // Build response (SKELETON: minimal valid response)
    const totalDurationMs = Date.now() - startTime;

    // Map Gate2Language to valid UI/Google languages
    const detectedLanguage = gateResult.gate.language;
    // UILanguage and GoogleLanguage only support 'he' | 'en'
    const uiLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';
    const googleLanguage: 'he' | 'en' = detectedLanguage === 'he' ? 'he' : 'en';

    const response: SearchResponse = {
      requestId,
      sessionId: request.sessionId || 'route2-session',
      query: {
        original: request.query,
        parsed: {
          query: mapping.providerMethod === 'textSearch' ? mapping.textQuery :
            mapping.providerMethod === 'nearbySearch' ? mapping.keyword :
              mapping.keyword, // landmark uses keyword too
          searchMode: mapping.providerMethod === 'textSearch' ? 'textsearch' as const : 'nearbysearch' as const,
          filters: {},
          languageContext: {
            uiLanguage,
            requestLanguage: detectedLanguage, // RequestLanguage supports all Gate2Language values
            googleLanguage
          },
          originalQuery: request.query
        },
        language: detectedLanguage
      },
      results: googleResult.results,
      chips: [],
      assist: {
        type: 'guide',
        message: googleResult.results.length === 0 ? 'No results found (Google API stub)' : ''
      },
      meta: {
        tookMs: totalDurationMs,
        mode: mapping.providerMethod === 'textSearch' ? 'textsearch' as const : 'nearbysearch' as const,
        appliedFilters: [],
        confidence: intentDecision.confidence,
        source: 'route2',
        failureReason: 'NONE'
      }
    };

    // Log pipeline completion
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      event: 'pipeline_completed',
      durationMs: totalDurationMs,
      resultCount: googleResult.results.length
    }, '[ROUTE2] Pipeline completed');

    // Emit WebSocket event to subscribers
    wsManager.publishToChannel('search', requestId, undefined, {
      type: 'status',
      requestId,
      status: 'completed'
    });

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
