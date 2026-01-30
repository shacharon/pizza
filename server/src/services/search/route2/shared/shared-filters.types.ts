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
 * Price intent filter
 * - null: no filtering (default)
 * - CHEAP: budget-friendly (priceLevel 1)
 * - MID: moderate pricing (priceLevel 2)
 * - EXPENSIVE: upscale/luxury (priceLevel 3-4)
 */
export const PriceIntentSchema = z.enum(['CHEAP', 'MID', 'EXPENSIVE']).nullable();
export type PriceIntent = z.infer<typeof PriceIntentSchema>;

/**
 * Minimum rating bucket filter
 * - null: no filtering (default)
 * - R35: minimum rating 3.5+
 * - R40: minimum rating 4.0+
 * - R45: minimum rating 4.5+
 */
export const MinRatingBucketSchema = z.enum(['R35', 'R40', 'R45']).nullable();
export type MinRatingBucket = z.infer<typeof MinRatingBucketSchema>;

/**
 * Minimum review count bucket filter
 * - null: no filtering (default)
 * - C25: minimum 25 reviews (some reviews, not brand new)
 * - C100: minimum 100 reviews (well-known, established)
 * - C500: minimum 500 reviews (very popular, widely known)
 */
export const MinReviewCountBucketSchema = z.enum(['C25', 'C100', 'C500']).nullable();
export type MinReviewCountBucket = z.infer<typeof MinReviewCountBucketSchema>;

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
 * Pre-Google Base Filters
 *
 * Applied before calling Google Places API
 * - language can be 'auto' (will be resolved before final)
 * - regionHint is optional but must be in schema as nullable
 * - openState: null unless explicitly requested
 * - priceIntent: null unless explicitly requested
 * - minRatingBucket: null unless explicitly requested
 * - minReviewCountBucket: null unless explicitly requested
 */
export const PreGoogleBaseFiltersSchema = z.object({
    language: z.enum(['he', 'en', 'auto']),
    openState: OpenStateSchema,
    openAt: OpenAtSchema,
    openBetween: OpenBetweenSchema,
    regionHint: z.string().length(2).toUpperCase().nullable(),
    priceIntent: PriceIntentSchema,
    minRatingBucket: MinRatingBucketSchema,
    minReviewCountBucket: MinReviewCountBucketSchema
});

export type PreGoogleBaseFilters = z.infer<typeof PreGoogleBaseFiltersSchema>;

/**
 * Final Shared Filters
 *
 * Tightened filters passed to client with results
 * - uiLanguage: resolved UI language (he|en only)
 * - providerLanguage: language for API provider calls (preserves intent languages like fr, es, ar, ru)
 * - openState: null unless explicitly requested
 * - priceIntent: null unless explicitly requested
 * - minRatingBucket: null unless explicitly requested
 * - minReviewCountBucket: null unless explicitly requested
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
    minRatingBucket: MinRatingBucketSchema,
    minReviewCountBucket: MinReviewCountBucketSchema,
    regionCode: z.string().length(2).toUpperCase(),
    disclaimers: z.object({
        hours: z.literal(true),
        dietary: z.literal(true)
    })
});

export type FinalSharedFilters = z.infer<typeof FinalSharedFiltersSchema>;
