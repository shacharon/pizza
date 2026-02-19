import type { IntentResult, Route2Context } from './types.js';
import type { FinalSharedFilters } from './shared/shared-filters.types.js';
import type { RequestLanguage } from '../types/search.types.js';
import { sanitizeRegionCode } from './utils/region-code-validator.js';

export type ProviderLanguage = 'he' | 'en' | 'ar' | 'ru' | 'fr' | 'es';

const PROVIDER_LANGS = ['he', 'en', 'ar', 'ru', 'fr', 'es'] as const;
const REQUEST_LANGS = ['he', 'en', 'ar', 'ru', 'fr', 'es', 'de', 'it'] as const;

function isProviderLanguage(x: string): x is ProviderLanguage {
  return (PROVIDER_LANGS as readonly string[]).includes(x);
}

function isRequestLanguage(x: string): x is RequestLanguage {
  return (REQUEST_LANGS as readonly string[]).includes(x);
}

/**
 * Normalize any language input to RequestLanguage
 * Handles Gate2Language ('other'), ctx.queryLanguage ('unknown'), and undefined
 * Falls back to 'en' for unsupported languages
 */
export function toRequestLanguage(lang: string | undefined | null): RequestLanguage {
  if (!lang) {
    return 'en';
  }

  const normalized = lang.toLowerCase();

  // Map known languages
  if (normalized === 'he') return 'he';
  if (normalized === 'en') return 'en';
  if (normalized === 'ar') return 'ar';
  if (normalized === 'ru') return 'ru';
  if (normalized === 'fr') return 'fr';
  if (normalized === 'es') return 'es';
  if (normalized === 'de') return 'de';
  if (normalized === 'it') return 'it';

  // Fallback for 'other', 'unknown', or any unsupported language
  return 'en';
}

export interface EarlyRoutingContext {
  regionCode: string;
  providerLanguage: ProviderLanguage;
  uiLanguage: RequestLanguage;
}

export function deriveEarlyRoutingContext(
  intent: IntentResult,
  ctx: Route2Context
): EarlyRoutingContext {
  const providerLanguage: ProviderLanguage =
    isProviderLanguage(intent.language) ? intent.language : 'he';

  // Use toRequestLanguage to normalize Gate2Language to RequestLanguage
  const uiLanguage: RequestLanguage = toRequestLanguage(intent.language);

  const rawRegionCode = intent.regionCandidate || ctx.userRegionCode || 'IL';
  const sanitizedRegionCode = sanitizeRegionCode(rawRegionCode, ctx.userLocation ?? null);
  const regionCode = sanitizedRegionCode || 'IL';

  return { regionCode, providerLanguage, uiLanguage };
}

/**
 * Map RequestLanguage to UI language (he|en only)
 * Non-he/en languages fall back to 'en' for UI
 */
function resolveUiLanguage(lang: RequestLanguage): 'he' | 'en' {
  return lang === 'he' ? 'he' : 'en';
}

export function upgradeToFinalFilters(
  earlyContext: EarlyRoutingContext,
  baseFilters: any
): FinalSharedFilters {
  return {
    uiLanguage: resolveUiLanguage(earlyContext.uiLanguage),
    providerLanguage: earlyContext.providerLanguage,
    regionCode: earlyContext.regionCode,
    openState: baseFilters.openState,
    openAt: baseFilters.openAt,
    openBetween: baseFilters.openBetween,
    priceIntent: baseFilters.priceIntent ?? null,
    priceLevels: baseFilters.priceLevels ?? null,
    disclaimers: {
      hours: true,
      dietary: true
    }
  };
}
