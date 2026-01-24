/**
 * Landmark Mapper - ROUTE2 Pipeline
 * 
 * LLM-based mapper for LANDMARK route
 * Plans two-phase search: geocode landmark first, then search nearby
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { LandmarkMappingSchema, type LandmarkMapping } from './schemas.js';

const LANDMARK_MAPPER_VERSION = 'landmark_mapper_v3';

const LANDMARK_MAPPER_PROMPT = `You are a landmark geocoding planner.

Output ONLY JSON with ALL fields:
{
  "providerMethod": "landmarkPlan",
  "geocodeQuery": "specific landmark name",
  "afterGeocode": "nearbySearch" or "textSearchWithBias",
  "radiusMeters": 500-2000,
  "keyword": "food keyword",
  "region": "IL|FR|US etc",
  "language": "he|en|ru|ar|fr|es|other",
  "reason": "short_token"
}

Rules for geocodeQuery:
- Full, specific landmark name for geocoding (NOT the food/cuisine)
- If query has "X meters from <landmark>", extract ONLY the landmark name
- Include city if ambiguous (e.g., "Azrieli Center Tel Aviv", not just "Azrieli")
- Examples:
  * "פיצה ליד דיזנגוף סנטר" → "Dizengoff Center Tel Aviv"
  * "מרינה הרצליה חומוס" → "Marina Herzliya Israel"
- Keep in original language or translate to English for foreign landmarks

Rules for afterGeocode:
- "nearbySearch": tight proximity search after geocoding (for specific venues)
- "textSearchWithBias": broader text search biased to geocoded point (for areas/neighborhoods)
- Examples:
  * POI/building → nearbySearch
  * Street/neighborhood → textSearchWithBias

Rules for radiusMeters:
- If query explicitly states distance (e.g., "800 meters", "500 מטר"), USE that exact value
- Otherwise:
  * 500-800: specific buildings/POIs
  * 1000-1500: streets/small areas
  * 1500-2000: neighborhoods/larger areas

Rules for keyword:
- Short food term (1-3 words max)
- Extract from query, keep in original language
- Examples: "pizza", "restaurant", "Italian restaurant", "מסעדות איטלקיות"

Rules for reason:
- "distance_from_landmark": if query has explicit distance pattern
- "poi_landmark": specific building/POI
- "street_landmark": street/avenue
- "area_landmark": neighborhood/area
`;

const LANDMARK_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(LANDMARK_MAPPER_PROMPT, 'utf8')
  .digest('hex');

// Import static schema (zod-to-json-schema broken with Zod v4)
import { LANDMARK_JSON_SCHEMA, LANDMARK_SCHEMA_HASH } from './static-schemas.js';

/**
 * Execute Landmark Mapper
 */
export async function executeLandmarkMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context
): Promise<LandmarkMapping> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'landmark_mapper',
    event: 'stage_started',
    region: intent.region,
    language: intent.language
  }, '[ROUTE2] landmark_mapper started');

  try {
    // Build context-aware prompt
    const userPrompt = buildUserPrompt(request.query, intent);

    const messages: Message[] = [
      { role: 'system', content: LANDMARK_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    let mapping: LandmarkMapping | null = null;
    let lastError: any = null;
    let tokenUsage: { input?: number; output?: number; total?: number; model?: string } | undefined;

    // Attempt 1: Initial LLM call
    try {
      const response = await llmProvider.completeJSON(
        messages,
        LandmarkMappingSchema,
        {
          temperature: 0,
          timeout: 4000,
          promptVersion: LANDMARK_MAPPER_VERSION,
          promptHash: LANDMARK_MAPPER_PROMPT_HASH,
          promptLength: LANDMARK_MAPPER_PROMPT.length,
          schemaHash: LANDMARK_SCHEMA_HASH,
          ...(traceId && { traceId }),
          ...(sessionId && { sessionId }),
          ...(requestId && { requestId }),
          stage: 'landmark_mapper'
        },
        LANDMARK_JSON_SCHEMA
      );
      mapping = response.data;
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
          stage: 'landmark_mapper',
          errorType,
          attempt: 1,
          msg: '[ROUTE2] landmark_mapper timeout, retrying once'
        });

        // Jittered backoff: 100-200ms (gate2 pattern)
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));

        // Attempt 2: Retry once
        try {
          const retryResponse = await llmProvider.completeJSON(
            messages,
            LandmarkMappingSchema,
            {
              temperature: 0,
              timeout: 4000,
              promptVersion: LANDMARK_MAPPER_VERSION,
              promptHash: LANDMARK_MAPPER_PROMPT_HASH,
              promptLength: LANDMARK_MAPPER_PROMPT.length,
              schemaHash: LANDMARK_SCHEMA_HASH,
              ...(traceId && { traceId }),
              ...(sessionId && { sessionId }),
              ...(requestId && { requestId }),
              stage: 'landmark_mapper'
            },
            LANDMARK_JSON_SCHEMA
          );
          mapping = retryResponse.data;
          tokenUsage = {
            ...(retryResponse.usage?.prompt_tokens !== undefined && { input: retryResponse.usage.prompt_tokens }),
            ...(retryResponse.usage?.completion_tokens !== undefined && { output: retryResponse.usage.completion_tokens }),
            ...(retryResponse.usage?.total_tokens !== undefined && { total: retryResponse.usage.total_tokens }),
            ...(retryResponse.model !== undefined && { model: retryResponse.model })
          };

          logger.info({
            requestId,
            stage: 'landmark_mapper',
            attempt: 2,
            msg: '[ROUTE2] landmark_mapper retry succeeded'
          });
        } catch (retryErr) {
          // Retry failed - will throw below
          lastError = retryErr;
        }
      }
    }

    // If LLM failed (even after retry), throw error
    if (!mapping) {
      const durationMs = Date.now() - startTime;
      const errorMsg = lastError instanceof Error ? lastError.message : 'unknown';

      logger.error({
        requestId,
        pipelineVersion: 'route2',
        stage: 'landmark_mapper',
        event: 'stage_failed',
        durationMs,
        error: errorMsg
      }, '[ROUTE2] landmark_mapper failed');

      throw lastError || new Error('LLM failed to return mapping');
    }

    const durationMs = Date.now() - startTime;

    // Debug dump
    logger.info({
      requestId,
      pipelineVersion: 'route2',
      stage: 'landmark_mapper',
      event: 'stage_completed',
      durationMs,
      geocodeQuery: mapping.geocodeQuery,
      afterGeocode: mapping.afterGeocode,
      radiusMeters: mapping.radiusMeters,
      keyword: mapping.keyword,
      region: mapping.region,
      language: mapping.language,
      reason: mapping.reason,
      ...(tokenUsage && { tokenUsage })
    }, '[ROUTE2] landmark_mapper completed');

    return mapping;

  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'unknown';

    logger.error({
      requestId,
      pipelineVersion: 'route2',
      stage: 'landmark_mapper',
      event: 'stage_failed',
      durationMs,
      error: errorMsg
    }, '[ROUTE2] landmark_mapper failed');

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
  const prompt = `Query: "${query}"
Region: ${intent.region}
Language: ${intent.language}`;

  return prompt;
}
