/**
 * TextSearch Mapper - ROUTE2 Pipeline
 * 
 * LLM-based mapper for TEXTSEARCH route
 * Converts raw query into Google Places Text Search parameters
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { TextSearchMappingSchema, type TextSearchMapping } from './schemas.js';

const TEXTSEARCH_MAPPER_VERSION = 'textsearch_mapper_v1';

const TEXTSEARCH_MAPPER_PROMPT = `
You are a query rewriter for Google Places Text Search API.

Output ONLY JSON with ALL fields:
{
  "providerMethod": "textSearch",
  "textQuery": "string",
  "region": "IL|FR|US|etc",
  "language": "he|en|ru|ar|fr|es|other",
  "bias": null,
  "reason": "token"
}

Core goal:
Preserve the user's original query as much as possible for Google Places Text Search. Only remove obvious filler words.

Rules for textQuery:
1) **PRESERVE the original query structure**: Keep prepositions (ב/in/at), conjunctions, and location phrases intact.
2) Keep original language. Do NOT translate.
3) Remove ONLY filler/politeness words (e.g., "תמצא לי", "בבקשה", "הכי טוב", "אני רוצה", "please find").
4) **DO NOT remove prepositions**: Keep "ב" (in/at), "של" (of), "עם" (with), etc.
5) If place-type is missing AND clearly implied (e.g., "חלבית באשקלון" = dairy in Ashdod), you MAY add "מסעדה" prefix.
6) Otherwise, return the query almost unchanged (minus filler only).

Bias rules:
- ALWAYS output bias as null. (bias is handled outside this mapper)

Reason rules (one token):
- "original_preserved" if you kept query mostly unchanged
- "place_type_added" if you added missing place-type
- "filler_removed" if you removed filler words

Examples (must follow exactly):
- "מסעדות איטלקיות בגדרה" -> {"providerMethod":"textSearch","textQuery":"מסעדות איטלקיות בגדרה","region":"IL","language":"he","bias":null,"reason":"original_preserved"}
- "פיצה בגדרה" -> {"providerMethod":"textSearch","textQuery":"פיצה בגדרה","region":"IL","language":"he","bias":null,"reason":"original_preserved"}
- "מסעדה בשרית באשקלון" -> {"providerMethod":"textSearch","textQuery":"מסעדה בשרית באשקלון","region":"IL","language":"he","bias":null,"reason":"original_preserved"}
- "חלבית באשקלון" -> {"providerMethod":"textSearch","textQuery":"מסעדה חלבית באשקלון","region":"IL","language":"he","bias":null,"reason":"place_type_added"}
- "תמצא לי מסעדה כשרה בגדרה" -> {"providerMethod":"textSearch","textQuery":"מסעדה כשרה בגדרה","region":"IL","language":"he","bias":null,"reason":"filler_removed"}
- "sushi in haifa" -> {"providerMethod":"textSearch","textQuery":"sushi in haifa","region":"IL","language":"en","bias":null,"reason":"original_preserved"}
- "kosher restaurant in haifa" -> {"providerMethod":"textSearch","textQuery":"kosher restaurant in haifa","region":"IL","language":"en","bias":null,"reason":"original_preserved"}

Return ONLY the JSON object.

`;

const TEXTSEARCH_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(TEXTSEARCH_MAPPER_PROMPT, 'utf8')
  .digest('hex');

const { schema: TEXTSEARCH_JSON_SCHEMA, schemaHash: TEXTSEARCH_SCHEMA_HASH } = buildLLMJsonSchema(
  TextSearchMappingSchema,
  'TextSearchMapping'
);

/**
 * Execute TextSearch Mapper
 */
export async function executeTextSearchMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context
): Promise<TextSearchMapping> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'textsearch_mapper',
    event: 'stage_started',
    region: intent.region,
    language: intent.language
  }, '[ROUTE2] textsearch_mapper started');

  try {
    // Build context-aware prompt
    const userPrompt = buildUserPrompt(request.query, intent);

    const messages: Message[] = [
      { role: 'system', content: TEXTSEARCH_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const response = await llmProvider.completeJSON(
      messages,
      TextSearchMappingSchema,
      {
        temperature: 0,
        timeout: 3500,
        promptVersion: TEXTSEARCH_MAPPER_VERSION,
        promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,
        promptLength: TEXTSEARCH_MAPPER_PROMPT.length,
        schemaHash: TEXTSEARCH_SCHEMA_HASH,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        ...(requestId && { requestId }),
        stage: 'textsearch_mapper'
      },
      TEXTSEARCH_JSON_SCHEMA
    );

    const mapping = response.data;
    const tokenUsage = {
      ...(response.usage?.prompt_tokens !== undefined && { input: response.usage.prompt_tokens }),
      ...(response.usage?.completion_tokens !== undefined && { output: response.usage.completion_tokens }),
      ...(response.usage?.total_tokens !== undefined && { total: response.usage.total_tokens }),
      ...(response.model !== undefined && { model: response.model })
    };

    // Apply location bias logic (TEXTSEARCH always returns null)
    const biasResult = applyLocationBias(mapping, intent, request, requestId);
    mapping.bias = biasResult.bias;

    // DEV-ONLY: dump mapper inputs/outputs for debugging (after bias decision)
    if (process.env.NODE_ENV !== 'production') {
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        stage: 'textsearch_mapper',
        event: 'debug_dump',
        // what the LLM saw
        originalQuery: request.query,
        userPrompt,
        intent: {
          region: intent.region,
          language: intent.language,
          route: intent.route,
          confidence: intent.confidence,
          reason: intent.reason,
        },
        // final mapping (after bias decision)
        mapping,
      }, '[ROUTE2] textsearch_mapper debug_dump');
    }

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'textsearch_mapper',
      event: 'stage_completed',
      durationMs,
      textQuery: mapping.textQuery,
      hasBias: mapping.bias !== null && mapping.bias !== undefined,
      biasSource: biasResult.source,
      biasNullReason: biasResult.nullReason || null,
      region: mapping.region,
      language: mapping.language,
      reason: mapping.reason,
      tokenUsage
    }, '[ROUTE2] textsearch_mapper completed');

    return mapping;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';
    const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('abort');

    logger.warn({
      requestId,
      pipelineVersion: 'route2',
      stage: 'textsearch_mapper',
      event: 'mapper_llm_failed',
      durationMs,
      error: errorMsg,
      isTimeout,
      fallbackStrategy: 'deterministic_mapping'
    }, '[ROUTE2] textsearch_mapper LLM failed, building deterministic fallback');

    // Build deterministic fallback mapping
    const fallbackMapping = buildDeterministicMapping(intent, request, requestId);
    
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'textsearch_mapper',
      event: 'stage_completed',
      durationMs,
      textQuery: fallbackMapping.textQuery,
      hasBias: fallbackMapping.bias !== null,
      biasSource: 'deterministic_fallback',
      region: fallbackMapping.region,
      language: fallbackMapping.language,
      reason: fallbackMapping.reason,
      fallback: true
    }, '[ROUTE2] textsearch_mapper completed with deterministic fallback');

    return fallbackMapping;
  }
}

/**
 * Build deterministic mapping when LLM fails/times out
 */
function buildDeterministicMapping(
  intent: IntentResult,
  request: SearchRequest,
  requestId?: string
): TextSearchMapping {
  // Clean query: remove status words and trim
  const statusWords = ['פתוחות', 'פתוח', 'סגורות', 'סגור', 'open', 'closed'];
  let cleanedQuery = request.query;
  for (const word of statusWords) {
    cleanedQuery = cleanedQuery.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  cleanedQuery = cleanedQuery.trim().replace(/\s+/g, ' ');

  // TEXTSEARCH: No automatic bias (textQuery contains location)
  const mapping: TextSearchMapping = {
    providerMethod: 'textSearch',
    textQuery: cleanedQuery,
    region: intent.region,
    language: intent.language,
    bias: null, // No automatic bias for TEXTSEARCH
    reason: 'deterministic_fallback'
  };

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'textsearch_mapper',
    event: 'deterministic_mapping_built',
    originalQuery: request.query,
    cleanedQuery,
    intentReason: intent.reason,
    hasBias: false
  }, '[ROUTE2] Built deterministic mapping (no bias)');

  return mapping;
}

/**
 * Build user prompt with context
 */
function buildUserPrompt(
  query: string,
  intent: IntentResult
): string {
  return `Query: "${query}"
Region: ${intent.region}
Language: ${intent.language}`;
}

/**
 * Apply location bias logic to text search mapping
 * 
 * TEXTSEARCH Rules (simplified):
 * - Default: NO location bias (textQuery includes location, Google handles it)
 * - If query contains explicit city/landmark → bias = null
 * - Never apply automatic small-radius bias (≤1km)
 * 
 * @returns Object with bias, source, and nullReason
 */
function applyLocationBias(
  mapping: TextSearchMapping,
  intent: IntentResult,
  request: SearchRequest,
  requestId?: string
): {
  bias: TextSearchMapping['bias'];
  source: 'user_location' | 'city_geocode' | 'llm_provided' | null;
  nullReason?: string;
} {
  // TEXTSEARCH default: NO bias
  // The textQuery already includes the location (e.g., "pizza gedera"), let Google handle it
  
  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'textsearch_mapper',
    event: 'bias_textsearch_no_bias',
    textQuery: mapping.textQuery,
    intentReason: intent.reason,
    explanation: 'TEXTSEARCH relies on textQuery location, no automatic bias applied'
  }, '[ROUTE2] TEXTSEARCH: No bias applied');

  return {
    bias: null,
    source: null,
    nullReason: 'textsearch_no_automatic_bias'
  };
}
