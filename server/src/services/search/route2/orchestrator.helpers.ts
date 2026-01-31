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
 * Internal helper - not exported
 */
function toAssistantLanguage(lang: unknown): 'he' | 'en' | 'other' {
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
 * 2. Else if uiLanguage available → use uiLanguage
 * 3. Else → use 'en' (should rarely happen)
 * 
 * @returns { language, source, confidence } - decision result with source attribution
 */
function decideAssistantLanguage(
  ctx: Route2Context,
  detectedLanguage?: unknown,
  languageConfidence?: number
): { language: 'he' | 'en'; source: string; confidence?: number } {
  // Priority 1: LLM-detected language with confidence check
  if (detectedLanguage && languageConfidence !== undefined) {
    const normalized = toAssistantLanguage(detectedLanguage);

    if (languageConfidence >= LANGUAGE_CONFIDENCE_THRESHOLD) {
      // High confidence - use LLM detection
      if (normalized === 'he') {
        return { language: 'he', source: 'llm_confident', confidence: languageConfidence };
      } else if (normalized === 'en') {
        return { language: 'en', source: 'llm_confident', confidence: languageConfidence };
      }
      // If 'other' (ru/ar/fr/es), fall through to uiLanguage
    } else {
      // Low confidence - fall through to uiLanguage
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
 * @returns 'he' | 'en' only (never 'other' - assistant must be decisive)
 */
export function resolveAssistantLanguage(
  ctx: Route2Context,
  request?: SearchRequest,
  detectedLanguage?: unknown,
  languageConfidence?: number
): 'he' | 'en' {
  const { language, source, confidence } = decideAssistantLanguage(ctx, detectedLanguage, languageConfidence);

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
