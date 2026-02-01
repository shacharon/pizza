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

const LANDMARK_MAPPER_PROMPT = `You plan a landmark-based search.

Output JSON only:
{
  "providerMethod":"landmarkPlan",
  "geocodeQuery": string,
  "afterGeocode":"nearbySearch"|"textSearchWithBias",
  "radiusMeters": number,
  "keyword": string|null,
  "region": string,
  "reason":"distance_from_landmark"|"poi_landmark"|"street_landmark"|"area_landmark"
}

Rules:
- Do NOT detect or output language.
- geocodeQuery: the landmark name as stated in the query; do not translate.
- afterGeocode: POI/building -> nearbySearch; street/area -> textSearchWithBias.
- radiusMeters: use explicit distance if provided; else choose 500-2000 based on POI/street/area.
- keyword: short canonical food/place term (1-3 words) or null; never include location words.


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
    // OPTIMIZATION: Try to resolve landmark from cache BEFORE calling LLM
    // If landmark is known with coordinates, skip LLM and build mapping deterministically
    const cachedLandmark = normalizeLandmark(request.query, finalFilters.regionCode);
    
    if (cachedLandmark && cachedLandmark.knownLatLng) {
      // Landmark resolved from registry with known coordinates - SKIP LLM
      const durationMs = Date.now() - startTime;
      
      logger.info({
        requestId,
        pipelineVersion: 'route2',
        stage: 'landmark_mapper',
        event: 'landmark_cache_hit',
        landmarkId: cachedLandmark.landmarkId,
        primaryName: cachedLandmark.primaryName,
        knownLatLng: cachedLandmark.knownLatLng,
        durationMs,
        llmSkipped: true
      }, '[ROUTE2] landmark_mapper: resolved from cache, skipping LLM');

      // Build deterministic mapping (no LLM needed)
      const cuisineKey = extractCuisineKeyFromQuery(request.query);
      const typeKey = cuisineKey ? null : extractTypeKeyFromQuery(request.query);
      
      const mapping: LandmarkMapping = {
        providerMethod: 'landmarkPlan',
        geocodeQuery: cachedLandmark.primaryName, // Use canonical name
        afterGeocode: 'nearbySearch', // Use nearbySearch for POI landmarks with known coords
        radiusMeters: 1000, // Default radius for cached landmarks
        keyword: null, // Will be handled by cuisine/type keys
        region: finalFilters.regionCode,
        language: finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage,
        reason: 'landmark_cache_hit',
        landmarkId: cachedLandmark.landmarkId,
        cuisineKey: cuisineKey,
        typeKey: typeKey,
        resolvedLatLng: cachedLandmark.knownLatLng
      };

      logger.info({
        requestId,
        pipelineVersion: 'route2',
        stage: 'landmark_mapper',
        event: 'stage_completed',
        durationMs,
        geocodeQuery: mapping.geocodeQuery,
        landmarkId: mapping.landmarkId,
        cuisineKey: mapping.cuisineKey || null,
        typeKey: mapping.typeKey || null,
        afterGeocode: mapping.afterGeocode,
        radiusMeters: mapping.radiusMeters,
        keyword: mapping.keyword,
        region: mapping.region,
        language: mapping.language,
        reason: mapping.reason,
        llmSkipped: true
      }, '[ROUTE2] landmark_mapper completed (cache hit, no LLM)');

      return mapping;
    }

    // Landmark NOT in cache or no known coordinates - proceed with LLM
    logger.info({
      requestId,
      stage: 'landmark_mapper',
      event: 'landmark_cache_miss',
      cacheChecked: !!cachedLandmark,
      hasKnownLatLng: cachedLandmark?.knownLatLng ? true : false
    }, '[ROUTE2] landmark_mapper: cache miss, calling LLM');

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
