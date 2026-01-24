/**
 * INTENT Stage - ROUTE2 Pipeline
 * 
 * Router-only LLM stage - no extraction
 * Determines search mode: TEXTSEARCH/NEARBY/LANDMARK
 * 
 * Target: <1500ms with timeout enforcement
 */

import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { IntentLLMSchema } from './intent.types.js';
import {
  INTENT_SYSTEM_PROMPT,
  INTENT_JSON_SCHEMA,
  INTENT_SCHEMA_HASH,
  INTENT_PROMPT_VERSION,
  INTENT_PROMPT_HASH
} from './intent.prompt.js';
import { startStage, endStage } from '../../../../../lib/telemetry/stage-timer.js';
import { sanitizeQuery } from '../../../../../lib/telemetry/query-sanitizer.js';

/**
 * Create fallback result when LLM fails
 * Conservative fallback: TEXTSEARCH with low confidence
 */
function isAbortTimeoutError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.toLowerCase().includes('abort') || msg.toLowerCase().includes('timeout');
}

function resolveFallbackLanguage(query: string): 'he' | 'en' {
  return /[\u0590-\u05FF]/.test(query) ? 'he' : 'en';
}

function createFallbackResult(query: string): IntentResult {
  return {
    route: 'TEXTSEARCH',
    confidence: 0.3,
    reason: 'fallback',
    language: resolveFallbackLanguage(query),
    region: 'IL',
    regionConfidence: 0.1,
    regionReason: 'fallback_default'
  };
}


/**
 * Execute INTENT stage
 * 
 * @param request Search request
 * @param context Pipeline context
 * @returns Intent routing decision
 */
export async function executeIntentStage(
  request: SearchRequest,
  context: Route2Context
): Promise<IntentResult> {
  const { requestId, traceId, sessionId, llmProvider, userLocation } = context;
  const { queryLen, queryHash } = sanitizeQuery(request.query);

  const startTime = startStage(context, 'intent', {
    queryLen,
    queryHash
  });

  try {
    const messages: Message[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: request.query }
    ];

    const response = await llmProvider.completeJSON(
      messages,
      IntentLLMSchema,
      {
        temperature: 0.1,
        timeout: 2500,
        requestId,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        stage: 'intent',
        promptVersion: INTENT_PROMPT_VERSION,
        promptHash: INTENT_PROMPT_HASH,
        schemaHash: INTENT_SCHEMA_HASH
      },
      INTENT_JSON_SCHEMA  // Pass static schema to avoid double conversion
    );

    if (!response || !response.data) {
      logger.warn({
        requestId,
        pipelineVersion: 'route2',
        stage: 'intent',
        event: 'intent_schema_invalid',
        schemaName: 'IntentLLMSchema',
        schemaVersion: INTENT_PROMPT_VERSION,
        schemaHash: INTENT_SCHEMA_HASH,
        rootTypeDetected: typeof response?.data,
        intentFailed: true,
        msg: '[ROUTE2] Intent LLM returned invalid/empty response'
      });
      endStage(context, 'intent', startTime, { intentFailed: true });
      return createFallbackResult(request.query);
    }

    const llmResult = response.data;

    if (llmResult.route === 'NEARBY' && !userLocation) {
      logger.warn({
        requestId,
        pipelineVersion: 'route2',
        stage: 'intent',
        event: 'nearby_missing_location',
        originalReason: llmResult.reason
      }, '[ROUTE2] Intent NEARBY but userLocation missing');

      return {
        // אם הוספת CLARIFY בטייפים/סכימה – זה עדיף:
        // route: 'CLARIFY',
        // reason: 'missing_user_location',
        // confidence: Math.min(llmResult.confidence ?? 0.8, 0.8),

        // אם עדיין אין CLARIFY, זה ה"פאץ'" המינימלי:
        route: 'TEXTSEARCH',
        confidence: Math.min(llmResult.confidence ?? 0.8, 0.6),
        reason: 'nearby_location_missing_fallback',
        language: llmResult.language,
        region: llmResult.region,
        regionConfidence: llmResult.regionConfidence,
        regionReason: llmResult.regionReason,
        ...(llmResult.cityText && { cityText: llmResult.cityText })
      };
    }
    endStage(context, 'intent', startTime, {
      route: llmResult.route,
      confidence: llmResult.confidence,
      reason: llmResult.reason
    });

    return {
      route: llmResult.route,
      confidence: llmResult.confidence,
      reason: llmResult.reason,
      language: llmResult.language,
      region: llmResult.region,
      regionConfidence: llmResult.regionConfidence,
      regionReason: llmResult.regionReason,
      ...(llmResult.cityText && { cityText: llmResult.cityText })
    };

  } catch (error) {
    const isTimeout = isAbortTimeoutError(error);

    endStage(context, 'intent', startTime, {
      error: error instanceof Error ? error.message : 'unknown',
      isTimeout,
      intentFailed: true
    });

    return createFallbackResult(request.query);
  }
}
