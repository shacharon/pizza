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
import { logger } from '../../../../lib/logger/structured-logger.js';

// Gate2 Zod Schema for LLM output (before routing logic)
const Gate2LLMSchema = z.object({
  foodSignal: z.enum(['NO', 'UNCERTAIN', 'YES']),
  confidence: z.number().min(0).max(1)
});

// Static JSON Schema for completeJSON
const GATE2_JSON_SCHEMA = {
  type: 'object',
  properties: {
    foodSignal: { type: 'string', enum: ['NO', 'UNCERTAIN', 'YES'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['foodSignal', 'confidence'],
  additionalProperties: false
} as const;

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
 * Create fallback result when LLM fails
 * Conservative fallback: treat as UNCERTAIN to ask for clarification
 */
function createFallbackResult(): Gate2Result {
  return {
    foodSignal: 'UNCERTAIN',
    language: 'other',
    route: 'ASK_CLARIFY',
    confidence: 0.3
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

    const llmResult = await llmProvider.completeJSON(
      messages,
      Gate2LLMSchema,
      {
        temperature: 0,
        timeout: 1500,
        promptVersion: GATE2_PROMPT_VERSION,
        promptHash: GATE2_PROMPT_HASH,
        promptLength: GATE2_SYSTEM_PROMPT.length,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        ...(requestId && { requestId }),
        stage: 'gate2'
      },
      GATE2_JSON_SCHEMA
    );

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
      confidence: gate.confidence
    }, '[ROUTE2] gate2 completed');

    return { gate };

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';
    const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('abort');

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'gate2',
      event: 'stage_failed',
      durationMs,
      error: errorMsg,
      isTimeout
    }, '[ROUTE2] gate2 failed');

    // Fallback
    const gate = createFallbackResult();

    return { gate };
  }
}
