/**
 * INTENT2 Stage - ROUTE2 Pipeline
 * 
 * LLM-based intent extraction with mode classification
 * Extracts food and location intent, determines search mode (nearby/landmark/textsearch)
 * 
 * Target: <2000ms with timeout enforcement
 */

import { z } from 'zod';
import { createHash } from 'crypto';
import type { SearchRequest } from '../../types/search-request.dto.js';
import type { Route2Context, Gate2Result, Intent2Result } from '../types.js';
import type { Message } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

// Intent2 Zod Schema for LLM output
const Intent2LLMSchema = z.object({
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  mode: z.enum(['nearby', 'landmark', 'textsearch']),
  reason: z.enum(['near_me_phrase', 'explicit_distance_from_me', 'landmark_detected', 'default_textsearch', 'ambiguous']),
  food: z.object({
    raw: z.string().nullable(),
    canonicalEn: z.string().nullable()
  }),
  location: z.object({
    isRelative: z.boolean(),
    text: z.string().nullable(),
    landmarkText: z.string().nullable(),
    landmarkType: z.enum(['address', 'poi', 'street', 'neighborhood', 'area', 'unknown']).nullable()
  }),
  radiusMeters: z.number().nullable(),
  radiusSource: z.enum(['explicit', 'default']).nullable(),
  queryRegionCode: z.enum(['IL', 'OTHER']).nullable(),
  confidence: z.number().min(0).max(1)
});

// Static JSON Schema for completeJSON
const INTENT2_JSON_SCHEMA = {
  type: 'object',
  properties: {
    language: { type: 'string', enum: ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'] },
    mode: { type: 'string', enum: ['nearby', 'landmark', 'textsearch'] },
    reason: { type: 'string', enum: ['near_me_phrase', 'explicit_distance_from_me', 'landmark_detected', 'default_textsearch', 'ambiguous'] },
    food: {
      type: 'object',
      properties: {
        raw: { type: ['string', 'null'] },
        canonicalEn: { type: ['string', 'null'] }
      },
      required: ['raw', 'canonicalEn'],
      additionalProperties: false
    },
    location: {
      type: 'object',
      properties: {
        isRelative: { type: 'boolean' },
        text: { type: ['string', 'null'] },
        landmarkText: { type: ['string', 'null'] },
        landmarkType: { type: ['string', 'null'], enum: ['address', 'poi', 'street', 'neighborhood', 'area', 'unknown', null] }
      },
      required: ['isRelative', 'text', 'landmarkText', 'landmarkType'],
      additionalProperties: false
    },
    radiusMeters: { type: ['number', 'null'] },
    radiusSource: { type: ['string', 'null'], enum: ['explicit', 'default', null] },
    queryRegionCode: { type: ['string', 'null'], enum: ['IL', 'OTHER', null] },
    confidence: { type: 'number', minimum: 0, maximum: 1 }
  },
  required: ['language', 'mode', 'reason', 'food', 'location', 'radiusMeters', 'radiusSource', 'queryRegionCode', 'confidence'],
  additionalProperties: false
} as const;

const INTENT2_PROMPT_VERSION = 'intent2_v2';
const INTENT2_SYSTEM_PROMPT = `You are Intent2 for food search. Return ONLY JSON (no markdown).
Pick exactly one mode:
1) "nearby" ONLY if the user explicitly asks relative to themselves (near me / closest / around here / "לידי" / "בסביבה שלי" / "ממני X") OR gives an explicit distance/time-from-me. Device coords alone do NOT imply nearby.
2) "landmark" if the query contains a specific place to resolve (address/street/POI/landmark/neighborhood/area) such that it should be converted to a point before searching. Do NOT invent coordinates.
3) "textsearch" otherwise (city/region/general location like "גדרה", "תל אביב", etc.).
Distance handling: if user specifies a distance/time, set radiusMeters and radiusSource="explicit", else set radiusSource="default" and radiusMeters=null.

Output fields:
- language: he|en|ru|ar|fr|es|other
- mode: nearby|landmark|textsearch
- reason: near_me_phrase|explicit_distance_from_me|landmark_detected|default_textsearch|ambiguous
- food: { raw: string|null, canonicalEn: string|null }
- location:
  { isRelative: boolean,
    text: string|null,
    landmarkText: string|null,
    landmarkType: address|poi|street|neighborhood|area|unknown|null }
- radiusMeters: number|null
- radiusSource: explicit|default|null
- queryRegionCode: "IL"|"OTHER"|null - Use "OTHER" ONLY when explicit location clearly outside Israel (e.g., Paris, Champs-Élysées). Do NOT infer from language. Use null when no explicit location.
- confidence: number (0..1)`;

const INTENT2_PROMPT_HASH = createHash('sha256')
  .update(INTENT2_SYSTEM_PROMPT, 'utf8')
  .digest('hex');

/**
 * Create fallback result when LLM fails
 */
function createFallbackResult(gate: Gate2Result): Intent2Result {
  return {
    language: gate.language,
    mode: 'textsearch',
    reason: 'ambiguous',
    food: {
      raw: null,
      canonicalEn: null
    },
    location: {
      isRelative: false,
      text: null,
      landmarkText: null,
      landmarkType: null
    },
    radiusMeters: null,
    radiusSource: null,
    queryRegionCode: null,
    confidence: 0.1
  };
}

/**
 * Execute INTENT2 stage
 * 
 * @param gate Gate result
 * @param request Search request
 * @param ctx Pipeline context
 * @returns Intent extraction result
 */
export async function executeIntent2Stage(
  gate: Gate2Result,
  request: SearchRequest,
  ctx: Route2Context
): Promise<Intent2Result> {
  const { requestId, traceId, sessionId, llmProvider } = ctx;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'intent2',
    event: 'stage_started',
    query: request.query
  }, '[ROUTE2] intent2 started');

  try {
    // Call LLM for intent extraction
    const messages: Message[] = [
      { role: 'system', content: INTENT2_SYSTEM_PROMPT },
      { role: 'user', content: request.query }
    ];

    const llmResult = await llmProvider.completeJSON(
      messages,
      Intent2LLMSchema,
      {
        temperature: 0,
        timeout: 2000,
        promptVersion: INTENT2_PROMPT_VERSION,
        promptHash: INTENT2_PROMPT_HASH,
        promptLength: INTENT2_SYSTEM_PROMPT.length,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        ...(requestId && { requestId }),
        stage: 'intent2'
      },
      INTENT2_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent2',
      event: 'stage_completed',
      durationMs,
      mode: llmResult.mode,
      reason: llmResult.reason,
      hasFood: !!llmResult.food.raw,
      hasLocation: !!llmResult.location.text,
      radiusMeters: llmResult.radiusMeters,
      radiusSource: llmResult.radiusSource,
      queryRegionCode: llmResult.queryRegionCode,
      confidence: llmResult.confidence
    }, '[ROUTE2] intent2 completed');

    return llmResult;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';
    const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('abort');

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'intent2',
      event: 'stage_failed',
      durationMs,
      error: errorMsg,
      isTimeout
    }, '[ROUTE2] intent2 failed');

    // Fallback
    const fallback = createFallbackResult(gate);
    return fallback;
  }
}
