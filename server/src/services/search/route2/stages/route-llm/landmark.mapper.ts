/**
 * Landmark Mapper - ROUTE2 Pipeline
 * 
 * LLM-based mapper for LANDMARK route
 * Plans two-phase search: geocode landmark first, then search nearby
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult, FinalSharedFilters } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../../lib/llm/index.js';
import { LandmarkMappingSchema, type LandmarkMapping } from './schemas.js';

const LANDMARK_MAPPER_VERSION = 'landmark_mapper_v3';

export const LANDMARK_MAPPER_PROMPT = `You are a landmark geocoding planner for a restaurant search system.

Return ONLY JSON with ALL fields (no extra keys, no commentary):
{
  "providerMethod": "landmarkPlan",
  "geocodeQuery": "string",
  "afterGeocode": "nearbySearch" | "textSearchWithBias",
  "radiusMeters": number | null,
  "keyword": "string",
  "region": "IL|US|GB|FR|DE|... (ISO-3166-1 alpha-2)",
  "language": "he|en|ru|ar|fr|es|other",
  "reason": "distance_from_landmark|poi_landmark|street_landmark|area_landmark"
}

HARD RULES:
- Always fill EVERY field (use null only where explicitly allowed).
- region MUST be a valid ISO-3166-1 alpha-2 code (e.g., IL, US, FR). Never invent codes.
- language is the query language.
- keyword must be food-related (1–3 words). If unclear, use "restaurant".

geocodeQuery rules:
- geocodeQuery MUST be ONLY the landmark/place to geocode (never the food term).
- If query matches "X meters from <landmark>" / "במרחק של X מטר מ<landmark>" → geocodeQuery = <landmark> only, reason="distance_from_landmark".
- If query matches "ליד <landmark>" / "near <landmark>" / "קרוב ל<landmark>" → geocodeQuery = <landmark>.
- If the landmark name is ambiguous, append city/region for disambiguation:
  - Example: "Azrieli Center Tel Aviv"
  - Example: "Dizengoff Center Tel Aviv"
  - Example: "Marina Herzliya Israel"
- Keep geocodeQuery in original language OR translate to English only when the landmark is clearly foreign and English helps geocoding (e.g., "Arc de Triomphe, Paris").

afterGeocode rules:
- nearbySearch: for POIs/buildings/venues (tight proximity).
- textSearchWithBias: for streets/areas/neighborhoods (broader, biased to point).

radiusMeters rules:
- If query explicitly states distance (e.g., "800 meters", "500 מטר") → radiusMeters = exact number.
- Else choose based on landmark type:
  - POI/building: 500–800
  - Street/small area: 1000–1500
  - Neighborhood/large area: 1500–2000
- If you truly cannot infer type, use 1000.

keyword rules:
- Extract the food/cuisine term from the query (1–3 words), keep original language.
- Examples: "pizza", "hummus", "מסעדה כשרה", "מסעדות איטלקיות".

reason rules (choose ONE):
- distance_from_landmark: explicit distance present
- poi_landmark: specific building/POI/venue
- street_landmark: street/avenue/road
- area_landmark: neighborhood/area

Examples:
- "פיצה ליד דיזנגוף סנטר" →
  {"providerMethod":"landmarkPlan","geocodeQuery":"Dizengoff Center Tel Aviv","afterGeocode":"nearbySearch","radiusMeters":800,"keyword":"פיצה","region":"IL","language":"he","reason":"poi_landmark"}
- "מסעדות איטלקיות במרחק של 1500 מטר משער הניצחון" →
  {"providerMethod":"landmarkPlan","geocodeQuery":"שער הניצחון","afterGeocode":"nearbySearch","radiusMeters":1500,"keyword":"מסעדות איטלקיות","region":"IL","language":"he","reason":"distance_from_landmark"}
- "pizza near Arc de Triomphe" →
  {"providerMethod":"landmarkPlan","geocodeQuery":"Arc de Triomphe, Paris","afterGeocode":"nearbySearch","radiusMeters":800,"keyword":"pizza","region":"FR","language":"en","reason":"poi_landmark"}
`;

const LANDMARK_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(LANDMARK_MAPPER_PROMPT, 'utf8')
  .digest('hex');

// Import static schema (zod-to-json-schema broken with Zod v4)
import { LANDMARK_JSON_SCHEMA, LANDMARK_SCHEMA_HASH } from './static-schemas.js';

/**
 * Execute Landmark Mapper
 */
/**
 * @param finalFilters Single source of truth for region/language (from filters_resolved)
 */
export async function executeLandmarkMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context,
  finalFilters: FinalSharedFilters
): Promise<LandmarkMapping> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  logger.info({
    requestId,
    pipelineVersion: 'route2',
    stage: 'landmark_mapper',
    event: 'stage_started',
    regionCandidate: intent.regionCandidate,
    finalRegion: finalFilters.regionCode,
    language: finalFilters.providerLanguage
  }, '[ROUTE2] landmark_mapper started (using filters_resolved region)');

  try {
    // Build context-aware prompt
    const userPrompt = buildUserPrompt(request.query, finalFilters);

    const messages: Message[] = [
      { role: 'system', content: LANDMARK_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    // Resolve model and timeout for routeMapper purpose
    const { model, timeoutMs } = resolveLLM('routeMapper');

    let mapping: LandmarkMapping | null = null;
    let lastError: any = null;
    let tokenUsage: { input?: number; output?: number; total?: number; model?: string } | undefined;

    // Attempt 1: Initial LLM call
    try {
      const response = await llmProvider.completeJSON(
        messages,
        LandmarkMappingSchema,
        {
          model,
          temperature: 0,
          timeout: timeoutMs,
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
              model,
              temperature: 0,
              timeout: timeoutMs,
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

          // CRITICAL: Override LLM's region/language with filters_resolved values (single source of truth)
          mapping.region = finalFilters.regionCode;
          mapping.language = finalFilters.providerLanguage;

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
 * Uses filters_resolved as single source of truth for region/language
 */
function buildUserPrompt(
  query: string,
  finalFilters: FinalSharedFilters
): string {
  const prompt = `Query: "${query}"
Region: ${finalFilters.regionCode}
Language: ${finalFilters.providerLanguage}`;

  return prompt;
}
