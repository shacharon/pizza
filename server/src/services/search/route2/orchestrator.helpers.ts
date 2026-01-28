/**
 * Route2 Orchestrator Pure Helpers
 * Stateless helper functions for orchestrator
 */

import type { Route2Context } from './types.js';
import type { SearchRequest } from '../types/search-request.dto.js';

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
  // Priority 1: Deterministic query language detection (NEW - highest priority)
  if (ctx.queryLanguage) {
    return ctx.queryLanguage;
  }

  // Priority 2: Detected language from stage (gate/intent/mapping)
  if (detectedLanguage) {
    const normalized = toAssistantLanguage(detectedLanguage);
    if (normalized === 'he') return 'he';
    if (normalized === 'en') return 'en';
  }

  // Priority 3: Resolved filters UI language
  if (ctx.sharedFilters?.final?.uiLanguage) {
    return ctx.sharedFilters.final.uiLanguage;
  }

  // Priority 4: Base filters language
  if (ctx.sharedFilters?.preGoogle?.language) {
    const lang = ctx.sharedFilters.preGoogle.language;
    if (lang === 'he') return 'he';
    if (lang === 'en') return 'en';
  }

  // Final fallback: English (international default)
  return 'en';
}

/**
 * Resolve session ID from request or context
 * CRITICAL: ctx.sessionId (JWT) takes precedence over request.sessionId (client payload)
 * This ensures consistent sessionHash in subscribe vs publish logs
 */
export function resolveSessionId(request: SearchRequest, ctx: Route2Context): string {
  return ctx.sessionId || request.sessionId || 'route2-session';
}
