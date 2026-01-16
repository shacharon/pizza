/**
 * GATE2 Stage - ROUTE2 Pipeline
 * 
 * LLM-only classification with NO heuristics
 * All food/location/language detection from LLM JSON
 * Routing rules applied deterministically AFTER LLM returns
 * 
 * Target: <600ms with timeout enforcement
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2StageOutput, Gate2Result } from '../types.js';
import type { Message } from '../../../../llm/types.js';
import { resolveRegionCode } from '../utils/region-resolver.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

// Gate2 Zod Schema for LLM output (before routing logic)
const Gate2LLMSchema = z.object({
  isFoodRelated: z.boolean(),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  hasFoodAnchor: z.boolean(),
  hasLocationAnchor: z.boolean(),
  hasModifiers: z.boolean(),
  confidence: z.number().min(0).max(1)
});

// Static JSON Schema for completeJSON
const GATE2_JSON_SCHEMA = {
  type: 'object',
  properties: {
    isFoodRelated: { type: 'boolean' },
    language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] },
    hasFoodAnchor: { type: 'boolean' },
    hasLocationAnchor: { type: 'boolean' },
    hasModifiers: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['isFoodRelated', 'language', 'hasFoodAnchor', 'hasLocationAnchor', 'hasModifiers', 'confidence'],
  additionalProperties: false
} as const;

const GATE2_PROMPT_VERSION = 'gate2_v1';
const GATE2_SYSTEM_PROMPT = `You are Gate2 for food search. Return ONLY JSON. Detect: language, isFoodRelated, hasFoodAnchor, hasLocationAnchor, hasModifiers, confidence (0..1).`;

const GATE2_PROMPT_HASH = createHash('sha256')
  .update(GATE2_SYSTEM_PROMPT, 'utf8')
  .digest('hex');

/**
 * Create fallback result when LLM fails
 */
function createFallbackResult(): Gate2Result {
  return {
    isFoodRelated: true,
    language: 'other',
    hasFoodAnchor: false,
    hasLocationAnchor: false,
    hasModifiers: false,
    route: 'ASK_CLARIFY',
    confidence: 0.1
  };
}

/**
 * Apply deterministic routing rules AFTER LLM classification
 * NO heuristics - pure logic based on LLM flags
 */
function applyDeterministicRouting(llmResult: z.infer<typeof Gate2LLMSchema>): Gate2Result {
  let route: 'BYPASS' | 'ASK_CLARIFY' | 'CONTINUE';

  // Rule 1: Not food-related => BYPASS
  if (!llmResult.isFoodRelated) {
    route = 'BYPASS';
  }
  // Rule 2: Food but missing both anchors => ASK_CLARIFY
  else if (!llmResult.hasFoodAnchor && !llmResult.hasLocationAnchor) {
    route = 'ASK_CLARIFY';
  }
  // Rule 3: Has at least one anchor => CONTINUE
  else {
    route = 'CONTINUE';
  }

  return {
    ...llmResult,
    route
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
    // Resolve region (independent of LLM)
    const { regionCode, source: regionSource } = await resolveRegionCode(context);

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
        timeout: 600, // 600ms max
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
      confidence: gate.confidence,
      language: gate.language,
      hasFoodAnchor: gate.hasFoodAnchor,
      hasLocationAnchor: gate.hasLocationAnchor,
      hasModifiers: gate.hasModifiers,
      regionCode,
      regionSource
    }, '[ROUTE2] gate2 completed');

    return { gate, regionCode, regionSource };

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

    // Fallback with region resolution
    const { regionCode, source: regionSource } = await resolveRegionCode(context);
    const gate = createFallbackResult();

    return { gate, regionCode, regionSource };
  }
}
