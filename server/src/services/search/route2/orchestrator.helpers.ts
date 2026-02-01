/**
 * Route2 Orchestrator Pure Helpers
 * Stateless helper functions for orchestrator
 */

import type { Route2Context } from './types.js';
import type { SearchRequest } from '../types/search-request.dto.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { detectQueryLanguage } from './utils/query-language-detector.js';

/**
 * ============================================================================
 * DEBUG STOP-AFTER-STAGE SUPPORT
 * ============================================================================
 * 
 * Allows forcing the pipeline to return early after specific stages for debugging.
 * 
 * SUPPORTED STAGES:
 * - 'gate2'        : After gate2 validation (food signal detection)
 * - 'intent'       : After intent routing decision
 * - 'route_llm'    : After route-LLM mapping (before Google fetch)
 * - 'google'       : After Google Maps API results
 * - 'cuisine'      : After cuisine enforcement (LLM-based filtering)
 * - 'post_filters' : After post-constraints filters applied
 * - 'ranking'      : After ranking/reordering
 * - 'response'     : Before final response building
 * 
 * HOW TO USE:
 * 
 * 1. Via HTTP Request Payload:
 *    POST /api/v1/search
 *    {
 *      "query": "sushi in tel aviv",
 *      "debug": { "stopAfter": "google" }
 *    }
 * 
 * 2. Response Shape:
 *    Returns SearchResponse with:
 *    - results: []
 *    - chips: []
 *    - assist: { type: 'debug', message: 'DEBUG STOP after <stage>' }
 *    - meta.source = 'route2_debug_stop'
 *    - debug: lightweight artifacts (see below)
 * 
 * 3. Debug Artifacts by Stage:
 *    - gate2/intent/route_llm: Full objects
 *    - google: count + durationMs + first 5 placeIds (NO full results)
 *    - cuisine: flags + counts + hasScores
 *    - post_filters: stats/applied/relaxed
 *    - ranking: rankingApplied + countIn/countOut + orderExplain
 * 
 * IMPLEMENTATION NOTES:
 * - No business logic changes - only early returns
 * - Parallel promises still drained in finally block (prevents unhandled rejections)
 * - Safe in production: returns lightweight response, no memory leaks
 * - Type-safe: DebugStage enum enforces valid stage names
 * 
 * ============================================================================
 */

export type DebugStage = 'gate2' | 'intent' | 'route_llm' | 'google' | 'cuisine' | 'post_filters' | 'ranking' | 'response';

/**
 * Check if debug stop is requested at a specific stage
 * 
 * @param ctx - Route2Context with optional debug config
 * @param stopAfter - Stage to check for stop
 * @returns true if debug stop is requested at this stage
 * 
 * @example
 * if (shouldDebugStop(ctx, 'google')) {
 *   return buildDebugResponse(...);
 * }
 */
export function shouldDebugStop(ctx: Route2Context, stopAfter: DebugStage): boolean {
  return ctx.debug?.stopAfter === stopAfter;
}

/**
 * Convert language to assistant-supported language
 * Maps detected language to he/en/ar/ru/fr/es for LLM-generated messages
 * Internal helper - not exported
 */
function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other' {
  if (!lang || typeof lang !== 'string') {
    return 'en';
  }

  const normalized = lang.toLowerCase();

  if (normalized === 'he') {
    return 'he';
  }

  if (normalized === 'en') {
    return 'en';
  }

  if (normalized === 'ar') {
    return 'ar';
  }

  if (normalized === 'ru') {
    return 'ru';
  }

  if (normalized === 'fr') {
    return 'fr';
  }

  if (normalized === 'es') {
    return 'es';
  }

  // Map unsupported languages to 'other'
  return 'other';
}

/**
 * Language confidence threshold for LLM language detection
 * If LLM languageConfidence >= threshold, use detected language
 * Otherwise, fallback to uiLanguage
 */
const LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Decide assistant language using LLM detection with confidence threshold
 * 
 * Rules:
 * 1. If detectedLanguage exists AND languageConfidence >= threshold → use detectedLanguage
 * 2. CRITICAL: If detectedLanguage is 'other', perform deterministic Hebrew detection on query
 * 3. Else if uiLanguage available → use uiLanguage
 * 4. Else → use 'en' (should rarely happen)
 * 
 * @returns { language, source, confidence } - decision result with source attribution
 */
function decideAssistantLanguage(
  ctx: Route2Context,
  request?: SearchRequest,
  detectedLanguage?: unknown,
  languageConfidence?: number
): { language: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es'; source: string; confidence?: number } {
  // Priority 1: LLM-detected language with confidence check
  if (detectedLanguage && languageConfidence !== undefined) {
    const normalized = toAssistantLanguage(detectedLanguage);

    if (languageConfidence >= LANGUAGE_CONFIDENCE_THRESHOLD) {
      // High confidence - use LLM detection
      if (normalized === 'he') {
        return { language: 'he', source: 'llm_confident', confidence: languageConfidence };
      } else if (normalized === 'en') {
        return { language: 'en', source: 'llm_confident', confidence: languageConfidence };
      } else if (normalized === 'ar') {
        return { language: 'ar', source: 'llm_confident', confidence: languageConfidence };
      } else if (normalized === 'ru') {
        return { language: 'ru', source: 'llm_confident', confidence: languageConfidence };
      } else if (normalized === 'fr') {
        return { language: 'fr', source: 'llm_confident', confidence: languageConfidence };
      } else if (normalized === 'es') {
        return { language: 'es', source: 'llm_confident', confidence: languageConfidence };
      }
      // If 'other' (unsupported language), fall through to uiLanguage
    } else {
      // Low confidence - fall through to uiLanguage
    }
  }

  // Priority 1.5: CRITICAL - Deterministic Hebrew detection for 'other' language
  // When LLM returns 'other', check if query contains Hebrew characters
  if (detectedLanguage === 'other' && request?.query) {
    const deterministicLanguage = detectQueryLanguage(request.query);
    if (deterministicLanguage === 'he') {
      return {
        language: 'he',
        source: 'deterministic_hebrew',
        confidence: 0.95
      };
    }
  }

  // Priority 2: UI language (from resolved filters)
  if (ctx.sharedFilters?.final?.uiLanguage) {
    return {
      language: ctx.sharedFilters.final.uiLanguage,
      source: languageConfidence !== undefined && languageConfidence < LANGUAGE_CONFIDENCE_THRESHOLD
        ? 'uiLanguage_low_confidence'
        : 'uiLanguage',
      ...(languageConfidence !== undefined && { confidence: languageConfidence })
    };
  }

  // Priority 3: Base filters language (should rarely reach here)
  if (ctx.sharedFilters?.preGoogle?.language) {
    const lang = ctx.sharedFilters.preGoogle.language;
    if (lang === 'he') {
      return { language: 'he', source: 'baseFilters', ...(languageConfidence !== undefined && { confidence: languageConfidence }) };
    } else if (lang === 'en') {
      return { language: 'en', source: 'baseFilters', ...(languageConfidence !== undefined && { confidence: languageConfidence }) };
    }
  }

  // Final fallback: 'en' (should rarely happen)
  return { language: 'en', source: 'fallback', ...(languageConfidence !== undefined && { confidence: languageConfidence }) };
}

/**
 * Resolve assistant language using LLM detection with confidence threshold
 * Combines decision logic with observability logging
 * 
 * CRITICAL: Language comes from LLM only (no deterministic detection)
 * 
 * @returns 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' (never 'other' - assistant must be decisive)
 */
export function resolveAssistantLanguage(
  ctx: Route2Context,
  request?: SearchRequest,
  detectedLanguage?: unknown,
  languageConfidence?: number
): 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' {
  const { language, source, confidence } = decideAssistantLanguage(ctx, request, detectedLanguage, languageConfidence);

  // Log language resolution (observability only)
  if (ctx.requestId) {
    logger.info({
      requestId: ctx.requestId,
      event: 'assistant_language_resolved',
      assistantLanguage: language,
      source,

      detectedLanguage: detectedLanguage ? String(detectedLanguage) : undefined,
      languageConfidence: confidence,
      confidenceThreshold: LANGUAGE_CONFIDENCE_THRESHOLD,
      uiLanguage: ctx.sharedFilters?.final?.uiLanguage
    }, '[ASSISTANT] Language resolved for assistant message');
  }

  return language;
}

/**
 * Resolve session ID from request or context
 * CRITICAL: ctx.sessionId (JWT) takes precedence over request.sessionId (client payload)
 * This ensures consistent sessionHash in subscribe vs publish logs
 */
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return ctx.sessionId || request.sessionId || 'route2-session';
}
