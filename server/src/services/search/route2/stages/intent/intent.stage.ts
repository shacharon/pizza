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
  INTENT_PROMPT_VERSION,
  INTENT_PROMPT_HASH
} from './intent.prompt.js';

/**
 * Create fallback result when LLM fails
 * Conservative fallback: TEXTSEARCH with low confidence
 */
function createFallbackResult(): IntentResult {
  return {
    route: 'TEXTSEARCH',
    confidence: 0.3,
    reason: 'fallback'
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
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'intent',
    event: 'stage_started',
    query: request.query
  }, '[ROUTE2] intent started');

  try {
    // Call LLM for routing decision
    const messages: Message[] = [
      { role: 'system', content: INTENT_SYSTEM_PROMPT },
      { role: 'user', content: request.query }
    ];

    const llmResult = await llmProvider.completeJSON(
      messages,
      IntentLLMSchema,
      {
        temperature: 0,
        timeout: 1500,
        promptVersion: INTENT_PROMPT_VERSION,
        promptHash: INTENT_PROMPT_HASH,
        promptLength: INTENT_SYSTEM_PROMPT.length,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        ...(requestId && { requestId }),
        stage: 'intent'
      },
      INTENT_JSON_SCHEMA
    );

    const result: IntentResult = {
      route: llmResult.route,
      confidence: llmResult.confidence,
      reason: llmResult.reason
    };

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent',
      event: 'stage_completed',
      durationMs,
      route: result.route,
      confidence: result.confidence,
      reason: result.reason
    }, '[ROUTE2] intent completed');

    return result;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';
    const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('abort');

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent',
      event: 'stage_failed',
      durationMs,
      error: errorMsg,
      isTimeout
    }, '[ROUTE2] intent failed');

    // Fallback to TEXTSEARCH
    const result = createFallbackResult();

    return result;
  }
}
