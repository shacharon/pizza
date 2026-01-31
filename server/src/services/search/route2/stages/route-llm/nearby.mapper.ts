/**
 * Nearby Mapper - ROUTE2 Pipeline
 * 
 * LLM-based mapper for NEARBY route
 * Converts "near me" queries into Google Places Nearby Search parameters
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult, FinalSharedFilters } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { NearbyMappingSchema, type NearbyMapping } from './schemas.js';
import { extractCuisineKeyFromQuery, extractTypeKeyFromQuery } from './query-cuisine-extractor.js';

const NEARBY_MAPPER_VERSION = 'nearby_mapper_v1';

const NEARBY_MAPPER_PROMPT = ` You generate Google Places Nearby Search parameters.

Output JSON only:
{
  "providerMethod":"nearbySearch",
  "location":{"lat":number,"lng":number},
  "radiusMeters":number,
  "keyword": string|null,
  "region": string,
  "reason":"distance_explicit"|"distance_default"
}

Rules:
- location must be exactly the input coordinates.
- radiusMeters: if an explicit distance appears in the query, use that number exactly; else 500.
- keyword: a short canonical food/place term (1-3 words). Do NOT include location words. Do NOT translate the city. Do NOT output language.


`;

const NEARBY_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(NEARBY_MAPPER_PROMPT, 'utf8')
  .digest('hex');

// Import static schema (zod-to-json-schema broken with Zod v4)
import { NEARBY_JSON_SCHEMA, NEARBY_SCHEMA_HASH } from './static-schemas.js';

/**
 * Execute Nearby Mapper
 * 
 * REQUIRES: context.userLocation must be present
 * FAILS FAST: if userLocation is missing
 * 
 * @param finalFilters Single source of truth for region/language (from filters_resolved)
 */
export async function executeNearbyMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context,
  finalFilters: FinalSharedFilters
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
    regionCandidate: intent.regionCandidate,
    finalRegion: finalFilters.regionCode,
    language: finalFilters.providerLanguage,
    hasUserLocation: true
  }, '[ROUTE2] nearby_mapper started (using filters_resolved region)');

  try {
    // Build context-aware prompt
    const userPrompt = buildUserPrompt(request.query, finalFilters, userLocation);

    const messages: Message[] = [
      { role: 'system', content: NEARBY_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    let mapping: NearbyMapping | null = null;
    let lastError: any = null;
    let tokenUsage: { input?: number; output?: number; total?: number; model?: string } | undefined;

    // Attempt 1: Initial LLM call with 4.5s timeout
    try {
      const response = await llmProvider.completeJSON(
        messages,
        NearbyMappingSchema,
        {
          temperature: 0,
          timeout: 4500,
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
      mapping = response.data;

      // CRITICAL: Override LLM's region/language with filters_resolved values (single source of truth)
      // Use languageContext.searchLanguage (region-based policy) instead of providerLanguage
      mapping.region = finalFilters.regionCode;
      mapping.language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;

      // NEW: Extract cuisineKey/typeKey deterministically (language-independent)
      const cuisineKey = extractCuisineKeyFromQuery(request.query);
      if (cuisineKey) {
        mapping.cuisineKey = cuisineKey;
      } else {
        // Fallback: try to extract typeKey
        const typeKey = extractTypeKeyFromQuery(request.query);
        if (typeKey) {
          mapping.typeKey = typeKey;
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
          stage: 'nearby_mapper',
          errorType,
          attempt: 1,
          msg: '[ROUTE2] nearby_mapper timeout, retrying once'
        });

        // Jittered backoff: 150-250ms
        await new Promise(resolve => setTimeout(resolve, 150 + Math.random() * 100));

        // Attempt 2: Retry once
        try {
          const retryResponse = await llmProvider.completeJSON(
            messages,
            NearbyMappingSchema,
            {
              temperature: 0,
              timeout: 4500,
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
          mapping = retryResponse.data;

          // CRITICAL: Override LLM's region/language with filters_resolved values (single source of truth)
          // Use languageContext.searchLanguage (region-based policy) instead of providerLanguage
          mapping.region = finalFilters.regionCode;
          mapping.language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;

          // NEW: Extract cuisineKey/typeKey deterministically (language-independent)
          const cuisineKey = extractCuisineKeyFromQuery(request.query);
          if (cuisineKey) {
            mapping.cuisineKey = cuisineKey;
          } else {
            // Fallback: try to extract typeKey
            const typeKey = extractTypeKeyFromQuery(request.query);
            if (typeKey) {
              mapping.typeKey = typeKey;
            }
          }

          tokenUsage = {
            ...(retryResponse.usage?.prompt_tokens !== undefined && { input: retryResponse.usage.prompt_tokens }),
            ...(retryResponse.usage?.completion_tokens !== undefined && { output: retryResponse.usage.completion_tokens }),
            ...(retryResponse.usage?.total_tokens !== undefined && { total: retryResponse.usage.total_tokens }),
            ...(retryResponse.model !== undefined && { model: retryResponse.model })
          };

          logger.info({
            requestId,
            stage: 'nearby_mapper',
            attempt: 2,
            msg: '[ROUTE2] nearby_mapper retry succeeded'
          });
        } catch (retryErr) {
          // Retry failed - will use fallback below
          lastError = retryErr;
        }
      }
    }

    // If LLM failed (even after retry), use fallback mapping
    if (!mapping) {
      logger.warn({
        requestId,
        stage: 'nearby_mapper',
        error: lastError?.message || String(lastError),
        msg: '[ROUTE2] nearby_mapper LLM failed, using fallback'
      });

      mapping = buildFallbackMapping(request.query, finalFilters, userLocation);

      logger.info({
        requestId,
        stage: 'nearby_mapper',
        event: 'fallback_mapping',
        keyword: mapping.keyword,
        radiusMeters: mapping.radiusMeters,
        reason: mapping.reason,
        msg: '[ROUTE2] nearby_mapper fallback applied'
      });
    }

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
      reason: mapping.reason,
      ...(tokenUsage && { tokenUsage })
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
 * Uses filters_resolved as single source of truth for region/language
 */
function buildUserPrompt(
  query: string,
  finalFilters: FinalSharedFilters,
  userLocation: { lat: number; lng: number }
): string {
  const language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;
  return `Query: "${query}"
User location: lat=${userLocation.lat}, lng=${userLocation.lng}
Region: ${finalFilters.regionCode}
Language: ${language}`;
}

/**
 * Build fallback mapping without LLM (used when LLM times out/fails)
 * Extracts radius from query patterns, uses cleaned query as keyword
 * Uses filters_resolved as single source of truth for region/language
 */
function buildFallbackMapping(
  query: string,
  finalFilters: FinalSharedFilters,
  userLocation: { lat: number; lng: number }
): NearbyMapping {
  // Extract explicit distance from query
  // Patterns: "2500 מטר", "500m", "300 meters", "1km", "במרחק של 2000 מטר"
  const distancePatterns = [
    /(\d+)\s*(?:מטר|מטרים)/i,           // Hebrew: 2500 מטר
    /(\d+)\s*m(?:eters?)?(?:\s|$)/i,     // English: 500m, 300 meters
    /(\d+(?:\.\d+)?)\s*km/i,              // Kilometers: 1km, 1.5km
    /במרחק\s+(?:של\s+)?(\d+)/i          // Hebrew: במרחק של 2500
  ];

  let radiusMeters = 2000; // Default for nearby without distance
  let reason = 'fallback_default_radius';

  for (const pattern of distancePatterns) {
    const match = query.match(pattern);
    if (match && match[1]) {
      const value = parseFloat(match[1]);
      if (pattern.source.includes('km')) {
        radiusMeters = Math.round(value * 1000); // km to meters
      } else {
        radiusMeters = Math.round(value);
      }
      reason = 'fallback_explicit_radius';
      break;
    }
  }

  // Clean query: remove distance phrases, keep food/cuisine words
  let keyword = query
    .replace(/במרחק\s+(?:של\s+)?\d+\s*(?:מטר|מטרים|ק"מ)?(?:\s+ממני)?/gi, '')
    .replace(/\d+\s*(?:meters?|m|km)?\s*(?:away|from me)?/gi, '')
    .replace(/(?:near me|close to me|nearby)/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  // If cleaned keyword is too short, use original query (first 50 chars)
  if (keyword.length < 3) {
    keyword = query.substring(0, 50);
  }

  // Extract cuisineKey/typeKey deterministically
  const cuisineKey = extractCuisineKeyFromQuery(query);
  const typeKey = cuisineKey ? undefined : extractTypeKeyFromQuery(query);

  return {
    providerMethod: 'nearbySearch',
    location: userLocation,
    radiusMeters,
    keyword,
    region: finalFilters.regionCode,
    language: finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage,
    reason,
    ...(cuisineKey && { cuisineKey }),
    ...(typeKey && { typeKey })
  };
}

// Export extractors for testing
export { extractCuisineKeyFromQuery, extractTypeKeyFromQuery } from './query-cuisine-extractor.js';
