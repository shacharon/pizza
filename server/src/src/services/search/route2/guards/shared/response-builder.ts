/**
 * Response Builder Module
 * Eliminates duplicated response construction across guards
 */

import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { SearchResponse } from '../../../types/search-response.dto.js';
import type { Route2Context } from '../../types.js';
import { mapQueryLanguageToUILanguage } from '../../orchestrator.helpers.js';
import { toRequestLanguage } from '../../orchestrator.early-context.js';

export interface GuardResponseParams {
  request: SearchRequest;
  ctx: Route2Context;
  sessionId: string;
  assistMessage: string;
  assistType: 'guide' | 'clarify';
  gateLanguage: string; // Flexible string type (accepts Gate2Language)
  sourceLanguage: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other' | 'unknown' | undefined;
  confidence: number;
  source: string;
  failureReason: 'LOW_CONFIDENCE' | 'LOCATION_REQUIRED';
}

/**
 * Build standardized guard response (STOP/CLARIFY)
 * Eliminates duplication across handleGateStop, handleGateClarify, etc.
 */
export function buildGuardResponse(params: GuardResponseParams): SearchResponse {
  const {
    request,
    ctx,
    sessionId,
    assistMessage,
    assistType,
    gateLanguage,
    sourceLanguage,
    confidence,
    source,
    failureReason
  } = params;

  // Derive UI language from source language (default to 'he' if undefined/unknown)
  const normalizedLanguage = sourceLanguage || 'he';
  const uiLanguage = mapQueryLanguageToUILanguage(normalizedLanguage as any);
  const googleLanguage: 'he' | 'en' = sourceLanguage === 'he' ? 'he' : 'en';

  return {
    requestId: ctx.requestId,
    sessionId,
    query: {
      original: request.query,
      parsed: {
        query: request.query,
        searchMode: 'textsearch' as const,
        filters: {},
        languageContext: {
          uiLanguage,
          requestLanguage: toRequestLanguage(sourceLanguage),
          googleLanguage
        },
        originalQuery: request.query
      },
      language: gateLanguage
    },
    results: [],
    chips: [],
    assist: { type: assistType, message: assistMessage },
    meta: {
      tookMs: Date.now() - ctx.startTime,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence,
      source,
      failureReason
    }
  };
}
