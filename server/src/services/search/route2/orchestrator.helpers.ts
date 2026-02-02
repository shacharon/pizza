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
export function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' {
  if (!lang || typeof lang !== 'string') {
    return 'en';
  }

  const normalized = lang.toLowerCase();

  // Direct mapping for supported languages
  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  if (normalized === 'ru') return 'ru';
  if (normalized === 'ar') return 'ar';
  if (normalized === 'fr') return 'fr';
  if (normalized === 'es') return 'es';

  // Map unsupported languages to 'other' (LLM will respond in English)
  return 'other';
}

/**
 * Resolve assistant language with proper priority to prevent drift to English
 * 
 * NEW PRIORITY (2026-02-02 - FIXED):
 * 1. Detected language from stage (gate/intent/mapping) - if present and confident
 * 2. UI language from request/filters - if present
 * 3. Deterministic query language detection (queryLanguage) - if not "unknown"
 * 4. Fallback: uiLanguage or 'en'
 * 
 * CRITICAL FIXES:
 * - Never default to 'en' when query is mixed-script ("unknown")
 * - Stage-detected language (from Gate2) has highest priority
 * - Returns full LangCode (supports he/en/ru/ar/fr/es/other)
 * 
 * @returns LangCode (he/en/ru/ar/fr/es/other)
 */
export function resolveAssistantLanguage(
  ctx: Route2Context,
  request?: SearchRequest,
  detectedLanguage?: unknown
): 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' {
  let source: string = 'unknown';
  let result: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other' | null = null;
  
  // Track candidates for logging
  const candidates: Record<string, any> = {};

  // Priority 1: Detected language from stage (gate/intent/mapping) - HIGHEST
  if (detectedLanguage) {
    const normalized = toAssistantLanguage(detectedLanguage);
    candidates.detectedLanguage = normalized;
    
    // Use detected language if it's not 'other'
    if (normalized !== 'other') {
      result = normalized;
      source = 'detectedLanguage';
    }
  }

  // Priority 2: UI language from filters (if Priority 1 didn't resolve)
  if (!result && ctx.sharedFilters?.final?.uiLanguage) {
    const uiLang = toAssistantLanguage(ctx.sharedFilters.final.uiLanguage);
    candidates.uiLanguage = uiLang;
    if (uiLang !== 'other') {
      result = uiLang;
      source = 'uiLanguage';
    }
  }

  // Priority 3: Deterministic query language detection (if not "unknown")
  if (!result && ctx.queryLanguage && ctx.queryLanguage !== 'unknown') {
    const queryLang = toAssistantLanguage(ctx.queryLanguage);
    candidates.queryLanguage = queryLang;
    if (queryLang !== 'other') {
      result = queryLang;
      source = 'queryLanguage';
    }
  }

  // Priority 4: Base filters language
  if (!result && ctx.sharedFilters?.preGoogle?.language) {
    const baseLang = toAssistantLanguage(ctx.sharedFilters.preGoogle.language);
    candidates.baseFilters = baseLang;
    if (baseLang !== 'other') {
      result = baseLang;
      source = 'baseFilters';
    }
  }

  // Final fallback: Use uiLanguage if available, else 'en'
  if (!result) {
    const fallbackLang = ctx.sharedFilters?.final?.uiLanguage 
      ? toAssistantLanguage(ctx.sharedFilters.final.uiLanguage)
      : 'en';
    result = fallbackLang !== 'other' ? fallbackLang : 'en';
    source = 'fallback';
  }

  // Enhanced logging with all candidates
  if (ctx.requestId) {
    logger.info({
      requestId: ctx.requestId,
      event: 'assistant_language_resolved',
      chosen: result,
      source,
      candidates,
      queryLanguageDetected: ctx.queryLanguage,
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
