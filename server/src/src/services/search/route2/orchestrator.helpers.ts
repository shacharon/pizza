/**
 * Route2 Orchestrator Pure Helpers
 * Stateless helper functions for orchestrator
 */

import type { Route2Context } from './types.js';
import type { SearchRequest } from '../types/search-request.dto.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Check if debug stop is requested at a specific stage
 */
export function shouldDebugStop(ctx: Route2Context, stopAfter: string): boolean {
  return ctx.debug?.stopAfter === stopAfter;
}

/**
 * Convert language to assistant-supported language
 * Maps detected language to supported LLM languages
 */
export function toAssistantLanguage(
  lang: unknown
): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' {
  if (!lang || typeof lang !== 'string') {
    return 'other';
  }

  const normalized = lang.toLowerCase();

  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  if (normalized === 'ru') return 'ru';
  if (normalized === 'ar') return 'ar';
  if (normalized === 'fr') return 'fr';
  if (normalized === 'es') return 'es';

  return 'other';
}

/**
 * Resolve assistant language with strict priority to prevent drift to English
 *
 * PRIORITY (FIXED - intent.language is single source of truth):
 * 1. Intent / Gate2 language (LLM output) - SINGLE SOURCE OF TRUTH
 * 2. Query language detection (deterministic)
 * 3. UI language (LAST RESORT ONLY)
 * 4. Fallback: en
 *
 * IMPORTANT:
 * - intent.language is the SINGLE SOURCE OF TRUTH (always prioritized)
 * - base_filters.language DEPRECATED - removed from priority chain
 * - uiLanguage MUST NOT override Arabic/Hebrew queries
 * - queryLanguage always wins over uiLanguage
 */
export function resolveAssistantLanguage(
  ctx: Route2Context,
  _request?: SearchRequest,
  detectedLanguage?: unknown
): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' {
  let chosen: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' | null = null;
  let source = 'unknown';

  // Collect candidates for full visibility
  // REMOVED: base_filters.language (deprecated - intent.language is single source of truth)
  const candidates = {
    intent: detectedLanguage ? toAssistantLanguage(detectedLanguage) : undefined,
    queryDetected: ctx.queryLanguage
      ? toAssistantLanguage(ctx.queryLanguage)
      : undefined,
    uiLanguage: ctx.sharedFilters?.final?.uiLanguage
      ? toAssistantLanguage(ctx.sharedFilters.final.uiLanguage)
      : undefined
  };

  // 1. Intent / Gate2 language (LLM) - SINGLE SOURCE OF TRUTH
  if (candidates.intent && candidates.intent !== 'other') {
    chosen = candidates.intent;
    source = 'intent';
  }

  // 2. Query language (deterministic) — CRITICAL FIX
  if (!chosen && candidates.queryDetected && candidates.queryDetected !== 'other') {
    chosen = candidates.queryDetected;
    source = 'queryDetected';
  }

  // 3. UI language — LAST RESORT ONLY (was priority 4, renumbered after removing baseFilters)
  if (!chosen && candidates.uiLanguage && candidates.uiLanguage !== 'other') {
    chosen = candidates.uiLanguage;
    source = 'uiLanguage';
  }

  // 4. Final fallback (was priority 5, renumbered)
  if (!chosen) {
    chosen = 'en';
    source = 'fallback_en';
  }

  if (ctx.requestId) {
    logger.info(
      {
        requestId: ctx.requestId,
        event: 'assistant_language_resolved',
        chosen,
        source,
        candidates,
        raw: {
          detectedLanguage,
          queryLanguage: ctx.queryLanguage
        }
      },
      '[ASSISTANT] Language resolved'
    );
  }

  return chosen;
}

/**
 * Map query language to UI language (all 8 supported languages)
 * Used for HTTP response languageContext.uiLanguage
 */
export function mapQueryLanguageToUILanguage(
  queryLang: unknown
): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it' {
  if (!queryLang || typeof queryLang !== 'string') {
    return 'en'; // Default fallback
  }

  const normalized = queryLang.toLowerCase();

  // Direct mappings for supported languages
  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  if (normalized === 'ru') return 'ru';
  if (normalized === 'ar') return 'ar';
  if (normalized === 'fr') return 'fr';
  if (normalized === 'es') return 'es';
  if (normalized === 'de') return 'de';
  if (normalized === 'it') return 'it';

  // Fallback for 'unknown' or unsupported languages
  return 'en';
}

/**
 * Resolve session ID from request or context
 * CRITICAL: ctx.sessionId (JWT) takes precedence over request.sessionId
 */
export function resolveSessionId(
  request: SearchRequest,
  ctx: Route2Context
): string {
  return ctx.sessionId || request.sessionId || 'route2-session';
}
