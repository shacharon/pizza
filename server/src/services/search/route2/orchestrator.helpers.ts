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
 * Maps detected language to he/en/other for LLM-generated messages
 */
export function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'other' {
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

  // Map ru/ar/fr/es to 'other' (LLM will respond in English)
  return 'other';
}

/**
 * Resolve assistant language with deterministic fallback chain
 * 
 * NEW PRIORITY (2026-01-29):
 * 1. ctx.queryLanguage (DETERMINISTIC query text detection) ← PRIMARY SOURCE
 * 2. detectedLanguage from stage (gate/intent/mapping)
 * 3. sharedFilters.final.uiLanguage (UI preference)
 * 4. sharedFilters.preGoogle.language (base filters)
 * 5. Final fallback: 'en'
 * 
 * CRITICAL: Assistant responds in QUERY language, not region/UI language
 * 
 * @returns 'he' | 'en' only (never 'other' - assistant must be decisive)
 */
export function resolveAssistantLanguage(
  ctx: Route2Context,
  request?: SearchRequest,
  detectedLanguage?: unknown
): 'he' | 'en' {
  let source: string;
  let result: 'he' | 'en';

  // Priority 1: Deterministic query language detection (NEW - highest priority)
  if (ctx.queryLanguage) {
    result = ctx.queryLanguage;
    source = 'queryLanguage';
  }
  // Priority 2: Detected language from stage (gate/intent/mapping)
  else if (detectedLanguage) {
    const normalized = toAssistantLanguage(detectedLanguage);
    if (normalized === 'he') {
      result = 'he';
      source = 'detectedLanguage';
    } else if (normalized === 'en') {
      result = 'en';
      source = 'detectedLanguage';
    } else {
      // Priority 3: Resolved filters UI language
      if (ctx.sharedFilters?.final?.uiLanguage) {
        result = ctx.sharedFilters.final.uiLanguage;
        source = 'uiLanguage';
      }
      // Priority 4: Base filters language
      else if (ctx.sharedFilters?.preGoogle?.language) {
        const lang = ctx.sharedFilters.preGoogle.language;
        if (lang === 'he') {
          result = 'he';
          source = 'baseFilters';
        } else if (lang === 'en') {
          result = 'en';
          source = 'baseFilters';
        } else {
          result = 'en';
          source = 'fallback';
        }
      } else {
        result = 'en';
        source = 'fallback';
      }
    }
  }
  // Priority 3: Resolved filters UI language
  else if (ctx.sharedFilters?.final?.uiLanguage) {
    result = ctx.sharedFilters.final.uiLanguage;
    source = 'uiLanguage';
  }
  // Priority 4: Base filters language
  else if (ctx.sharedFilters?.preGoogle?.language) {
    const lang = ctx.sharedFilters.preGoogle.language;
    if (lang === 'he') {
      result = 'he';
      source = 'baseFilters';
    } else if (lang === 'en') {
      result = 'en';
      source = 'baseFilters';
    } else {
      result = 'en';
      source = 'fallback';
    }
  }
  // Final fallback: English (international default)
  else {
    result = 'en';
    source = 'fallback';
  }

  // Log language resolution (if requestId available)
  if (ctx.requestId) {
    logger.info({
      requestId: ctx.requestId,
      event: 'assistant_language_resolved',
      assistantLanguage: result,
      source,
      queryLanguage: ctx.queryLanguage,
      uiLanguage: ctx.sharedFilters?.final?.uiLanguage,
      detectedLanguage: detectedLanguage ? String(detectedLanguage) : undefined
    }, '[ASSISTANT] Language resolved for assistant message');
  }

  return result;
}

/**
 * Resolve session ID from request or context
 * CRITICAL: ctx.sessionId (JWT) takes precedence over request.sessionId (client payload)
 * This ensures consistent sessionHash in subscribe vs publish logs
 */
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return ctx.sessionId || request.sessionId || 'route2-session';
}
