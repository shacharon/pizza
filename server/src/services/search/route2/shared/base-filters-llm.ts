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

Output ONLY JSON with ALL 8 fields (NEVER omit any field):
{
  "language": "he|en|auto",
  "openState": "OPEN_NOW"|"CLOSED_NOW"|"OPEN_AT"|"OPEN_BETWEEN"|null,
  "openAt": {"day": number|null, "timeHHmm": "HH:mm"|null, "timezone": string|null} or null,
  "openBetween": {"day": number|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null, "timezone": string|null} or null,
  "regionHint": "XX"|null,
  "priceIntent": "CHEAP"|"MID"|"EXPENSIVE"|null,
  "minRatingBucket": "R35"|"R40"|"R45"|null,
  "minReviewCountBucket": "C25"|"C100"|"C500"|null
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

- openBetween (set to null UNLESS openState="OPEN_BETWEEN"):
  * When openState="OPEN_BETWEEN", return object with ALL keys:
    {"day": 0-6|null, "startHHmm": "HH:mm"|null, "endHHmm": "HH:mm"|null, "timezone": null}

- regionHint: 2 uppercase letters OR null (country only, not cities)

- priceIntent (default: null):
  * "CHEAP" if: "זול", "זולות", "לא יקר", "בתקציב", "מחירים נמוכים", "cheap", "not expensive", "budget", "affordable", "inexpensive"
  * "MID" if: "בינוני", "בינונית", "אמצע", "mid", "moderate", "medium price", "reasonable"
  * "EXPENSIVE" if: "יקר", "יקרות", "יוקרתי", "יוקרה", "expensive", "luxury", "upscale", "fine dining", "high-end"
  * null otherwise (no explicit price preference)

- minRatingBucket (default: null):
  * "R35" if: "לפחות 3.5", "סביר", "decent", "3.5+", "3.5 stars", "above 3.5"
  * "R40" if: "דירוג גבוה", "מעל 4", "4 כוכבים", "high rated", "4+ stars", "4 stars", "above 4"
  * "R45" if: "מעל 4.5", "הכי טובים", "מצוין", "top rated", "4.5+", "4.5 stars", "best rated", "excellent"
  * null if no explicit rating preference OR user says "not important" / "לא חשוב" / "בלי דירוג"

- minReviewCountBucket (default: null):
  * "C25" if: "קצת ביקורות", "לא חדש", "כמה ביקורות", "some reviews", "not brand new", "a few reviews", "at least some reviews"
  * "C100" if: "הרבה ביקורות", "מקום מוכר", "מקומות מוכרים", "popular", "well known", "established", "many reviews", "lots of reviews"
  * "C500" if: "מאוד מוכר", "כולם מכירים", "מאות ביקורות", "very popular", "very well known", "hundreds of reviews", "extremely popular", "everyone knows"
  * null if no explicit review count preference OR no mention of popularity/reviews
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
        },
        priceIntent: {
            anyOf: [
                { type: 'null' },
                { type: 'string', enum: ['CHEAP', 'MID', 'EXPENSIVE'] }
            ]
        },
        minRatingBucket: {
            anyOf: [
                { type: 'null' },
                { type: 'string', enum: ['R35', 'R40', 'R45'] }
            ]
        },
        minReviewCountBucket: {
            anyOf: [
                { type: 'null' },
                { type: 'string', enum: ['C25', 'C100', 'C500'] }
            ]
        }
    },
    required: ['language', 'openState', 'openAt', 'openBetween', 'regionHint', 'priceIntent', 'minRatingBucket', 'minReviewCountBucket'],
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
        regionHint: null,
        priceIntent: null,
        minRatingBucket: null,
        minReviewCountBucket: null
    };
}

/**
 * Deterministic guard: Check if query contains any constraints that require LLM inference
 * Returns true if LLM should run, false if we can skip it
 */
function canRunBaseFilters(query: string): boolean {
    const normalized = query.toLowerCase();

    // Check for opening hours / time constraints
    const hasTimeConstraints =
        // Hebrew time patterns
        /פתוח|סגור|עכשיו|ב-\d{2}:\d{2}|בין \d/.test(normalized) ||
        // English time patterns
        /\bopen|\bclosed|\bnow\b|at \d|\d\s*(am|pm)|between \d/.test(normalized);

    // Check for price intent
    const hasPriceIntent =
        // Hebrew price patterns
        /זול|יקר|בתקציב|מחיר|יוקר/.test(normalized) ||
        // English price patterns
        /\bcheap|\bexpensive|\bbudget|\baffordable|\bluxury|\bupscale|\bhigh-end/.test(normalized);

    // Check for rating / review constraints
    const hasRatingConstraints =
        // Hebrew rating patterns
        /דירוג|כוכב|ביקור|מומלץ|הכי טוב|מצוין/.test(normalized) ||
        // English rating patterns
        /\brating|\bstar|\breview|\brecommended|\bbest\b|\btop rated|\bexcellent|\bhigh rated/.test(normalized);

    // Check for explicit region hints (country names, not cities)
    // This is a basic check - complex region inference still needs LLM
    const hasExplicitRegion =
        // Common country patterns (not exhaustive)
        /\bin israel|\bin france|\bin italy|\bin spain|\bin uk\b|\bin usa\b|\bin japan/.test(normalized) ||
        /בישראל|בצרפת|באיטליה|בספרד|ביפן/.test(normalized);

    return hasTimeConstraints || hasPriceIntent || hasRatingConstraints || hasExplicitRegion;
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

    // Deterministic guard: Skip LLM if query has no constraints to infer
    if (!canRunBaseFilters(query)) {
        logger.info(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'base_filters_skipped',
                reason: 'no_constraints',
                query,
                route
            },
            '[ROUTE2] Base filters LLM skipped - no constraints detected in query'
        );

        return {
            language: 'auto',
            openState: null,
            openAt: null,
            openBetween: null,
            regionHint: null,
            priceIntent: null,
            minRatingBucket: null,
            minReviewCountBucket: null
        };
    }

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

        // CRITICAL: IGNORE language from LLM - language MUST come from upstream (Gate2/Intent) ONLY
        // base_filters_llm should NEVER influence language decisions
        const validatedResult: PreGoogleBaseFilters = {
            language: 'auto', // Always 'auto' - real language comes from filters_resolved
            openState: result.openState,
            openAt: result.openAt,
            openBetween: result.openBetween,
            regionHint: validatedRegionHint,
            priceIntent: result.priceIntent,
            minRatingBucket: result.minRatingBucket,
            minReviewCountBucket: result.minReviewCountBucket
        };

        const durationMs = Date.now() - startTime;

        logger.info(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'base_filters_llm_completed',
                durationMs,
                language: validatedResult.language, // Always 'auto' - real language from upstream
                languageIgnored: true, // Language from LLM is ignored
                llmLanguage: result.language, // What LLM returned (for debugging only)
                openState: validatedResult.openState,
                openAt: validatedResult.openAt,
                openBetween: validatedResult.openBetween,
                priceIntent: validatedResult.priceIntent,
                minRatingBucket: validatedResult.minRatingBucket,
                minReviewCountBucket: validatedResult.minReviewCountBucket,
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
            '[ROUTE2] Base filters LLM completed (language ignored - from upstream only)'
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
