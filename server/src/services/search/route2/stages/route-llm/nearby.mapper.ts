/**
 * Nearby Mapper - ROUTE2 Pipeline
 * 
 * LLM-based mapper for NEARBY route
 * Converts "near me" queries into Google Places Nearby Search parameters
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { NearbyMappingSchema, type NearbyMapping } from './schemas.js';

const NEARBY_MAPPER_VERSION = 'nearby_mapper_v1';

const NEARBY_MAPPER_PROMPT = `You are a proximity search parameter generator.

Output ONLY JSON with ALL fields:
{
  "providerMethod": "nearbySearch",
  "location": {"lat": number, "lng": number},
  "radiusMeters": number,
  "keyword": "food keyword",
  "region": "IL|FR|US etc",
  "language": "he|en|ru|ar|fr|es|other",
  "reason": "short_token"
}

Rules for radiusMeters:
- If query contains explicit distance (e.g., "200 מטר", "300m", "100 meters", "500m"):
  → Use that EXACT numeric value (e.g., 200, 300, 100, 500)
- If NO explicit distance in query:
  → Use default 500

Rules for keyword:
- Short food term (1-3 words max)
- Examples: "pizza", "hummus", "sushi restaurant", "cafe"
- Extract from query, keep in original language
- Do NOT include location words

Rules for location:
- Use EXACTLY the coordinates provided in input
- Do NOT invent or modify coordinates

Rules for reason:
- One-word token: "distance_explicit" (if distance in query), "distance_default" (if no distance)
`;

const NEARBY_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(NEARBY_MAPPER_PROMPT, 'utf8')
  .digest('hex');

const { schema: NEARBY_JSON_SCHEMA, schemaHash: NEARBY_SCHEMA_HASH } = buildLLMJsonSchema(
  NearbyMappingSchema,
  'NearbyMapping'
);

/**
 * Execute Nearby Mapper
 * 
 * REQUIRES: context.userLocation must be present
 * FAILS FAST: if userLocation is missing
 */
export async function executeNearbyMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context
): Promise<NearbyMapping> {
  const { requestId, traceId, sessionId, llmProvider, userLocation } = context;
  const startTime = Date.now();

  // FAIL FAST: Nearby requires user location
  if (!userLocation) {
    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'nearby_mapper',
      event: 'stage_failed',
      error: 'missing_user_location',
      route: 'NEARBY'
    }, '[ROUTE2] nearby_mapper failed: userLocation required for NEARBY route');

    throw new Error('NEARBY route requires userLocation in context');
  }

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'nearby_mapper',
    event: 'stage_started',
    region: intent.region,
    language: intent.language,
    hasUserLocation: true
  }, '[ROUTE2] nearby_mapper started');

  try {
    // Build context-aware prompt
    const userPrompt = buildUserPrompt(request.query, intent, userLocation);

    const messages: Message[] = [
      { role: 'system', content: NEARBY_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    const mapping = await llmProvider.completeJSON(
      messages,
      NearbyMappingSchema,
      {
        temperature: 0,
        timeout: 3000,
        promptVersion: NEARBY_MAPPER_VERSION,
        promptHash: NEARBY_MAPPER_PROMPT_HASH,
        promptLength: NEARBY_MAPPER_PROMPT.length,
        schemaHash: NEARBY_SCHEMA_HASH,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        ...(requestId && { requestId }),
        stage: 'nearby_mapper'
      },
      NEARBY_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'nearby_mapper',
      event: 'stage_completed',
      durationMs,
      keyword: mapping.keyword,
      radiusMeters: mapping.radiusMeters,
      region: mapping.region,
      language: mapping.language,
      reason: mapping.reason
    }, '[ROUTE2] nearby_mapper completed');

    return mapping;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'nearby_mapper',
      event: 'stage_failed',
      durationMs,
      error: errorMsg
    }, '[ROUTE2] nearby_mapper failed');

    throw error;
  }
}

/**
 * Build user prompt with context
 */
function buildUserPrompt(
  query: string,
  intent: IntentResult,
  userLocation: { lat: number; lng: number }
): string {
  return `Query: "${query}"
User location: lat=${userLocation.lat}, lng=${userLocation.lng}
Region: ${intent.region}
Language: ${intent.language}`;
}
