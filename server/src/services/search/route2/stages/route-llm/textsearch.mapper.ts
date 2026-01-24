/**
 * TextSearch Mapper - ROUTE2 Pipeline
 * * LLM-based mapper for TEXTSEARCH route
 * Converts raw query into Google Places Text Search parameters
 */

import { createHash } from 'crypto';
import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context, IntentResult } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
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
 */
export async function executeTextSearchMapper(
  intent: IntentResult,
  request: SearchRequest,
  context: Route2Context
): Promise<TextSearchMapping> {
  const { requestId, traceId, sessionId, llmProvider } = context;
  const startTime = Date.now();

  try {
    const userPrompt = buildUserPrompt(request.query, intent);
    const messages: Message[] = [
      { role: 'system', content: TEXTSEARCH_MAPPER_PROMPT },
      { role: 'user', content: userPrompt }
    ];

    // DIAGNOSTIC: Log schema before OpenAI call
    logger.info({
      requestId,
      stage: 'textsearch_mapper',
      event: 'schema_check_before_llm',
      schemaId: 'TEXTSEARCH_JSON_SCHEMA',
      schemaKeys: Object.keys(TEXTSEARCH_JSON_SCHEMA.properties),
      hasBias: Boolean((TEXTSEARCH_JSON_SCHEMA.properties as any).bias),
      hasBiasLat: Boolean((TEXTSEARCH_JSON_SCHEMA.properties as any).biasLat),
      schemaHash: TEXTSEARCH_SCHEMA_HASH
    });

    let response: any = null;
    let lastError: any = null;

    // Attempt 1: Initial LLM call
    try {
      response = await llmProvider.completeJSON(
        messages,
        TextSearchLLMResponseSchema,  // Use LLM response schema (no bias)
        {
          temperature: 0,
          timeout: 3500,
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
              temperature: 0,
              timeout: 3500,
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
      return buildDeterministicMapping(intent, request, requestId);
    }

    // Using 'as any' because the LLM response doesn't contain 'bias' anymore
    const mapping = response.data as any;

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
    return buildDeterministicMapping(intent, request, requestId);
  }
}
/**
 * Build deterministic mapping when LLM fails
 */
function buildDeterministicMapping(
  intent: IntentResult,
  request: SearchRequest,
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
    region: intent.region,
    language: intent.language,
    bias: undefined,
    reason: 'deterministic_fallback',
    ...(intent.cityText && { cityText: intent.cityText })
  };

  return mapping;
}

function buildUserPrompt(query: string, intent: IntentResult): string {
  return `Query: "${query}"\nRegion: ${intent.region}\nLanguage: ${intent.language}`;
}

function applyLocationBias(
  mapping: TextSearchMapping,
  intent: IntentResult,
  request: SearchRequest,
  requestId?: string
): { bias: any, source: string | null, nullReason?: string } {
  // Logic remains the same, assuming TEXTSEARCH usually handles location via textQuery
  return {
    bias: undefined,
    source: null,
    nullReason: 'textsearch_no_automatic_bias'
  };
}