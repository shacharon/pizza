/**
 * Filters Resolver - Route2 Pipeline
 * 
 * Resolves base filters to final filters (simple passthrough + language resolution)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared-filters.types.js';
import type { IntentResult } from '../types.js';
import { sanitizeRegionCode, getFallbackRegion } from '../utils/region-code-validator.js';

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

    // 3. Resolve region code (intent > device > default)
    const rawRegionCode = intent.region || deviceRegionCode || 'IL';
    
    // 4. Sanitize region code (validate against CLDR, handle 'GZ' special case)
    const sanitizedRegionCode = sanitizeRegionCode(rawRegionCode, userLocation);
    
    // 5. Log if region was sanitized/rejected
    if (sanitizedRegionCode !== rawRegionCode) {
        const fallback = sanitizedRegionCode || getFallbackRegion(rawRegionCode, userLocation);
        
        logger.info({
            requestId,
            pipelineVersion: 'route2',
            event: 'region_invalid',
            regionCode: rawRegionCode,
            source: intent.region ? 'intent' : (deviceRegionCode ? 'device' : 'default'),
            fallback: fallback || 'null',
            insideIsrael: userLocation ? sanitizeRegionCode('GZ', userLocation) === 'IL' : false
        }, '[ROUTE2] Invalid region code detected');
    }

    // 6. Pass through openState + time filters (NO MODIFICATION)
    const openState = base.openState;
    const openAt = base.openAt;
    const openBetween = base.openBetween;

    const finalFilters: FinalSharedFilters = {
        uiLanguage,
        providerLanguage,
        openState,
        openAt,
        openBetween,
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
            regionHint: base.regionHint
        },
        final: {
            uiLanguage: finalFilters.uiLanguage,
            providerLanguage: finalFilters.providerLanguage,
            openState: finalFilters.openState,
            openAt: finalFilters.openAt,
            openBetween: finalFilters.openBetween,
            regionCode: finalFilters.regionCode
        },
        sanitized: sanitizedRegionCode !== rawRegionCode
    }, '[ROUTE2] Filters resolved');

    return finalFilters;
}
