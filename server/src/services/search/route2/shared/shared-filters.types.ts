/**
 * Shared Filters for Route2 Pipeline
 * 
 * Pre-Google Base Filters: Applied before Google API call
 * Final Shared Filters: Applied after Google results, passed to client
 */

import { z } from 'zod';

/**
 * Pre-Google Base Filters
 * 
 * Applied before calling Google Places API
 * - language can be 'auto' (will be resolved before final)
 * - regionHint is optional but must be in schema as nullable
 * - openNow boolean filter
 */
export const PreGoogleBaseFiltersSchema = z.object({
    language: z.enum(['he', 'en', 'auto']),
    openNow: z.boolean(),
    regionHint: z.string().length(2).toUpperCase().nullable()
});

export type PreGoogleBaseFilters = z.infer<typeof PreGoogleBaseFiltersSchema>;

/**
 * Final Shared Filters
 * 
 * Tightened filters passed to client with results
 * - uiLanguage: resolved UI language (he|en only)
 * - providerLanguage: language for API provider calls (preserves intent languages like fr, es, ar, ru)
 * - regionCode is required and uppercase ISO-3166-1 alpha-2
 * - disclaimers always present
 */
export const FinalSharedFiltersSchema = z.object({
    uiLanguage: z.enum(['he', 'en']),
    providerLanguage: z.enum(['he', 'en', 'ar', 'fr', 'es', 'ru']),
    openNow: z.boolean(),
    regionCode: z.string()
        .length(2)
        .toUpperCase(),  // Validate uppercase
    disclaimers: z.object({
        hours: z.literal(true),
        dietary: z.literal(true)
    })
});

export type FinalSharedFilters = z.infer<typeof FinalSharedFiltersSchema>;
