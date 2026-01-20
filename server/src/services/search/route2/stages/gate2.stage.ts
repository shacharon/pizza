/**
 * GATE2 Stage - ROUTE2 Pipeline
 * 
 * LLM-only classification with NO heuristics
 * All food/location/language detection from LLM JSON
 * Routing rules applied deterministically AFTER LLM returns
 * 
 * Target: <1200ms with timeout enforcement
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, Gate2Result } from '../types.js';
import type { Message } from '../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

// Gate2 Zod Schema for LLM output (before routing logic) - SOURCE OF TRUTH
const Gate2LLMSchema = z.object({
  foodSignal: z.enum(['NO', 'UNCERTAIN', 'YES']),
  confidence: z.number().min(0).max(1)
}).strict();

// Generate JSON Schema from Zod (single source of truth)
const { schema: GATE2_JSON_SCHEMA, schemaHash: GATE2_SCHEMA_HASH } = buildLLMJsonSchema(
  Gate2LLMSchema,
  'Gate2LLM'
);

const GATE2_PROMPT_VERSION = 'gate2_v4';
const GATE2_SYSTEM_PROMPT = `
You are Gate2 for food search. Return ONLY JSON.

Output schema:
{"foodSignal":"NO|UNCERTAIN|YES","confidence":0..1}

Rules:
- YES: user is asking to find/order food, restaurants, cuisines, dishes, or places to eat.
- UNCERTAIN: food-ish but missing clarity (no food category and no place/near-me intent).
- NO: not about food/restaurants OR mainly profanity/insult without a food request.

Confidence calibration:
- YES clear: 0.85-0.95
- UNCERTAIN: 0.35-0.65
- NO clear: 0.85-1.0

Examples:
"pizza in tel aviv" -> {"foodSignal":"YES","confidence":0.9}
"אני רעב מה יש לך להציע" -> {"foodSignal":"UNCERTAIN","confidence":0.55}
"what is the weather?" -> {"foodSignal":"NO","confidence":0.95}
"לך תזדיין" -> {"foodSignal":"NO","confidence":1.0}
"מסעדה בתחת של אמא שלך" -> {"foodSignal":"UNCERTAIN","confidence":0.6}


`;
/*
//Return ONLY JSON.

foodSignal:
NO = not food/restaurants
UNCERTAIN = unclear
YES = food/cuisine/eating

If unsure: UNCERTAIN.

{"foodSignal":"NO|UNCERTAIN|YES","confidence":0-1}

//
*/
const GATE2_PROMPT_HASH = createHash('sha256')
  .update(GATE2_SYSTEM_PROMPT, 'utf8')
  .digest('hex');

/**
 * Create error result when LLM times out (not a genuine UNCERTAIN)
 * Returns STOP route with low confidence to signal temporary failure
 */
function createTimeoutErrorResult(): Gate2Result {
  return {
    foodSignal: 'NO', // Use NO to trigger STOP route
    language: 'other',
    route: 'STOP',
    confidence: 0.1 // Very low confidence indicates error, not genuine NO
  };
}

/**
 * Apply deterministic routing rules AFTER LLM classification
 * NO routing decisions inside LLM - pure mapping logic
 */
function applyDeterministicRouting(llmResult: z.infer<typeof Gate2LLMSchema>): Gate2Result {
  let route: 'CONTINUE' | 'ASK_CLARIFY' | 'STOP';

  if (llmResult.foodSignal === 'NO') {
    route = 'STOP';
  } else if (llmResult.foodSignal === 'UNCERTAIN') {
    route = 'ASK_CLARIFY';
  } else {
    route = 'CONTINUE';
  }

  return {
    foodSignal: llmResult.foodSignal,
    language: 'other', // Language detection optional for now
    route,
    confidence: llmResult.confidence
  };
}

/**
 * Execute GATE2 stage
 * 
 * @param request Search request
 * @param context Pipeline context
 * @returns Gate decision with region
 */
export async function executeGate2Stage(
  request: SearchRequest,
  context: Route2Context
): Promise<Gate2StageOutput> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'gate2',
    event: 'stage_started',
    query: request.query
  }, '[ROUTE2] gate2 started');

  try {
    // Call LLM for classification
    const messages: Message[] = [
      { role: 'system', content: GATE2_SYSTEM_PROMPT },
      { role: 'user', content: request.query }
    ];

    let llmResult: z.infer<typeof Gate2LLMSchema> | null = null;
    let lastError: any = null;
    let tokenUsage: { input?: number; output?: number; total?: number; model?: string } | undefined;

    // Attempt 1: Initial LLM call with 2.5s timeout
    try {
      const response = await llmProvider.completeJSON(
        messages,
        Gate2LLMSchema,
        {
          temperature: 0,
          timeout: 2500,
          promptVersion: GATE2_PROMPT_VERSION,
          promptHash: GATE2_PROMPT_HASH,
          promptLength: GATE2_SYSTEM_PROMPT.length,
          schemaHash: GATE2_SCHEMA_HASH,
          ...(traceId && { traceId }),
          ...(sessionId && { sessionId }),
          ...(requestId && { requestId }),
          stage: 'gate2'
        },
        GATE2_JSON_SCHEMA
      );
      llmResult = response.data;
      tokenUsage = {
        ...(response.usage?.prompt_tokens !== undefined && { input: response.usage.prompt_tokens }),
        ...(response.usage?.completion_tokens !== undefined && { output: response.usage.completion_tokens }),
        ...(response.usage?.total_tokens !== undefined && { total: response.usage.total_tokens }),
        ...(response.model !== undefined && { model: response.model })
      };
    } catch (err: any) {
      lastError = err;
      const errorMsg = err?.message || String(err);
      const errorType = err?.errorType || '';
      const isTimeout = errorType === 'abort_timeout' || 
                       errorMsg.toLowerCase().includes('abort') || 
                       errorMsg.toLowerCase().includes('timeout');

      if (isTimeout) {
        logger.warn({
          requestId,
          traceId,
          stage: 'gate2',
          errorType,
          attempt: 1,
          msg: '[ROUTE2] gate2 timeout, retrying once'
        });

        // Jittered backoff: 100-200ms
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));

        // Attempt 2: Retry once
        try {
          const retryResponse = await llmProvider.completeJSON(
            messages,
            Gate2LLMSchema,
            {
              temperature: 0,
              timeout: 2500,
              promptVersion: GATE2_PROMPT_VERSION,
              promptHash: GATE2_PROMPT_HASH,
              promptLength: GATE2_SYSTEM_PROMPT.length,
              schemaHash: GATE2_SCHEMA_HASH,
              ...(traceId && { traceId }),
              ...(sessionId && { sessionId }),
              ...(requestId && { requestId }),
              stage: 'gate2'
            },
            GATE2_JSON_SCHEMA
          );
          llmResult = retryResponse.data;
          tokenUsage = {
            ...(retryResponse.usage?.prompt_tokens !== undefined && { input: retryResponse.usage.prompt_tokens }),
            ...(retryResponse.usage?.completion_tokens !== undefined && { output: retryResponse.usage.completion_tokens }),
            ...(retryResponse.usage?.total_tokens !== undefined && { total: retryResponse.usage.total_tokens }),
            ...(retryResponse.model !== undefined && { model: retryResponse.model })
          };
          
          logger.info({
            requestId,
            traceId,
            stage: 'gate2',
            attempt: 2,
            msg: '[ROUTE2] gate2 retry succeeded'
          });
        } catch (retryErr) {
          // Retry failed - will use timeout error result
          lastError = retryErr;
        }
      }
    }

    // If LLM failed (even after retry), return timeout error result
    if (!llmResult) {
      const durationMs = Date.now() - startTime;
      
      logger.error({
        requestId,
        traceId,
        stage: 'gate2',
        event: 'gate2_timeout_fallback',
        durationMs,
        error: lastError?.message || String(lastError),
        msg: '[ROUTE2] gate2 LLM timeout, returning error result'
      });

      // Return error result (STOP route with low confidence)
      const gate = createTimeoutErrorResult();
      
      return { 
        gate,
        error: {
          code: 'GATE_TIMEOUT',
          message: 'Classification timed out - please retry',
          stage: 'gate2'
        }
      };
    }

    // Apply deterministic routing
    const gate = applyDeterministicRouting(llmResult);

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'gate2',
      event: 'stage_completed',
      durationMs,
      route: gate.route,
      foodSignal: gate.foodSignal,
      confidence: gate.confidence,
      ...(tokenUsage && { tokenUsage })
    }, '[ROUTE2] gate2 completed');

    return { gate };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      traceId,
      pipelineVersion: 'route2',
      stage: 'gate2',
      event: 'stage_failed',
      durationMs,
      error: errorMsg
    }, '[ROUTE2] gate2 failed');

    // Return error result for unexpected failures
    const gate = createTimeoutErrorResult();
    
    return { 
      gate,
      error: {
        code: 'GATE_ERROR',
        message: errorMsg,
        stage: 'gate2'
      }
    };
  }
}
