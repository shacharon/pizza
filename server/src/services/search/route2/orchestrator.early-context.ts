/**
 * Early Context Derivation Module
 * 
 * Derives minimal routing context from intent + device region
 * to enable parallel Google fetch without waiting for base_filters
 */

import type { IntentResult, Route2Context } from './types.js';
import type { FinalSharedFilters } from './shared/shared-filters.types.js';
import { sanitizeRegionCode } from './utils/region-code-validator.js';

export interface EarlyRoutingContext {
  regionCode: string;
  providerLanguage: 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru';
  uiLanguage: 'he' | 'en';
}

/**
 * Derive early routing context from intent + device region
 * 
 * This is a DETERMINISTIC subset of filters_resolved logic
 * that can run immediately after intent (before base_filters completes)
 * 
 * Used to start Google fetch in parallel with base_filters/post_constraints
 */
export function deriveEarlyRoutingContext(
  intent: IntentResult,
  ctx: Route2Context
): EarlyRoutingContext {
  // 1. Resolve provider language (preserve intent language)
  const providerLanguage: 'he' | 'en' | 'ar' | 'fr' | 'es' | 'ru' =
    ['he', 'en', 'ar', 'fr', 'es', 'ru'].includes(intent.language)
      ? intent.language as any
      : 'he'; // fallback

  // 2. Resolve UI language (he or en only)
  const uiLanguage: 'he' | 'en' = intent.language === 'he' ? 'he' : 'en';

  // 3. Resolve region code (intent candidate > device > default)
  const rawRegionCode = intent.regionCandidate || ctx.userRegionCode || 'IL';
  
  // 4. Sanitize region code (same logic as filters-resolver)
  const sanitizedRegionCode = sanitizeRegionCode(rawRegionCode, ctx.userLocation ?? null);
  const regionCode = sanitizedRegionCode || 'IL'; // Fallback to IL if null

  return {
    regionCode,
    providerLanguage,
    uiLanguage
  };
}

/**
 * Upgrade early context to full FinalSharedFilters
 * 
 * Called after base_filters resolves to merge with early context
 * This ensures we use the correct openState/time filters from base_filters
 */
export function upgradeToFinalFilters(
  earlyContext: EarlyRoutingContext,
  baseFilters: any
): FinalSharedFilters {
  return {
    uiLanguage: earlyContext.uiLanguage,
    providerLanguage: earlyContext.providerLanguage,
    regionCode: earlyContext.regionCode,
    openState: baseFilters.openState,
    openAt: baseFilters.openAt,
    openBetween: baseFilters.openBetween,
    priceIntent: baseFilters.priceIntent,
    minRatingBucket: baseFilters.minRatingBucket,
    minReviewCountBucket: baseFilters.minReviewCountBucket,
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
}
