/**
 * Filters Resolver - Route2 Pipeline
 * 
 * Resolves base filters to final filters (simple passthrough + language resolution)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared-filters.types.js';
import type { IntentResult } from '../types.js';
import { sanitizeRegionCode, getFallbackRegion, isKnownUnsupportedRegion } from '../utils/region-code-validator.js';

export interface ResolveFiltersParams {
    base: PreGoogleBaseFilters;
    intent: IntentResult;
    deviceRegionCode?: string | null;
    userLocation?: { lat: number; lng: number } | null;
    requestId?: string;
}

/**
 * Resolve base filters to final filters
 * Simple passthrough with minimal logic + region code validation
 */
export async function resolveFilters(params: ResolveFiltersParams): Promise<FinalSharedFilters> {
    const { base, intent, deviceRegionCode, userLocation, requestId } = params;

    // 1. Resolve UI language (he or en only)
    const uiLanguage: 'he' | 'en' = intent.language === 'he' ? 'he' : 'en';

    // 2. Resolve provider language (preserve intent language)
    const providerLanguage: 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru' =
        ['he', 'en', 'ar', 'fr', 'es', 'ru'].includes(intent.language)
            ? intent.language as any
            : 'he'; // fallback

    // 3. Resolve region code (intent candidate > device > default)
    const rawRegionCode = intent.regionCandidate || deviceRegionCode || 'IL';

    // 4. Sanitize region code (validate against CLDR, handle 'GZ' special case)
    const sanitizedRegionCode = sanitizeRegionCode(rawRegionCode, userLocation);

    // 5. Log if region was sanitized/rejected
    // NOISE FIX: Only log when sanitization actually changed the value
    // Skip logging if intent.regionCandidate was null (no candidate to validate)
    const shouldLogSanitization = sanitizedRegionCode !== rawRegionCode && intent.regionCandidate !== null;
    
    if (shouldLogSanitization) {
        const fallback = sanitizedRegionCode || getFallbackRegion(rawRegionCode, userLocation);

        const logData = {
            requestId,
            pipelineVersion: 'route2',
            event: 'region_sanitized',
            regionCode: rawRegionCode,
            sanitized: fallback || 'null',
            source: intent.regionCandidate ? 'intent_candidate' : (deviceRegionCode ? 'device' : 'default')
        };

        if (isKnownUnsupportedRegion(rawRegionCode)) {
            // Debug level for expected cases (reduces noise)
            logger.debug(logData, '[ROUTE2] Known unsupported region sanitized (e.g., GZ)');
        } else {
            // Info level for unexpected invalid regions (helps catch bugs)
            logger.info(logData, '[ROUTE2] Unexpected region code sanitized');
        }
    }

    // 6. Pass through openState + time filters + priceIntent + minRatingBucket + minReviewCountBucket (NO MODIFICATION)
    const openState = base.openState;
    const openAt = base.openAt;
    const openBetween = base.openBetween;
    const priceIntent = base.priceIntent;
    const minRatingBucket = base.minRatingBucket;
    const minReviewCountBucket = base.minReviewCountBucket;

    const finalFilters: FinalSharedFilters = {
        uiLanguage,
        providerLanguage,
        openState,
        openAt,
        openBetween,
        priceIntent,
        minRatingBucket,
        minReviewCountBucket,
        regionCode: sanitizedRegionCode || 'IL', // Fallback to IL if null
        disclaimers: {
            hours: true,
            dietary: true
        }
    };

    logger.info({
        requestId,
        pipelineVersion: 'route2',
        event: 'filters_resolved',
        base: {
            language: base.language,
            openState: base.openState,
            openAt: base.openAt,
            openBetween: base.openBetween,
            priceIntent: base.priceIntent,
            minRatingBucket: base.minRatingBucket,
            regionHint: base.regionHint
        },
        final: {
            uiLanguage: finalFilters.uiLanguage,
            providerLanguage: finalFilters.providerLanguage,
            openState: finalFilters.openState,
            openAt: finalFilters.openAt,
            openBetween: finalFilters.openBetween,
            priceIntent: finalFilters.priceIntent,
            minRatingBucket: finalFilters.minRatingBucket,
            regionCode: finalFilters.regionCode
        },
        sanitized: sanitizedRegionCode !== rawRegionCode
    }, '[ROUTE2] Filters resolved');

    return finalFilters;
}
