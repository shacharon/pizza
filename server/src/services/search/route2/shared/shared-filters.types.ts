/**
 * Shared Filters for Route2 Pipeline
 *
 * Pre-Google Base Filters: Applied before Google API call
 * Final Shared Filters: Applied after Google results, passed to client
 */

import { z } from 'zod';

/**
 * Open/Closed state filter
 * - null: no filtering (default)
 * - OPEN_NOW: currently open
 * - CLOSED_NOW: currently closed
 * - OPEN_AT: open at specific time
 * - OPEN_BETWEEN: open during time range
 */
export const OpenStateSchema = z.enum(['OPEN_NOW', 'CLOSED_NOW', 'OPEN_AT', 'OPEN_BETWEEN']).nullable();
export type OpenState = z.infer<typeof OpenStateSchema>;

/**
 * Time filter for OPEN_AT (non-nullable version)
 * All fields use union with null for OpenAI strict mode compatibility
 */
const OpenAtObjectSchema = z.object({
    day: z.union([z.null(), z.number().int().min(0).max(6)]), // 0=Sunday, 6=Saturday
    timeHHmm: z.union([z.null(), z.string().regex(/^\d\d:\d\d$/)]),
    timezone: z.union([z.null(), z.string()])
}).strict();

/**
 * OpenAt can be null or an object with all required fields
 */
export const OpenAtSchema = z.union([z.null(), OpenAtObjectSchema]);
export type OpenAt = z.infer<typeof OpenAtSchema>;

/**
 * Time range filter for OPEN_BETWEEN (non-nullable version)
 * All fields use union with null for OpenAI strict mode compatibility
 */
const OpenBetweenObjectSchema = z.object({
    day: z.union([z.null(), z.number().int().min(0).max(6)]),
    startHHmm: z.union([z.null(), z.string().regex(/^\d\d:\d\d$/)]),
    endHHmm: z.union([z.null(), z.string().regex(/^\d\d:\d\d$/)]),
    timezone: z.union([z.null(), z.string()])
}).strict();

/**
 * OpenBetween can be null or an object with all required fields
 */
export const OpenBetweenSchema = z.union([z.null(), OpenBetweenObjectSchema]);
export type OpenBetween = z.infer<typeof OpenBetweenSchema>;

/**
 * Price Intent (extracted from query text)
 * - CHEAP: "זול", "cheap", "inexpensive", "budget"
 * - MID: implied middle range
 * - EXPENSIVE: "יקר", "יקרה", "expensive", "fancy", "upscale"
 * - null: no price intent mentioned
 */
export const PriceIntentSchema = z.enum(['CHEAP', 'MID', 'EXPENSIVE']).nullable();
export type PriceIntent = z.infer<typeof PriceIntentSchema>;

/**
 * Pre-Google Base Filters
 *
 * Applied before calling Google Places API
 * 
 * IMPORTANT - Language Field:
 * - language field is INFORMATIONAL ONLY (used for logging and filter extraction context)
 * - DEPRECATED for decision-making: use intent.language instead
 * - intent.language is the SINGLE SOURCE OF TRUTH for all language decisions
 * - This field exists for historical reasons and filter extraction context
 * - It is NOT used in final filters derivation or assistant language resolution
 * 
 * Other fields:
 * - regionHint is optional but must be in schema as nullable
 * - openState: null unless explicitly requested
 * - priceIntent: extracted from query text (e.g., "זול", "יקר")
 * - priceLevels: Google price level mapping (1-4 scale)
 */
export const PreGoogleBaseFiltersSchema = z.object({
    language: z.enum(['he', 'en', 'auto']), // DEPRECATED: Use intent.language for decisions
    openState: OpenStateSchema,
    openAt: OpenAtSchema,
    openBetween: OpenBetweenSchema,
    regionHint: z.string().length(2).toUpperCase().nullable(),
    priceIntent: PriceIntentSchema,
    priceLevels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])).nullable()
});

export type PreGoogleBaseFilters = z.infer<typeof PreGoogleBaseFiltersSchema>;

/**
 * Price level range (for filtering)
 */
export const PriceLevelRangeSchema = z.object({
    min: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    max: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
}).optional();

export type PriceLevelRange = z.infer<typeof PriceLevelRangeSchema>;

/**
 * Final Shared Filters
 *
 * Tightened filters passed to client with results
 * - uiLanguage: resolved UI language (he|en only)
 * - providerLanguage: language for API provider calls (preserves intent languages like fr, es, ar, ru)
 * - openState: null unless explicitly requested
 * - priceIntent: extracted from base_filters (CHEAP/MID/EXPENSIVE)
 * - priceLevels: Google price levels array (1-4)
 * - priceLevel: optional price constraint (1-4) - from post-constraints
 * - priceLevelRange: optional price range constraint (min-max) - from post-constraints
 * - regionCode is required and uppercase ISO-3166-1 alpha-2
 * - disclaimers always present
 */
export const FinalSharedFiltersSchema = z.object({
    uiLanguage: z.enum(['he', 'en']),
    providerLanguage: z.enum(['he', 'en', 'ar', 'fr', 'es', 'ru']),
    openState: OpenStateSchema,
    openAt: OpenAtSchema,
    openBetween: OpenBetweenSchema,
    priceIntent: PriceIntentSchema,
    priceLevels: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])).nullable(),
    priceLevel: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    priceLevelRange: PriceLevelRangeSchema,
    regionCode: z.string().length(2).toUpperCase(),
    disclaimers: z.object({
        hours: z.literal(true),
        dietary: z.literal(true)
    })
});

export type FinalSharedFilters = z.infer<typeof FinalSharedFiltersSchema>;
