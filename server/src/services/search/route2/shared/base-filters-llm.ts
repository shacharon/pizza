/**
 * Base Filters LLM - Route2 Pipeline
 *
 * Fast LLM call to determine PreGoogleBaseFilters
 * Timeout: 900ms
 */

import { createHash } from 'crypto';
import type { Message, LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../lib/llm/index.js';
import { PreGoogleBaseFiltersSchema, type PreGoogleBaseFilters } from './shared-filters.types.js';
import type { MappingRoute } from '../types.js';

const BASE_FILTERS_LLM_VERSION = 'base_filters_v1';

const BASE_FILTERS_PROMPT = `You are a filter extractor for restaurant search queries.

Output ONLY JSON with ALL 5 fields (NEVER omit any field):
{
  "language": "he|en|auto",
  "openState": "OPEN_NOW"|"CLOSED_NOW"|"OPEN_AT"|"OPEN_BETWEEN"|null,
  "openAt": {"day": number|null, "timeHHmm": "HH:mm"|null, "timezone": string|null} or null,
  "openBetween": {"day": number|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null, "timezone": string|null} or null,
  "regionHint": "XX"|null
}

CRITICAL: When openAt or openBetween is an object, ALL 3-4 keys MUST be present (use null for missing values).

RULES:
- language: "he" (Hebrew), "en" (English), "auto" (mixed/other)

- openState (default: null):
  * "OPEN_NOW" if: "פתוחות עכשיו", "פתוח עכשיו", "open now", "currently open"
  * "CLOSED_NOW" if: "סגורות עכשיו", "סגורות", "סגור עכשיו", "closed now", "closed"
  * "OPEN_AT" if specific time: "פתוח ב-21:30", "open at 9pm"
  * "OPEN_BETWEEN" if time range: "פתוח בין 18:00 ל-22:00", "open 6-10pm"
  * null otherwise

- openAt (set to null UNLESS openState="OPEN_AT"):
  * When openState="OPEN_AT", return object with ALL keys:
    {"day": 0-6|null, "timeHHmm": "HH:mm"|null, "timezone": null}
  * day: 0=Sunday, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat (null if not specified)
  * timeHHmm: "HH:mm" format (e.g., "21:30", "09:00") - null if can't extract
  * timezone: always null (we use local time)
  * Examples:
    - "פתוח ב-21:30" → {"day":null, "timeHHmm":"21:30", "timezone":null}
    - "פתוח מחר ב-20:00" → {"day":<tomorrow>, "timeHHmm":"20:00", "timezone":null}
    - "פתוח ביום שישי בשעה 19:00" → {"day":5, "timeHHmm":"19:00", "timezone":null}

- openBetween (set to null UNLESS openState="OPEN_BETWEEN"):
  * When openState="OPEN_BETWEEN", return object with ALL keys:
    {"day": 0-6|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null, "timezone": null}
  * Examples:
    - "פתוח בין 18:00 ל-22:00" → {"day":null, "startHHmm":"18:00", "endHHmm":"22:00", "timezone":null}
    - "open 6-10pm Friday" → {"day":5, "startHHmm":"18:00", "endHHmm":"22:00", "timezone":null}

- regionHint: 2 uppercase letters OR null (country only, not cities)

Examples:
- "מסעדות פתוחות עכשיו" → {"language":"he","openState":"OPEN_NOW","openAt":null,"openBetween":null,"regionHint":null}
- "מסעדות סגורות לידי" → {"language":"he","openState":"CLOSED_NOW","openAt":null,"openBetween":null,"regionHint":null}
- "פתוח ב-21:30 בגדרה" → {"language":"he","openState":"OPEN_AT","openAt":{"day":null,"timeHHmm":"21:30","timezone":null},"openBetween":null,"regionHint":null}
- "פיצה בתל אביב" → {"language":"he","openState":null,"openAt":null,"openBetween":null,"regionHint":null}
`;

const BASE_FILTERS_PROMPT_HASH = createHash('sha256')
    .update(BASE_FILTERS_PROMPT, 'utf8')
    .digest('hex');

// Manual JSON Schema for OpenAI strict mode compatibility
// Zod v4's toJSONSchema() generates 'nullable: true' inside anyOf which OpenAI rejects
const BASE_FILTERS_JSON_SCHEMA_MANUAL = {
    type: 'object',
    properties: {
        language: {
            type: 'string',
            enum: ['he', 'en', 'auto']
        },
        openState: {
            anyOf: [
                { type: 'null' },
                { type: 'string', enum: ['OPEN_NOW', 'CLOSED_NOW', 'OPEN_AT', 'OPEN_BETWEEN'] }
            ]
        },
        openAt: {
            anyOf: [
                { type: 'null' },
                {
                    type: 'object',
                    properties: {
                        day: { anyOf: [{ type: 'null' }, { type: 'integer', minimum: 0, maximum: 6 }] },
                        timeHHmm: { anyOf: [{ type: 'null' }, { type: 'string', pattern: '^\\d\\d:\\d\\d$' }] },
                        timezone: { anyOf: [{ type: 'null' }, { type: 'string' }] }
                    },
                    required: ['day', 'timeHHmm', 'timezone'],
                    additionalProperties: false
                }
            ]
        },
        openBetween: {
            anyOf: [
                { type: 'null' },
                {
                    type: 'object',
                    properties: {
                        day: { anyOf: [{ type: 'null' }, { type: 'integer', minimum: 0, maximum: 6 }] },
                        startHHmm: { anyOf: [{ type: 'null' }, { type: 'string', pattern: '^\\d\\d:\\d\\d$' }] },
                        endHHmm: { anyOf: [{ type: 'null' }, { type: 'string', pattern: '^\\d\\d:\\d\\d$' }] },
                        timezone: { anyOf: [{ type: 'null' }, { type: 'string' }] }
                    },
                    required: ['day', 'startHHmm', 'endHHmm', 'timezone'],
                    additionalProperties: false
                }
            ]
        },
        regionHint: {
            anyOf: [
                { type: 'null' },
                { type: 'string', minLength: 2, maxLength: 2 }
            ]
        }
    },
    required: ['language', 'openState', 'openAt', 'openBetween', 'regionHint'],
    additionalProperties: false
};

const BASE_FILTERS_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(BASE_FILTERS_JSON_SCHEMA_MANUAL), 'utf8')
    .digest('hex')
    .slice(0, 12);

/**
 * Fallback filters when LLM fails
 */
function createFallbackFilters(): PreGoogleBaseFilters {
    return {
        language: 'auto',
        openState: null,
        openAt: null,
        openBetween: null,
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
    const isValid = /^[A-Z]{2}$/.test(trimmed);

    if (!isValid) {
        logger.warn(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'base_filters_invalid_region_hint',
                raw,
                normalized: null,
                reason: 'not_2_letter_code'
            },
            '[ROUTE2] Invalid regionHint rejected'
        );
        return null;
    }

    return trimmed;
}

/**
 * Resolve base filters using LLM
 * Single source of truth for SearchFilters (openState, language, regionHint)
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

    logger.info(
        {
            requestId,
            pipelineVersion: 'route2',
            event: 'base_filters_llm_started',
            query,
            route
        },
        '[ROUTE2] Base filters LLM started'
    );

    try {
        // Resolve model and timeout for baseFilters purpose
        const { model, timeoutMs } = resolveLLM('baseFilters');

        const messages: Message[] = [
            { role: 'system', content: BASE_FILTERS_PROMPT },
            { role: 'user', content: query }
        ];

        const response = await llmProvider.completeJSON(
            messages,
            PreGoogleBaseFiltersSchema,
            {
                model,
                temperature: 0,
                timeout: timeoutMs,
                promptVersion: BASE_FILTERS_LLM_VERSION,
                promptHash: BASE_FILTERS_PROMPT_HASH,
                promptLength: BASE_FILTERS_PROMPT.length,
                schemaHash: BASE_FILTERS_SCHEMA_HASH,
                ...(traceId && { traceId }),
                ...(sessionId && { sessionId }),
                ...(requestId && { requestId }),
                stage: 'base_filters_llm'
            },
            BASE_FILTERS_JSON_SCHEMA_MANUAL // Use manual schema for OpenAI strict mode compatibility
        );

        const result = response.data;
        const validatedRegionHint = validateRegionHint(result.regionHint, requestId);

        const validatedResult: PreGoogleBaseFilters = {
            language: result.language,
            openState: result.openState,
            openAt: result.openAt,
            openBetween: result.openBetween,
            regionHint: validatedRegionHint
        };

        const durationMs = Date.now() - startTime;

        logger.info(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'base_filters_llm_completed',
                durationMs,
                language: validatedResult.language,
                openState: validatedResult.openState,
                openAt: validatedResult.openAt,
                openBetween: validatedResult.openBetween,
                regionHint: validatedResult.regionHint ?? null,
                ...(result.regionHint !== validatedResult.regionHint && {
                    regionHintSanitized: true,
                    rawRegionHint: result.regionHint
                }),
                tokenUsage: {
                    ...(response.usage?.prompt_tokens !== undefined && { input: response.usage.prompt_tokens }),
                    ...(response.usage?.completion_tokens !== undefined && { output: response.usage.completion_tokens }),
                    ...(response.usage?.total_tokens !== undefined && { total: response.usage.total_tokens }),
                    ...(response.model !== undefined && { model: response.model })
                }
            },
            '[ROUTE2] Base filters LLM completed'
        );

        return validatedResult;
    } catch (error) {
        const durationMs = Date.now() - startTime;
        const errorMsg = error instanceof Error ? error.message : 'unknown';
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('abort');
        const isZodError = errorMsg.includes('ZodError') || errorMsg.includes('validation');

        logger.warn(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'base_filters_fallback',
                durationMs,
                reason: isTimeout ? 'timeout' : isZodError ? 'validation_error' : 'error',
                error: errorMsg
            },
            '[ROUTE2] Base filters LLM fallback'
        );

        return createFallbackFilters();
    }
}
