/**
 * TextSearch Mapper - ROUTE2 Pipeline
 * * LLM-based mapper for TEXTSEARCH route
 * Converts raw query into Google Places Text Search parameters
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult, FinalSharedFilters } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../../lib/llm/index.js';
import { TextSearchLLMResponseSchema, type TextSearchMapping } from './schemas.js';

const TEXTSEARCH_MAPPER_VERSION = 'textsearch_mapper_v2';

const TEXTSEARCH_MAPPER_PROMPT = `// Use English comments for code/prompts as requested
// Context: userLatitude: {{lat}}, userLongitude: {{lng}}, hasUserLocation: {{hasLocation}}

You are a query rewriter for Google Places Text Search API.
Your goal is to transform user input into a highly effective search string for Google.

Output ONLY JSON with these fields:
{
  "providerMethod": "textSearch",
  "textQuery": "string",
  "region": "IL|FR|US|etc",
  "language": "he|en|ru|ar|fr|es|other",
  "locationBias": { "lat": number, "lng": number } | null,
  "reason": "token"
}

Rules:
1) Preserve the original query structure.
2) Remove only filler/politeness words.
3) If the user says "near me" (לידי/בקרבתי) and hasUserLocation is true, DO NOT include "near me" in textQuery. Instead, set the locationBias field with the provided coordinates and keep the textQuery focused on the entity (e.g., "מסעדות").
4) If place-type is missing (e.g., "dairy in Ashdod"), add "restaurant" (מסעדה) prefix.
5) Reason must be: "original_preserved", "place_type_added", "filler_removed", or "location_bias_applied".
`;

const TEXTSEARCH_MAPPER_PROMPT_HASH = createHash('sha256')
  .update(TEXTSEARCH_MAPPER_PROMPT, 'utf8')
  .digest('hex');

// Import the updated static schema (the one without 'bias' fields)
import { TEXTSEARCH_JSON_SCHEMA, TEXTSEARCH_SCHEMA_HASH } from './static-schemas.js';

/**
 * Execute TextSearch Mapper
 */
/**
 * TextSearch Mapper
 * Handles the conversion of user queries into structured Google Search parameters.
 * 
 * @param finalFilters Single source of truth for region/language (from filters_resolved)
 */
export async function executeTextSearchMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context,
  finalFilters: FinalSharedFilters
): Promise<TextSearchMapping> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  try {
    const userPrompt = buildUserPrompt(request.query, finalFilters);
    const messages: Message[] = [
      { role: 'system', content: TEXTSEARCH_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    // DIAGNOSTIC: Log schema before OpenAI call
    // hasBiasCandidate = schema supports locationBias field (LLM can return it)
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'schema_check_before_llm',
      schemaId: 'TEXTSEARCH_JSON_SCHEMA',
      schemaKeys: Object.keys(TEXTSEARCH_JSON_SCHEMA.properties),
      hasBiasCandidate: Boolean((TEXTSEARCH_JSON_SCHEMA.properties as any).locationBias),
      schemaHash: TEXTSEARCH_SCHEMA_HASH
    });

    // Resolve model and timeout for routeMapper purpose
    const { model, timeoutMs } = resolveLLM('routeMapper');

    let response: any = null;
    let lastError: any = null;

    // Attempt 1: Initial LLM call
    try {
      response = await llmProvider.completeJSON(
        messages,
        TextSearchLLMResponseSchema,  // Use LLM response schema (no bias)
        {
          model,
          temperature: 0,
          timeout: timeoutMs,
          requestId,
          ...(context.traceId && { traceId: context.traceId }),
          ...(context.sessionId && { sessionId: context.sessionId }),
          stage: 'textsearch_mapper',
          promptVersion: TEXTSEARCH_MAPPER_VERSION,
          promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,
          schemaHash: TEXTSEARCH_SCHEMA_HASH
        },
        TEXTSEARCH_JSON_SCHEMA // Use the simplified schema defined above
      );
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
          stage: 'textsearch_mapper',
          errorType,
          attempt: 1,
          msg: '[ROUTE2] textsearch_mapper timeout, retrying once'
        });

        // Jittered backoff: 100-200ms (gate2 pattern)
        await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 100));

        // Attempt 2: Retry once
        try {
          response = await llmProvider.completeJSON(
            messages,
            TextSearchLLMResponseSchema,
            {
              model,
              temperature: 0,
              timeout: timeoutMs,
              requestId,
              ...(context.traceId && { traceId: context.traceId }),
              ...(context.sessionId && { sessionId: context.sessionId }),
              stage: 'textsearch_mapper',
              promptVersion: TEXTSEARCH_MAPPER_VERSION,
              promptHash: TEXTSEARCH_MAPPER_PROMPT_HASH,
              schemaHash: TEXTSEARCH_SCHEMA_HASH
            },
            TEXTSEARCH_JSON_SCHEMA
          );

          logger.info({
            requestId,
            stage: 'textsearch_mapper',
            attempt: 2,
            msg: '[ROUTE2] textsearch_mapper retry succeeded'
          });
        } catch (retryErr) {
          // Retry failed - will use fallback below
          lastError = retryErr;
        }
      }
    }

    // If LLM failed (even after retry), use fallback
    if (!response) {
      logger.warn({
        requestId,
        stage: 'textsearch_mapper',
        error: lastError?.message || String(lastError),
        msg: '[ROUTE2] textsearch_mapper LLM failed, using fallback'
      });
      return buildDeterministicMapping(intent, request, finalFilters, requestId);
    }

    // Using 'as any' because the LLM response doesn't contain 'bias' anymore
    const mapping = response.data as any;

    // CRITICAL: Override LLM's region/language with filters_resolved values (single source of truth)
    mapping.region = finalFilters.regionCode;
    mapping.language = finalFilters.providerLanguage;

    // CRITICAL: Manually inject 'bias' property as undefined.
    // This ensures that 'applyLocationBias' function doesn't crash 
    // and downstream types remain compatible.
    mapping.bias = undefined;

    // Propagate cityText from intent if present
    if (intent.cityText) {
      mapping.cityText = intent.cityText;
    }

    // Apply your existing location bias logic based on user metadata/intent
    const biasResult = applyLocationBias(mapping, intent, request, requestId);
    mapping.bias = biasResult.bias;

    return mapping as TextSearchMapping;

  } catch (error) {
    // Fallback logic if LLM fails or returns 400
    return buildDeterministicMapping(intent, request, finalFilters, requestId);
  }
}
/**
 * Build deterministic mapping when LLM fails
 * Uses filters_resolved as single source of truth for region/language
 */
function buildDeterministicMapping(
  intent: IntentResult,
  request: SearchRequest,
  finalFilters: FinalSharedFilters,
  requestId?: string
): TextSearchMapping {
  const statusWords = ['פתוחות', 'פתוח', 'סגורות', 'סגור', 'open', 'closed'];
  let cleanedQuery = request.query;
  for (const word of statusWords) {
    cleanedQuery = cleanedQuery.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  cleanedQuery = cleanedQuery.trim().replace(/\s+/g, ' ');

  const mapping: TextSearchMapping = {
    providerMethod: 'textSearch',
    textQuery: cleanedQuery,
    region: finalFilters.regionCode,
    language: finalFilters.providerLanguage,
    bias: undefined,
    reason: 'deterministic_fallback',
    ...(intent.cityText && { cityText: intent.cityText })
  };

  // CRITICAL: Apply location bias in fallback path too
  const biasResult = applyLocationBias(mapping, intent, request, requestId);
  mapping.bias = biasResult.bias;

  return mapping;
}

function buildUserPrompt(query: string, finalFilters: FinalSharedFilters): string {
  return `Query: "${query}"\nRegion: ${finalFilters.regionCode}\nLanguage: ${finalFilters.providerLanguage}`;
}

/**
 * Apply location bias based on available anchors
 * Priority:
 * 1. userLocation (if present)
 * 2. cityText (will be geocoded later in text-search.handler.ts)
 * 3. No bias
 */
function applyLocationBias(
  mapping: TextSearchMapping,
  intent: IntentResult,
  request: SearchRequest,
  requestId?: string
): { bias: any, source: string | null, nullReason?: string } {
  // Priority 1: userLocation (immediate bias)
  if (request.userLocation) {
    const bias = {
      type: 'locationBias' as const,
      center: { lat: request.userLocation.lat, lng: request.userLocation.lng },
      radiusMeters: 20000 // Default 20km for user location bias
    };
    
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'bias_applied',
      source: 'userLocation',
      lat: bias.center.lat,
      lng: bias.center.lng,
      radiusMeters: bias.radiusMeters
    }, '[TEXTSEARCH] Location bias applied from userLocation (default anchor)');
    
    return { bias, source: 'userLocation' };
  }

  // Priority 2: cityText exists (will be geocoded later in pipeline)
  // Don't set bias here, but signal that bias is planned
  if (mapping.cityText) {
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'bias_planned',
      source: 'cityText_pending_geocode',
      cityText: mapping.cityText
    }, '[TEXTSEARCH] Location bias planned from cityText (will be geocoded in handler)');
    
    // Return undefined bias but indicate it's planned (handler will geocode)
    return { 
      bias: undefined, 
      source: 'cityText_pending_geocode'
    };
  }

  // Priority 3: No location anchor available
  logger.debug({
    requestId,
    stage: 'textsearch_mapper',
    event: 'bias_not_available',
    hasUserLocation: !!request.userLocation,
    hasCityText: !!mapping.cityText,
    reason: 'no_location_anchor'
  }, '[TEXTSEARCH] No location bias available');

  return {
    bias: undefined,
    source: null,
    nullReason: 'no_location_anchor'
  };
}