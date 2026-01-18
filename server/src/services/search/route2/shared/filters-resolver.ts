/**
 * Filters Resolver - Route2 Pipeline
 * 
 * Resolves base filters to final filters (simple passthrough + language resolution)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { PreGoogleBaseFilters, FinalSharedFilters } from './shared-filters.types.js';
import type { IntentResult } from '../types.js';

export interface ResolveFiltersParams {
    base: PreGoogleBaseFilters;
    intent: IntentResult;
    deviceRegionCode?: string | null;
    requestId?: string;
}

/**
 * Resolve base filters to final filters
 * Simple passthrough with minimal logic
 */
export async function resolveFilters(params: ResolveFiltersParams): Promise<FinalSharedFilters> {
    const { base, intent, deviceRegionCode, requestId } = params;

    // 1. Resolve UI language (he or en only)
    const uiLanguage: 'he' | 'en' = intent.language === 'he' ? 'he' : 'en';

    // 2. Resolve provider language (preserve intent language)
    const providerLanguage: 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru' = 
        ['he', 'en', 'ar', 'fr', 'es', 'ru'].includes(intent.language) 
        ? intent.language as any
        : 'he'; // fallback

    // 3. Resolve region code (intent > device > default)
    const regionCode = intent.region || deviceRegionCode || 'IL';

    // 4. Pass through openState + time filters (NO MODIFICATION)
    const openState = base.openState;
    const openAt = base.openAt;
    const openBetween = base.openBetween;

    const finalFilters: FinalSharedFilters = {
        uiLanguage,
        providerLanguage,
        openState,
        openAt,
        openBetween,
        regionCode,
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
        }
    }, '[ROUTE2] Filters resolved');

    return finalFilters;
}
