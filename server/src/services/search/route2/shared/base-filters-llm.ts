/**
 * Base Filters LLM - Route2 Pipeline
 * 
 * Fast LLM call to determine PreGoogleBaseFilters
 * Timeout: 900ms
 */

import { createHash } from 'crypto';
import type { Message } from '../../../../llm/types.js';
import { buildLLMJsonSchema } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { PreGoogleBaseFiltersSchema, type PreGoogleBaseFilters } from './shared-filters.types.js';
import type { MappingRoute } from '../types.js';
import type { LLMProvider } from '../../../../llm/types.js';

const BASE_FILTERS_LLM_VERSION = 'base_filters_v1';

const BASE_FILTERS_PROMPT = `You are a base filter extractor for restaurant search queries.

Output ONLY JSON with ALL fields:
{
  "language": "he|en|auto",
  "openState": "ANY|OPEN_NOW|CLOSED_NOW",
  "regionHint": "ISO-3166-1 alpha-2" or null
}

Rules:
- language: "he" if query is primarily Hebrew, "en" if primarily English, else "auto".
- openState:
  * "OPEN_NOW" ONLY if query explicitly asks for: open now / currently open / open / פתוח עכשיו / פתוח / open restaurants
  * "CLOSED_NOW" ONLY if query explicitly asks for: closed / closed now / not open / סגור / סגור עכשיו / לא פתוח
  * Support common misspellings: "cloesed", "closd", "clsoed" → treat as CLOSED_NOW
  * "ANY" otherwise (default - no filter)
- regionHint: MUST be either null OR exactly 2 uppercase letters (ISO-3166-1 alpha-2 country code).
  * Valid examples: "IL", "FR", "US", "ES", "RU", "DE"
  * Set ONLY if explicitly stated as a country (e.g., "Israel", "France", "Russia")
  * If only a city is mentioned (e.g., "גדרה", "Paris", "Tel Aviv") → null
  * If unsure → null
  * NEVER use punctuation, numbers, or special characters
- Do NOT guess. Do NOT infer region from language alone.

`;

const BASE_FILTERS_PROMPT_HASH = createHash('sha256')
    .update(BASE_FILTERS_PROMPT, 'utf8')
    .digest('hex');

const { schema: BASE_FILTERS_JSON_SCHEMA, schemaHash: BASE_FILTERS_SCHEMA_HASH } = buildLLMJsonSchema(
    PreGoogleBaseFiltersSchema,
    'PreGoogleBaseFilters'
);

/**
 * Fallback filters when LLM fails
 */
function createFallbackFilters(): PreGoogleBaseFilters {
    return {
        language: 'auto',
        openState: 'ANY',
        regionHint: null
    };
}

/**
 * Validate and sanitize regionHint
 * Only accept valid 2-letter uppercase country codes
 */
function validateRegionHint(raw: string | null | undefined, requestId: string): string | null {
    if (!raw) return null;

    const trimmed = raw.trim().toUpperCase();

    // Must be exactly 2 uppercase letters
    const isValid = /^[A-Z]{2}$/.test(trimmed);

    if (!isValid) {
        logger.warn({
            requestId,
            pipelineVersion: 'route2',
            event: 'base_filters_invalid_region_hint',
            raw,
            normalized: null,
            reason: 'not_2_letter_code'
        }, '[ROUTE2] Invalid regionHint rejected');

        return null;
    }

    return trimmed;
}

/**
 * Resolve base filters using LLM
 * 
 * @param query User query
 * @param route Intent route decision
 * @param llmProvider LLM provider
 * @param requestId Request ID for logging
 * @param traceId Optional trace ID
 * @param sessionId Optional session ID
 * @returns PreGoogleBaseFilters
 */
export async function resolveBaseFiltersLLM(params: {
    query: string;
    route: MappingRoute;
    llmProvider: LLMProvider;
    requestId: string;
    traceId?: string;
    sessionId?: string;
}): Promise<PreGoogleBaseFilters> {
    const { query, route, llmProvider, requestId, traceId, sessionId } = params;
    const startTime = Date.now();

    logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'base_filters_llm_started',
        query,
        route
    }, '[ROUTE2] Base filters LLM started');

    try {
        const messages: Message[] = [
            { role: 'system', content: BASE_FILTERS_PROMPT },
            { role: 'user', content: query }
        ];

        const result = await llmProvider.completeJSON(
            messages,
            PreGoogleBaseFiltersSchema,
            {
                temperature: 0,
                timeout: 3000,
                promptVersion: BASE_FILTERS_LLM_VERSION,
                promptHash: BASE_FILTERS_PROMPT_HASH,
                promptLength: BASE_FILTERS_PROMPT.length,
                schemaHash: BASE_FILTERS_SCHEMA_HASH,
                ...(traceId && { traceId }),
                ...(sessionId && { sessionId }),
                ...(requestId && { requestId }),
                stage: 'base_filters_llm'
            },
            BASE_FILTERS_JSON_SCHEMA
        );

        // Validate and sanitize regionHint
        const validatedRegionHint = validateRegionHint(result.regionHint, requestId);

        const validatedResult: PreGoogleBaseFilters = {
            language: result.language,
            openState: result.openState,
            regionHint: validatedRegionHint
        };

        const durationMs = Date.now() - startTime;

        logger.info({
            requestId,
            pipelineVersion: 'route2',
            event: 'base_filters_llm_completed',
            durationMs,
            language: validatedResult.language,
            openState: validatedResult.openState,
            regionHint: validatedResult.regionHint || null,
            ...(result.regionHint !== validatedResult.regionHint && {
                regionHintSanitized: true,
                rawRegionHint: result.regionHint
            })
        }, '[ROUTE2] Base filters LLM completed');

        return validatedResult;

    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : 'unknown';
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('abort');
        const isZodError = errorMsg.includes('ZodError') || errorMsg.includes('validation');

        logger.info({
            requestId,
            pipelineVersion: 'route2',
            event: 'base_filters_fallback',
            durationMs,
            reason: isTimeout ? 'timeout' : isZodError ? 'validation_error' : 'error',
            error: errorMsg
        }, '[ROUTE2] Base filters LLM fallback');

        // Return fallback - NEVER throw
        return createFallbackFilters();
    }
}
