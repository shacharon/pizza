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
import { startStage, endStage } from '../../../../lib/telemetry/stage-timer.js';
import { sanitizeQuery } from '../../../../lib/telemetry/query-sanitizer.js';
import { resolveLLM } from '../../../../lib/llm/index.js';

// Gate2 Zod Schema for LLM output (before routing logic) - SOURCE OF TRUTH
const Gate2LLMSchema = z.object({
  foodSignal: z.enum(['NO', 'UNCERTAIN', 'YES']),
  confidence: z.number().min(0).max(1),
  assistantLanguage: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  assistantLanguageConfidence: z.number().min(0).max(1),
  stop: z.object({
    type: z.enum(['GATE_FAIL', 'CLARIFY']),
    reason: z.enum(['NO_FOOD', 'UNCERTAIN_DOMAIN', 'MISSING_LOCATION']),
    blocksSearch: z.literal(true),
    suggestedAction: z.enum(['ASK_FOOD', 'ASK_DOMAIN', 'ASK_LOCATION']),
    message: z.string(),
    question: z.string()
  }).nullable()
}).strict();

// Static JSON Schema for OpenAI (zod-to-json-schema library is broken with Zod v4)
const GATE2_JSON_SCHEMA = {
  type: 'object',
  properties: {
    foodSignal: {
      type: 'string',
      enum: ['NO', 'UNCERTAIN', 'YES']
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    assistantLanguage: {
      type: 'string',
      enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']
    },
    assistantLanguageConfidence: {
      type: 'number',
      minimum: 0,
      maximum: 1
    },
    stop: {
      type: ['object', 'null'],
      properties: {
        type: {
          type: 'string',
          enum: ['GATE_FAIL', 'CLARIFY']
        },
        reason: {
          type: 'string',
          enum: ['NO_FOOD', 'UNCERTAIN_DOMAIN', 'MISSING_LOCATION']
        },
        blocksSearch: {
          type: 'boolean',
          const: true
        },
        suggestedAction: {
          type: 'string',
          enum: ['ASK_FOOD', 'ASK_DOMAIN', 'ASK_LOCATION']
        },
        message: {
          type: 'string'
        },
        question: {
          type: 'string'
        }
      },
      required: ['type', 'reason', 'blocksSearch', 'suggestedAction', 'message', 'question'],
      additionalProperties: false
    }
  },
  required: ['foodSignal', 'confidence', 'assistantLanguage', 'assistantLanguageConfidence', 'stop'],
  additionalProperties: false
} as const;

const GATE2_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(GATE2_JSON_SCHEMA))
  .digest('hex')
  .substring(0, 12);

const GATE2_PROMPT_VERSION = 'gate2_v8';
const GATE2_SYSTEM_PROMPT = `SYSTEM: You are Gate2 for FOOD SEARCH. Return ONLY strict JSON.

INPUT:
- userQuery (string)

OUTPUT (JSON only, no extra fields):
{
  "foodSignal":"YES"|"NO"|"UNCERTAIN",
  "confidence":0..1,
  "assistantLanguage":"he"|"en"|"ru"|"ar"|"fr"|"es"|"other",
  "assistantLanguageConfidence":0..1,
  "stop": {
    "type":"GATE_FAIL"|"CLARIFY",
    "reason":"NO_FOOD"|"UNCERTAIN_DOMAIN",
    "blocksSearch":true,
    "suggestedAction":"ASK_DOMAIN"|"ASK_FOOD",
    "message": string,
    "question": string
  } | null
}

RULES:
- Detect assistantLanguage from script/words in userQuery only (no region guesses).
- foodSignal YES if user wants food/restaurant/cuisine/eat/order/delivery/hungry OR contains "restaurant/מסעדות/مطعم" etc.
- UNCERTAIN if generic place intent with no food signal.
- NO if clearly non-food (weather/news/services) or gibberish/profanity-only.
- If foodSignal="YES" => stop=null.
- If foodSignal!="YES" => stop object:
  - NO => type="GATE_FAIL", reason="NO_FOOD", suggestedAction="ASK_DOMAIN"
  - UNCERTAIN => type="CLARIFY", reason="UNCERTAIN_DOMAIN", suggestedAction="ASK_FOOD"
- message: ≤2 sentences, in assistantLanguage.
- question: exactly 1 question, in assistantLanguage.
- NEVER output English text unless assistantLanguage="en".

LANG DETECT:
- Hebrew chars => he
- Arabic chars => ar
- Cyrillic => ru
- Latin => choose en/fr/es if obvious; else other
- Confidence: clear script multi-word 0.9+, short but clear 0.7-0.9, mixed 0.4-0.7.

EXAMPLES:
"מסעדות מסביבי" => {"foodSignal":"YES","confidence":0.95,"assistantLanguage":"he","assistantLanguageConfidence":0.95,"stop":null}
"ماذا هناك" => {"foodSignal":"UNCERTAIN","confidence":0.5,"assistantLanguage":"ar","assistantLanguageConfidence":0.85,"stop":{"type":"CLARIFY","reason":"UNCERTAIN_DOMAIN","blocksSearch":true,"suggestedAction":"ASK_FOOD","message":"لست متأكداً مما تبحث عنه.","question":"ما نوع الطعام الذي تريده؟"}}
"weather" => {"foodSignal":"NO","confidence":0.95,"assistantLanguage":"en","assistantLanguageConfidence":0.9,"stop":{"type":"GATE_FAIL","reason":"NO_FOOD","blocksSearch":true,"suggestedAction":"ASK_DOMAIN","message":"This doesn't look like a food search.","question":"Are you looking for restaurants or something else?"}}
`;

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
    languageConfidence: 0.1,
    route: 'STOP',
    confidence: 0.1, // Very low confidence indicates error, not genuine NO
    stop: null // No stop payload on timeout - handled by orchestrator
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
    language: llmResult.assistantLanguage,
    languageConfidence: llmResult.assistantLanguageConfidence,
    route,
    confidence: llmResult.confidence,
    stop: llmResult.stop // Pass through stop payload from LLM (null if not stopping)
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
  const { queryLen, queryHash } = sanitizeQuery(request.query);

  const startTime = startStage(context, 'gate2', {
    queryLen,
    queryHash
  });

  try {
    // Call LLM for classification
    const messages: Message[] = [
      { role: 'system', content: GATE2_SYSTEM_PROMPT },
      { role: 'user', content: request.query }
    ];

    let llmResult: z.infer<typeof Gate2LLMSchema> | null = null;
    let lastError: any = null;
    let tokenUsage: { input?: number; output?: number; total?: number; model?: string } | undefined;

    // Resolve model and timeout for gate purpose
    const { model, timeoutMs } = resolveLLM('gate');

    // Attempt 1: Initial LLM call with purpose-based timeout
    try {
      const response = await llmProvider.completeJSON(
        messages,
        Gate2LLMSchema,
        {
          model,
          temperature: 0,
          timeout: timeoutMs,
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

        // Jittered backoff: 50-150ms (reduced to minimize immediate repeat aborts)
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 100));

        // Attempt 2: Retry once
        try {
          const retryResponse = await llmProvider.completeJSON(
            messages,
            Gate2LLMSchema,
            {
              model,
              temperature: 0,
              timeout: timeoutMs,
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

    endStage(context, 'gate2', startTime, {
      route: gate.route,
      foodSignal: gate.foodSignal,
      confidence: gate.confidence,
      ...(tokenUsage && { tokenUsage })
    });

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
