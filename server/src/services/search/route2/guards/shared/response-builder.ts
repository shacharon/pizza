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

/** Deterministic CLARIFY for TEXTSEARCH missing location (no LLM). Used when anchor_eval blocks and guards return null. */
export interface DeterministicClarifyParams {
  request: SearchRequest;
  ctx: Route2Context;
  sessionId: string;
  sourceLanguage: 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es' | 'other' | 'unknown' | undefined;
  gateLanguage: string;
  confidence: number;
}

export function buildDeterministicMissingLocationClarify(params: DeterministicClarifyParams): SearchResponse {
  const { request, ctx, sessionId, sourceLanguage, gateLanguage, confidence } = params;
  const normalizedLanguage = sourceLanguage || 'he';
  const uiLanguage = mapQueryLanguageToUILanguage(normalizedLanguage as any);
  const googleLanguage: 'he' | 'en' = sourceLanguage === 'he' ? 'he' : 'en';
  const message = 'כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.';
  const question = 'איפה תרצה לחפש? (עיר או אזור)';

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
    assist: {
      type: 'clarify',
      message,
      question,
      suggestedAction: 'ASK_LOCATION',
      reason: 'MISSING_LOCATION'
    } as import('../../../types/search.types.js').AssistPayload,
    meta: {
      tookMs: Date.now() - ctx.startTime,
      mode: 'textsearch' as const,
      appliedFilters: [],
      confidence,
      source: 'route2_textsearch_missing_location_anchor',
      failureReason: 'LOCATION_REQUIRED'
    }
  };
}
