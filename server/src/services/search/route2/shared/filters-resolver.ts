/**
 * Filters Resolver - Route2 Pipeline
 * 
 * Resolves base filters to final filters (simple passthrough + language resolution)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared-filters.types.js';
import type { IntentResult } from '../types.js';
import { sanitizeRegionCode, getFallbackRegion, isKnownUnsupportedRegion } from '../utils/region-code-validator.js';
import { resolveLanguageContext } from './language-context.js';
import { detectQueryLanguage } from '../utils/query-language-detector.js';

export interface ResolveFiltersParams {
    base: PreGoogleBaseFilters;
    intent: IntentResult;
    deviceRegionCode?: string | null;
    userLocation?: { lat: number; lng: number } | null;
    requestId?: string;
    query?: string; // For deterministic query language detection
}

/**
 * Resolve base filters to final filters
 * Simple passthrough with minimal logic + region code validation
 */
export async function resolveFilters(params: ResolveFiltersParams): Promise<FinalSharedFilters> {
    const { base, intent, deviceRegionCode, userLocation, requestId, query } = params;

    // 1. Resolve query language with LLM-first policy
    // PRIORITY (highest to lowest):
    // a) intentLanguage from LLM with high confidence (>= 0.7)
    // b) detectQueryLanguage deterministic detector (limited to he/en)
    // c) Fallback to 'en'
    let queryLanguage: 'he' | 'en' | 'es' | 'ru' | 'ar' | 'fr';
    const INTENT_LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

    // Priority 1: Use intentLanguage if confidence is high (LLM detected language)
    if (intent.language && intent.languageConfidence !== undefined && intent.languageConfidence >= INTENT_LANGUAGE_CONFIDENCE_THRESHOLD) {
        const supportedLangs = ['he', 'en', 'es', 'ru', 'ar', 'fr'];
        if (supportedLangs.includes(intent.language)) {
            queryLanguage = intent.language as any;
        } else {
            // Unsupported language, fallback to deterministic or 'en'
            queryLanguage = query ? detectQueryLanguage(query) : 'en';
        }
    } else if (query) {
        // Priority 2: Use deterministic detector (limited to he/en)
        queryLanguage = detectQueryLanguage(query);
    } else {
        // Priority 3: Fallback to 'en'
        queryLanguage = 'en';
    }

    // 2. NEW POLICY: UI language = query language (what user types drives UX)
    // Limit uiLanguage to he/en for now (UI only supports these two)
    const uiLanguage: 'he' | 'en' = (['he', 'en'].includes(queryLanguage) ? queryLanguage : 'en') as 'he' | 'en';

    // 3. Resolve provider language [DEPRECATED - use languageContext.searchLanguage]
    // Keep for backward compatibility but will be phased out
    const providerLanguage: 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru' =
        ['he', 'en', 'ar', 'fr', 'es', 'ru'].includes(intent.language)
            ? intent.language as any
            : queryLanguage; // fallback to query language

    // 4. Resolve region code (NEW PRIORITY: intent.regionCode > intent.regionCandidate > device > default)
    // LLM-FIRST: Query semantics drive region selection
    const intentRegionCode = (intent as any).regionCode; // Type assertion for new field
    let rawRegionCode: string;
    let regionSource: 'intent_query' | 'intent_candidate' | 'device' | 'default';

    if (intentRegionCode) {
        rawRegionCode = intentRegionCode;
        regionSource = 'intent_query';
    } else if (intent.regionCandidate) {
        rawRegionCode = intent.regionCandidate;
        regionSource = 'intent_candidate';
    } else if (deviceRegionCode) {
        rawRegionCode = deviceRegionCode;
        regionSource = 'device';
    } else {
        rawRegionCode = 'IL';
        regionSource = 'default';
    }

    // 5. Sanitize region code (validate against CLDR, handle 'GZ' special case)
    const sanitizedRegionCode = sanitizeRegionCode(rawRegionCode, userLocation);

    // 6. Log region resolution (NEW: Includes query-inferred region)
    if (intentRegionCode) {
        logger.info({
            requestId,
            pipelineVersion: 'route2',
            event: 'region_resolved_from_intent',
            regionCode: intentRegionCode,
            sanitized: sanitizedRegionCode || 'null',
            source: 'intent_query',
            query: query?.substring(0, 50) || 'n/a'
        }, '[ROUTE2] Region inferred from query semantics (LLM)');
    }

    // 7. Log if region was sanitized/rejected
    // NOISE FIX: Only log when sanitization actually changed the value
    // Skip logging if intent.regionCandidate was null (no candidate to validate)
    const shouldLogSanitization = sanitizedRegionCode !== rawRegionCode && intent.regionCandidate !== null && !intentRegionCode;

    if (shouldLogSanitization) {
        const fallback = sanitizedRegionCode || getFallbackRegion(rawRegionCode, userLocation);

        const logData = {
            requestId,
            pipelineVersion: 'route2',
            event: 'region_sanitized',
            regionCode: rawRegionCode,
            sanitized: fallback || 'null',
            source: regionSource
        };

        if (isKnownUnsupportedRegion(rawRegionCode)) {
            // Debug level for expected cases (reduces noise)
            logger.debug(logData, '[ROUTE2] Known unsupported region sanitized (e.g., GZ)');
        } else {
            // Info level for unexpected invalid regions (helps catch bugs)
            logger.info(logData, '[ROUTE2] Unexpected region code sanitized');
        }
    }

    // 7. Resolve language context with strict query-language policy
    const languageContext = resolveLanguageContext({
        uiLanguage,
        queryLanguage,
        regionCode: sanitizedRegionCode || 'IL',
        cityText: intent.cityText,
        intentLanguage: intent.language,
        intentLanguageConfidence: intent.languageConfidence
    }, requestId);

    // 9. Pass through openState + time filters + priceIntent + minRatingBucket + minReviewCountBucket (NO MODIFICATION)
    const openState = base.openState;
    const openAt = base.openAt;
    const openBetween = base.openBetween;
    const priceIntent = base.priceIntent;
    const minRatingBucket = base.minRatingBucket;
    const minReviewCountBucket = base.minReviewCountBucket;

    const finalFilters: FinalSharedFilters = {
        uiLanguage,
        providerLanguage,  // DEPRECATED - use languageContext.searchLanguage instead
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
        },
        languageContext  // NEW: Strict language separation
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
