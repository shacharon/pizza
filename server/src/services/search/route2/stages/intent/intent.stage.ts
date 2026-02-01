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
import { resolveLLM } from '../../../../../lib/llm/index.js';
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
import { isValidRegionCode } from '../../utils/region-code-validator.js';

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

function createFallbackResult(query: string, isTimeout: boolean): IntentResult {
  const fallbackLanguage = resolveFallbackLanguage(query);
  return {
    route: 'TEXTSEARCH',
    confidence: 0.3,
    reason: isTimeout ? 'fallback_timeout' : 'fallback',
    language: fallbackLanguage,
    languageConfidence: 0.5, // Moderate confidence for fallback
    assistantLanguage: fallbackLanguage as 'he' | 'en', // Normalize to assistant language
    regionCandidate: 'IL',
    regionConfidence: 0.1,
    regionReason: 'fallback_default',
    clarify: null, // Not clarifying in fallback
    // NEW: Default hybrid ordering flags for fallback
    distanceIntent: false,
    openNowRequested: false,
    priceIntent: 'any',
    qualityIntent: false,
    occasion: null,
    cuisineKey: null
  };
}


/**
 * Execute INTENT stage with retry on timeout
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
    // Resolve model and timeout for intent purpose
    const { model, timeoutMs } = resolveLLM('intent');

    const messages: Message[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: request.query }
    ];

    // Try initial call
    let response;
    let retryAttempted = false;

    try {
      response = await llmProvider.completeJSON(
        messages,
        IntentLLMSchema,
        {
          model,
          temperature: 0.1,
          timeout: timeoutMs,
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
    } catch (firstError) {
      // Retry ONLY on abort_timeout errors
      if (isAbortTimeoutError(firstError)) {
        logger.warn({
          requestId,
          pipelineVersion: 'route2',
          stage: 'intent',
          event: 'intent_timeout_retry',
          error: firstError instanceof Error ? firstError.message : String(firstError),
          msg: '[ROUTE2] Intent LLM timeout - retrying once after 250ms'
        });

        // Short backoff: 250ms
        await new Promise(resolve => setTimeout(resolve, 250));
        retryAttempted = true;

        // Retry once
        response = await llmProvider.completeJSON(
          messages,
          IntentLLMSchema,
          {
            model,
            temperature: 0.1,
            timeout: timeoutMs,
            requestId,
            ...(traceId && { traceId }),
            ...(sessionId && { sessionId }),
            stage: 'intent',
            promptVersion: INTENT_PROMPT_VERSION,
            promptHash: INTENT_PROMPT_HASH,
            schemaHash: INTENT_SCHEMA_HASH
          },
          INTENT_JSON_SCHEMA
        );

        logger.info({
          requestId,
          pipelineVersion: 'route2',
          stage: 'intent',
          event: 'intent_retry_success',
          msg: '[ROUTE2] Intent LLM retry succeeded'
        });
      } else {
        // Re-throw non-timeout errors immediately
        throw firstError;
      }
    }

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
        reason: 'fallback_schema_invalid',
        msg: '[ROUTE2] Intent LLM returned invalid/empty response'
      });
      endStage(context, 'intent', startTime, { intentFailed: true, reason: 'fallback_schema_invalid' });
      return createFallbackResult(request.query, false);
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
      
      // Normalize null to undefined for cityText
      const cityText = llmResult.cityText ?? undefined;

      // Normalize assistantLanguage: filter out 'other', fallback to 'en'
      const assistantLanguage = (llmResult.assistantLanguage === 'he' || 
                                  llmResult.assistantLanguage === 'en' || 
                                  llmResult.assistantLanguage === 'ru' || 
                                  llmResult.assistantLanguage === 'ar' || 
                                  llmResult.assistantLanguage === 'fr' || 
                                  llmResult.assistantLanguage === 'es')
        ? llmResult.assistantLanguage
        : 'en';

      return {
        route: 'CLARIFY',
        confidence: Math.min(llmResult.confidence ?? 0.8, 0.8),
        reason: 'missing_user_location',
        language: llmResult.language,
        languageConfidence: llmResult.languageConfidence,
        assistantLanguage, // REQUIRED: For CLARIFY paths
        regionCandidate: llmResult.regionCandidate,
        regionConfidence: llmResult.regionConfidence,
        regionReason: llmResult.regionReason,
        ...(cityText && { cityText }),
        clarify: llmResult.clarify, // Always include (null or object)
  
        // flags נשארים (נוח ל-UX וללוגים)
        distanceIntent: true, // או llmResult.distanceIntent
        openNowRequested: llmResult.openNowRequested,
        priceIntent: llmResult.priceIntent,
        qualityIntent: llmResult.qualityIntent,
        occasion: llmResult.occasion,
        cuisineKey: llmResult.cuisineKey
      };

    }
    // Validate regionCandidate against ISO-3166-1 allowlist
    // If invalid (e.g., "TQ", "IS"), set to null to trigger device/default fallback
    // This prevents noise in logs and downstream sanitization events
    const validatedRegionCandidate = isValidRegionCode(llmResult.regionCandidate)
      ? llmResult.regionCandidate
      : null; // Invalid codes trigger fallback to device region or default

    if (llmResult.regionCandidate !== validatedRegionCandidate) {
      logger.debug({
        requestId,
        pipelineVersion: 'route2',
        stage: 'intent',
        event: 'region_candidate_rejected',
        rejected: llmResult.regionCandidate,
        reason: 'invalid_iso_code'
      }, '[ROUTE2] Intent regionCandidate rejected (invalid ISO code)');
    }

    endStage(context, 'intent', startTime, {
      route: llmResult.route,
      confidence: llmResult.confidence,
      reason: llmResult.reason,
      ...(retryAttempted && { retryAttempted: true })
    });

    // Normalize null to undefined for cityText
    const cityText = llmResult.cityText ?? undefined;

    // Normalize assistantLanguage: filter out 'other', fallback to 'en'
    const assistantLanguage = (llmResult.assistantLanguage === 'he' || 
                                llmResult.assistantLanguage === 'en' || 
                                llmResult.assistantLanguage === 'ru' || 
                                llmResult.assistantLanguage === 'ar' || 
                                llmResult.assistantLanguage === 'fr' || 
                                llmResult.assistantLanguage === 'es')
      ? llmResult.assistantLanguage
      : 'en';

    return {
      route: llmResult.route,
      confidence: llmResult.confidence,
      reason: llmResult.reason,
      language: llmResult.language,
      languageConfidence: llmResult.languageConfidence,
      assistantLanguage, // REQUIRED: For CLARIFY paths
      regionCandidate: validatedRegionCandidate,
      regionConfidence: llmResult.regionConfidence,
      regionReason: llmResult.regionReason,
      ...(cityText && { cityText }),
      clarify: llmResult.clarify, // Always include (null or object)
      // NEW: Hybrid ordering intent flags
      distanceIntent: llmResult.distanceIntent,
      openNowRequested: llmResult.openNowRequested,
      priceIntent: llmResult.priceIntent,
      qualityIntent: llmResult.qualityIntent,
      occasion: llmResult.occasion,
      cuisineKey: llmResult.cuisineKey
    };

  } catch (error) {
    const isTimeout = isAbortTimeoutError(error);
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.warn({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent',
      event: 'intent_error_caught',
      error: errorMsg,
      isTimeout,
      intentFailed: true,
      reason: isTimeout ? 'fallback_timeout' : 'fallback_error',
      msg: '[ROUTE2] Intent LLM error - falling back to TEXTSEARCH'
    });

    endStage(context, 'intent', startTime, {
      error: errorMsg,
      isTimeout,
      intentFailed: true,
      reason: isTimeout ? 'fallback_timeout' : 'fallback_error'
    });

    // Return deterministic fallback (no unhandled rejections)
    return createFallbackResult(request.query, isTimeout);
  }
}
