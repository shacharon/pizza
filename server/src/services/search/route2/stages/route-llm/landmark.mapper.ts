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
import { extractCuisineKeyFromQuery, extractTypeKeyFromQuery } from './query-cuisine-extractor.js';
import { normalizeLandmark } from './landmark-normalizer.js';

const LANDMARK_MAPPER_VERSION = 'landmark_mapper_v3';

const LANDMARK_MAPPER_PROMPT = `
You are LANDMARK_PLAN.

Output ONLY JSON with ALL fields:
{
  "providerMethod":"landmarkPlan",
  "geocodeQuery":string,
  "afterGeocode":"nearbySearch"|"textSearchWithBias",
  "radiusMeters":number,
  "keyword":string,
  "region":string,
  "language":"he|en|ru|ar|fr|es|other",
  "reason":"distance_from_landmark"|"poi_landmark"|"street_landmark"|"area_landmark"
}

geocodeQuery:
- Landmark name ONLY (no cuisine/food words).
- Add city/country if needed for disambiguation.
- Keep the same language as the user query (do NOT translate).

afterGeocode:
- nearbySearch for a specific POI/building/venue.
- textSearchWithBias for street/area/neighborhood.

radiusMeters:
- If explicit distance exists, use that exact number.
- Else: POI 700, street 1200, area 1800.

keyword:
- 1-3 words food/place term only.
- If no explicit food/place term, set keyword="restaurant".

No extra keys. No text.

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

      // CRITICAL: Override LLM's region/language with filters_resolved values
      mapping.region = finalFilters.regionCode;
      mapping.language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;

      // NEW: Extract cuisineKey/typeKey deterministically (language-independent)
      const cuisineKey = extractCuisineKeyFromQuery(request.query);
      if (cuisineKey) {
        mapping.cuisineKey = cuisineKey;
      } else {
        const typeKey = extractTypeKeyFromQuery(request.query);
        if (typeKey) {
          mapping.typeKey = typeKey;
        }
      }

      // NEW: Normalize landmark to canonical ID (multilingual support)
      const canonical = normalizeLandmark(mapping.geocodeQuery, mapping.region);
      if (canonical) {
        mapping.landmarkId = canonical.landmarkId;
        // If we have known coordinates, store them (for cache warmup)
        if (canonical.knownLatLng) {
          mapping.resolvedLatLng = canonical.knownLatLng;
        }
      }

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
          // Use languageContext.searchLanguage (region-based policy) instead of providerLanguage
          mapping.region = finalFilters.regionCode;
          mapping.language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;

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
      landmarkId: mapping.landmarkId || null,
      cuisineKey: mapping.cuisineKey || null,
      typeKey: mapping.typeKey || null,
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
  const language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;
  const prompt = `Query: "${query}"
Region: ${finalFilters.regionCode}
Language: ${language}`;

  return prompt;
}
