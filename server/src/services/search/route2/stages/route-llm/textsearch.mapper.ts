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
Preserve the user's intent for Google Places Text Search, maximizing relevance. Do NOT drop place-type intent.

Rules for textQuery:
1) Keep original language. Do NOT translate.
2) Remove filler only (e.g., "תמצא לי", "בבקשה", "הכי טוב", "קרוב", "בא לי").
3) ALWAYS preserve a PLACE-TYPE token if implied or explicit:
   - If the query contains or implies a venue search (restaurant/cafe/bar/food place), ensure textQuery includes a place-type word:
     - Hebrew: include "מסעדה" (or "בית קפה"/"בר" if explicitly requested)
     - English: include "restaurant" (or "cafe"/"bar" if explicitly requested)
4) Preserve dietary/service modifiers (e.g., "חלבית", "בשרית", "כשר", "טבעוני", "ללא גלוטן", "משלוח") but NEVER let them replace the place-type.
   - Bad: "חלבית אשקלון"
   - Good: "מסעדה חלבית אשקלון"
5) Preserve the location (city/neighborhood/landmark) exactly as given.
6) If the query is a specific FOOD ITEM/category (pizza/sushi/shawarma/etc) and no place-type was requested explicitly, do NOT force-add "מסעדה".
   - Keep it as food + location.
7) Keep textQuery short: [food/place-type + modifiers + location], no extra words.

Bias rules:
- ALWAYS output bias as null. (bias is handled outside this mapper)

Reason rules (one token):
- "place_type_preserved" if you kept/added a place-type token
- "modifier_kept" if you kept dietary/service modifiers
- "query_cleaned" if you mainly removed filler
- "food_only" if it is food-item search without place-type

Examples (must follow exactly):
- "פיצה בגדרה" -> {"providerMethod":"textSearch","textQuery":"פיצה גדרה","region":"IL","language":"he","bias":null,"reason":"food_only"}
- "מסעדה בשרית באשקלון" -> {"providerMethod":"textSearch","textQuery":"מסעדה בשרית אשקלון","region":"IL","language":"he","bias":null,"reason":"place_type_preserved"}
- "מסעדה חלבית באשקלון" -> {"providerMethod":"textSearch","textQuery":"מסעדה חלבית אשקלון","region":"IL","language":"he","bias":null,"reason":"place_type_preserved"}
- "מסעדה כשרה בגדרה" -> {"providerMethod":"textSearch","textQuery":"מסעדה כשרה גדרה","region":"IL","language":"he","bias":null,"reason":"place_type_preserved"}
- "sushi in haifa" -> {"providerMethod":"textSearch","textQuery":"sushi haifa","region":"IL","language":"en","bias":null,"reason":"food_only"}
- "kosher restaurant in haifa" -> {"providerMethod":"textSearch","textQuery":"kosher restaurant haifa","region":"IL","language":"en","bias":null,"reason":"place_type_preserved"}

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

    const mapping = await llmProvider.completeJSON(
      messages,
      TextSearchMappingSchema,
      {
        temperature: 0,
        timeout: 3000,
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

    // DEV-ONLY: dump mapper inputs/outputs for debugging
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
        },
        // what the LLM returned
        mapping,
      }, '[ROUTE2] textsearch_mapper debug_dump');
    }
    if (mapping.bias !== null) {
      logger.warn({
        requestId,
        pipelineVersion: 'route2',
        stage: 'textsearch_mapper',
        event: 'bias_forced_null',
        receivedBias: mapping.bias,
      }, '[ROUTE2] textsearch_mapper bias_forced_null');

      mapping.bias = null as any;
    }

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'textsearch_mapper',
      event: 'stage_completed',
      durationMs,
      textQuery: mapping.textQuery,
      hasBias: mapping.bias !== null,
      region: mapping.region,
      language: mapping.language,
      reason: mapping.reason
    }, '[ROUTE2] textsearch_mapper completed');

    return mapping;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'textsearch_mapper',
      event: 'stage_failed',
      durationMs,
      error: errorMsg
    }, '[ROUTE2] textsearch_mapper failed');

    throw error;
  }
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
