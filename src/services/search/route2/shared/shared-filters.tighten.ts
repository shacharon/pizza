/**
 * Shared Filters Tightening - Route2 Pipeline
 *
 * Deterministic resolution of PreGoogleBaseFilters → FinalSharedFilters
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared-filters.types.js';
import type { Gate2Language, RouteLLMMapping, IntentResult } from '../types.js';

type RegionSource = 'intent_locked' | 'geocode' | 'reverse_geocode' | 'device_region' | 'base_llm' | 'default';
type LanguageSource = 'intent_locked' | 'base_llm' | 'device_default';
type ProviderLanguage = 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru';

const normalizeRegion2 = (value?: string | null): string | null => {
    if (!value) return null;
    const v = value.trim().toUpperCase();
    // Must be exactly 2 uppercase letters (A-Z only)
    return /^[A-Z]{2}$/.test(v) ? v : null;
};

const gateToUiLanguage = (g: Gate2Language): 'he' | 'en' => {
    // IMPORTANT: do not implicitly map non-hebrew values to 'en' (caused your "he->en" bug on fallbacks).
    // Product decision for IL-first MVP: default to 'he' when not explicitly 'en'.
    if (g === 'en') return 'en';
    return 'he';
};

/**
 * Map intent language to UI language ('he' | 'en')
 * Returns null if the language cannot be confidently mapped to he/en
 */
const mapToUiLanguage = (lang: Gate2Language): 'he' | 'en' | null => {
    if (lang === 'he') return 'he';
    if (lang === 'en') return 'en';

    // For other specific languages that should map to 'en' in UI
    if (lang === 'fr' || lang === 'es' || lang === 'ru' || lang === 'ar') {
        return 'en'; // Non-Hebrew languages use English UI
    }

    // For 'other', return null (not confident)
    return null;
};

/**
 * Map intent language to provider language (for API calls)
 * Preserves the exact language when confident
 */
const mapToProviderLanguage = (lang: Gate2Language): ProviderLanguage | null => {
    // Only map confident languages that providers support
    if (lang === 'he' || lang === 'en' || lang === 'ar' || lang === 'fr' || lang === 'es' || lang === 'ru') {
        return lang;
    }

    // For 'other', return null (not confident)
    return null;
};

/**
 * Extract location text from mapping for geocoding
 */
function extractLocationTextFromMapping(mapping: RouteLLMMapping): string | null {
    switch (mapping.providerMethod) {
        case 'textSearch':
            return null; // TODO: Implement text parsing if needed
        case 'landmarkPlan':
            return mapping.geocodeQuery;
        case 'nearbySearch':
            return null;
        default:
            return null;
    }
}

/**
 * Geocode location text to country code
 * Placeholder for actual geocoding implementation
 */
async function geocodeToCountry(locationText: string): Promise<string | null> {
    // TODO: Implement actual geocoding
    return null;
}

/**
 * Reverse geocode coordinates to country code
 * Placeholder for actual reverse geocoding implementation
 */
async function reverseGeocodeToCountry(lat: number, lng: number): Promise<string | null> {
    // TODO: Implement actual reverse geocoding
    return null;
}

/**
 * Tighten base filters to final shared filters
 *
 * Resolution order:
 * - UI Language: intent.language (mapped to he|en) > base.language > deviceDefault
 * - Provider Language: intent.language (preserved exactly) > base.language > deviceDefault
 * - Region: intent.regionCandidate (if confident) > base.regionHint > deviceRegionCode > defaultRegion
 * - Disclaimers: Always {hours:true, dietary:true}
 * 
 * Intent values are "locked" (not overridden) when:
 * - Language: intent.language exists and != "other"
 * - Region: intent.regionCandidate exists and route is LANDMARK/TEXTSEARCH/NEARBY
 */
export async function tightenSharedFilters(params: {
    base: PreGoogleBaseFilters;
    intent: IntentResult;
    mapping: RouteLLMMapping;
    userLocation?: { lat: number; lng: number } | null | undefined;
    deviceRegionCode?: string | null | undefined;
    uiLanguage?: 'he' | 'en';
    gateLanguage: Gate2Language;
    defaultRegion?: string;
    requestId?: string;
}): Promise<{
    filters: FinalSharedFilters;
    regionSource: RegionSource;
    languageSource: LanguageSource;
}> {
    const {
        base,
        intent,
        mapping,
        userLocation,
        deviceRegionCode,
        uiLanguage,
        gateLanguage,
        defaultRegion = 'IL',
        requestId
    } = params;

    // ========================================================================
    // LANGUAGE RESOLUTION
    // ========================================================================
    // Split into two: uiLanguage (he|en) and providerLanguage (he|en|ar|fr|es|ru)
    // Priority 1: Intent language (if confident - not "other")
    // Priority 2: Base LLM language (if valid)
    // Priority 3: Device default

    let resolvedUiLanguage: 'he' | 'en';
    let resolvedProviderLanguage: ProviderLanguage;
    let languageSource: LanguageSource;

    // Map intent language to both UI and provider languages
    const intentUiLanguage = mapToUiLanguage(intent.language);
    const intentProviderLanguage = mapToProviderLanguage(intent.language);

    if (intentProviderLanguage && intent.language !== 'other') {
        // Intent locked: confident language detection
        // Provider language is preserved exactly, UI language is mapped
        resolvedProviderLanguage = intentProviderLanguage;
        resolvedUiLanguage = intentUiLanguage ?? 'en'; // Fallback to 'en' for UI
        languageSource = 'intent_locked';

        logger.info({
            requestId,
            pipelineVersion: 'route2',
            event: 'language_locked_by_intent',
            intentLanguage: intent.language,
            resolvedUiLanguage,
            resolvedProviderLanguage
        }, '[ROUTE2] Language locked by confident intent');
    } else if (base.language === 'he' || base.language === 'en') {
        // Base LLM provided valid language
        resolvedUiLanguage = base.language;
        resolvedProviderLanguage = base.language;
        languageSource = 'base_llm';
    } else {
        // Fallback to device default
        resolvedUiLanguage = gateToUiLanguage(gateLanguage);
        resolvedProviderLanguage = gateToUiLanguage(gateLanguage);
        languageSource = 'device_default';
    }

    // ========================================================================
    // REGION RESOLUTION
    // ========================================================================
    // Priority 1: Intent region (if confident - route is LANDMARK/TEXTSEARCH/NEARBY)
    // Priority 2: Base LLM regionHint
    // Priority 3: Device region code
    // Priority 4: Default region

    let resolvedRegion: string;
    let regionSource: RegionSource;

    // Check if intent region candidate should be locked
    const intentRegionNormalized = normalizeRegion2(intent.regionCandidate);
    const intentRegionIsConfident = intentRegionNormalized &&
        ['LANDMARK', 'TEXTSEARCH', 'NEARBY'].includes(intent.route);

    if (intentRegionIsConfident && intentRegionNormalized) {
        // Intent locked: confident region detection
        resolvedRegion = intentRegionNormalized;
        regionSource = 'intent_locked';

        logger.info({
            requestId,
            pipelineVersion: 'route2',
            event: 'region_locked_by_intent',
            intentRegionCandidate: intent.regionCandidate,
            intentRoute: intent.route,
            resolvedRegion
        }, '[ROUTE2] Region locked by confident intent');
    } else {
        // Fallback to geocoding/device/base chain
        const fallbackResult = await resolveRegionFallback(
            userLocation,
            deviceRegionCode,
            base,
            defaultRegion,
            requestId
        );
        resolvedRegion = fallbackResult.region;
        regionSource = fallbackResult.source;
    }

    const final: FinalSharedFilters = {
        uiLanguage: resolvedUiLanguage,
        providerLanguage: resolvedProviderLanguage,
        openState: base.openState,
        openAt: base.openAt,
        openBetween: base.openBetween,
        priceIntent: base.priceIntent ?? null,
        priceLevels: base.priceLevels ?? null,
        regionCode: resolvedRegion,
        disclaimers: {
            hours: true,
            dietary: true
        }
    };

    logger.info(
        {
            requestId,
            pipelineVersion: 'route2',
            event: 'shared_filters_tightened',
            sources: {
                intent: {
                    language: intent.language,
                    regionCandidate: intent.regionCandidate,
                    route: intent.route
                },
                base: {
                    language: base.language,
                    openState: base.openState,
                    regionHint: base.regionHint ?? null
                },
                device: {
                    regionCode: deviceRegionCode ?? null,
                    gateLanguage
                }
            },
            final: {
                uiLanguage: final.uiLanguage,
                providerLanguage: final.providerLanguage,
                openState: final.openState,
                regionCode: final.regionCode
            },
            languageSource,
            regionSource,
            locked: {
                language: languageSource === 'intent_locked',
                region: regionSource === 'intent_locked'
            }
        },
        '[ROUTE2] Shared filters tightened'
    );

    return { filters: final, regionSource, languageSource };
}

/**
 * Resolve region using fallback priority order
 * Returns both the region code and source
 */
async function resolveRegionFallback(
    userLocation: { lat: number; lng: number } | null | undefined,
    deviceRegionCode: string | null | undefined,
    base: PreGoogleBaseFilters,
    defaultRegion: string,
    requestId?: string
): Promise<{ region: string; source: RegionSource }> {
    // Priority 2: Reverse geocode user location
    if (userLocation) {
        const reverseGeocodedRegion = normalizeRegion2(
            await reverseGeocodeToCountry(userLocation.lat, userLocation.lng)
        );
        if (reverseGeocodedRegion) {
            logger.info(
                {
                    requestId,
                    pipelineVersion: 'route2',
                    event: 'region_from_reverse_geocode',
                    userLocation,
                    regionCode: reverseGeocodedRegion
                },
                '[ROUTE2] Region resolved from reverse geocoding'
            );

            return { region: reverseGeocodedRegion, source: 'reverse_geocode' };
        }
    }

    // Priority 3: Device region code (from device/ctx)
    const deviceRegion = normalizeRegion2(deviceRegionCode);
    if (deviceRegion) {
        logger.info(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'region_from_device',
                deviceRegionCode: deviceRegion,
                regionCode: deviceRegion
            },
            '[ROUTE2] Region resolved from device'
        );

        return { region: deviceRegion, source: 'device_region' };
    }

    // Priority 4: Base LLM hint (must pass strict validation)
    const baseHint = normalizeRegion2(base.regionHint);
    if (baseHint) {
        logger.info(
            {
                requestId,
                pipelineVersion: 'route2',
                event: 'region_from_base_llm',
                rawRegionHint: base.regionHint,
                normalizedRegion: baseHint
            },
            '[ROUTE2] Region resolved from base LLM hint'
        );
        return { region: baseHint, source: 'base_llm' };
    }

    // Priority 5: Default
    return { region: normalizeRegion2(defaultRegion) ?? 'IL', source: 'default' };
}
