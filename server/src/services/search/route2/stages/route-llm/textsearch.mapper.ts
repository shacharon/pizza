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

const TEXTSEARCH_MAPPER_PROMPT = `You are a query rewriter for Google Places Text Search API.

Output ONLY JSON with ALL fields:
{
  "providerMethod": "textSearch",
  "textQuery": "cleaned query for Google",
  "region": "IL|FR|US etc",
  "language": "he|en|ru|ar|fr|es|other",
  "bias": null or {"type":"locationBias","center":{"lat":32,"lng":34},"radiusMeters":1000-5000},
  "reason": "short_token"
}

Rules for textQuery:
- Clean and specific for Google (e.g., "pizza restaurant tel aviv")
- Remove filler words, keep location and food type
- Do NOT translate (keep original language)
- Examples:
  * "פיצה בתל אביב" → "פיצה מסעדה תל אביב"
  * "sushi in haifa" → "sushi restaurant haifa"

Rules for bias:
- Use bias ONLY if user location is provided AND it helps narrow search
- radiusMeters: 1000-5000 based on query specificity
  * City-level query (e.g., "tel aviv") → larger radius (3000-5000)
  * Neighborhood query → smaller radius (1000-2000)
- If query already has explicit location, bias may not be needed

Rules for reason:
- One-word token explaining the decision
- Examples: "city_explicit", "location_bias_added", "query_cleaned"
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
  const { requestId, traceId, sessionId, llmProvider, userLocation } = context;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'textsearch_mapper',
    event: 'stage_started',
    region: intent.region,
    language: intent.language,
    hasUserLocation: !!userLocation
  }, '[ROUTE2] textsearch_mapper started');

  try {
    // Build context-aware prompt
    const userPrompt = buildUserPrompt(request.query, intent, userLocation);

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
  intent: IntentResult,
  userLocation?: { lat: number; lng: number }
): string {
  const parts = [
    `Query: "${query}"`,
    `Region: ${intent.region}`,
    `Language: ${intent.language}`
  ];

  if (userLocation) {
    parts.push(`User location: lat=${userLocation.lat}, lng=${userLocation.lng}`);
  }

  return parts.join('\n');
}
