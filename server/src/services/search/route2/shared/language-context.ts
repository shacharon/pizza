/**
 * Language Context Resolver
 * 
 * Enforces strict separation between different language concerns:
 * - uiLanguage: Client/store preference (UI display)
 * - queryLanguage: Deterministic detection from query text (for assistant hints)
 * - assistantLanguage: Language for LLM-generated messages ONLY
 * - searchLanguage (providerLanguage): Language for Google Places API ONLY
 * 
 * INVARIANTS:
 * 1. assistantLanguage MUST NOT affect searchLanguage, textQuery, requiredTerms
 * 2. queryLanguage MUST NOT affect searchLanguage (except last-resort fallback)
 * 3. searchLanguage derived ONLY from location/region policy
 * 4. Canonical queries generated in searchLanguage only
 */

import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Language Context - strict separation of concerns
 */
export interface LanguageContext {
  /** UI language (client preference) */
  uiLanguage: 'he' | 'en';
  
  /** Query language (deterministic detection) */
  queryLanguage: 'he' | 'en';
  
  /** Assistant message language (LLM-generated text) */
  assistantLanguage: 'he' | 'en';
  
  /** Search/Provider language (Google Places API) */
  searchLanguage: 'he' | 'en';
  
  /** Region code (ISO-3166-1 alpha-2) */
  regionCode: string;
  
  /** Sources for observability */
  sources: {
    assistantLanguage: string;
    searchLanguage: string;
  };
}

/**
 * Input for language context resolution
 */
export interface LanguageContextInput {
  uiLanguage: 'he' | 'en';
  queryLanguage: 'he' | 'en';
  regionCode: string;
  cityText?: string | null;
  countryCode?: string | null;
  intentLanguage?: string;
  intentLanguageConfidence?: number;
}

/**
 * Region-to-language policy map
 * Defines default searchLanguage for each region
 * 
 * Policy: searchLanguage is ONLY determined by region/location, never by query language
 */
const REGION_LANGUAGE_POLICY: Record<string, 'he' | 'en'> = {
  // Israel & Palestinian Territories
  'IL': 'he',
  'PS': 'he',
  
  // English-speaking countries
  'US': 'en',
  'GB': 'en',
  'CA': 'en',
  'AU': 'en',
  'NZ': 'en',
  'IE': 'en',
  
  // Other regions default to English
  // (will be handled by fallback)
};

/**
 * Language confidence threshold for LLM detection
 * If intentLanguageConfidence >= threshold, use for assistantLanguage
 */
const ASSISTANT_LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Resolve searchLanguage from region/location ONLY
 * NEVER uses queryLanguage or assistantLanguage
 * 
 * Policy:
 * 1. If regionCode in policy map -> use policy language
 * 2. Else -> fallback to 'en' (global default)
 * 
 * @returns { searchLanguage, source }
 */
function resolveSearchLanguage(input: LanguageContextInput): { searchLanguage: 'he' | 'en'; source: string } {
  // Check policy map
  const policyLanguage = REGION_LANGUAGE_POLICY[input.regionCode];
  if (policyLanguage) {
    return {
      searchLanguage: policyLanguage,
      source: `region_policy:${input.regionCode}`
    };
  }
  
  // Fallback to English (international default)
  return {
    searchLanguage: 'en',
    source: 'global_default'
  };
}

/**
 * Resolve assistantLanguage from LLM detection + confidence
 * 
 * Rules:
 * 1. If intentLanguage confident (>= 0.7) AND in ['he', 'en'] -> use intentLanguage
 * 2. Else -> use uiLanguage (user preference)
 * 
 * @returns { assistantLanguage, source }
 */
function resolveAssistantLanguage(input: LanguageContextInput): { assistantLanguage: 'he' | 'en'; source: string } {
  // Check LLM detection with confidence
  if (input.intentLanguage && input.intentLanguageConfidence !== undefined) {
    if (input.intentLanguageConfidence >= ASSISTANT_LANGUAGE_CONFIDENCE_THRESHOLD) {
      if (input.intentLanguage === 'he') {
        return { assistantLanguage: 'he', source: 'llm_confident' };
      } else if (input.intentLanguage === 'en') {
        return { assistantLanguage: 'en', source: 'llm_confident' };
      }
      // If 'other' (ru/ar/fr/es), fall through to uiLanguage
    }
  }
  
  // Fallback to uiLanguage (user preference)
  return {
    assistantLanguage: input.uiLanguage,
    source: input.intentLanguageConfidence !== undefined && input.intentLanguageConfidence < ASSISTANT_LANGUAGE_CONFIDENCE_THRESHOLD
      ? 'uiLanguage_low_confidence'
      : 'uiLanguage'
  };
}

/**
 * Resolve complete language context with strict separation
 * 
 * CRITICAL INVARIANTS:
 * - assistantLanguage MUST NOT affect searchLanguage
 * - queryLanguage MUST NOT affect searchLanguage
 * - searchLanguage determined ONLY by region/location policy
 * 
 * @param input Language context inputs
 * @param requestId For logging
 * @returns Complete language context with all languages
 */
export function resolveLanguageContext(
  input: LanguageContextInput,
  requestId?: string
): LanguageContext {
  // Resolve searchLanguage from region ONLY (no query/assistant influence)
  const { searchLanguage, source: searchLanguageSource } = resolveSearchLanguage(input);
  
  // Resolve assistantLanguage from LLM + confidence (independent of searchLanguage)
  const { assistantLanguage, source: assistantLanguageSource } = resolveAssistantLanguage(input);
  
  const context: LanguageContext = {
    uiLanguage: input.uiLanguage,
    queryLanguage: input.queryLanguage,
    assistantLanguage,
    searchLanguage,
    regionCode: input.regionCode,
    sources: {
      assistantLanguage: assistantLanguageSource,
      searchLanguage: searchLanguageSource
    }
  };
  
  // Log language context resolution (observability)
  if (requestId) {
    logger.info({
      requestId,
      event: 'language_context_resolved',
      uiLanguage: context.uiLanguage,
      queryLanguage: context.queryLanguage,
      assistantLanguage: context.assistantLanguage,
      searchLanguage: context.searchLanguage,
      regionCode: context.regionCode,
      sources: context.sources,
      intentLanguage: input.intentLanguage,
      intentLanguageConfidence: input.intentLanguageConfidence,
      confidenceThreshold: ASSISTANT_LANGUAGE_CONFIDENCE_THRESHOLD
    }, '[LANGUAGE] Language context resolved with strict separation');
  }
  
  return context;
}

/**
 * Validate language context invariants (for testing)
 * Throws if any invariant is violated
 */
export function validateLanguageContext(context: LanguageContext): void {
  // Invariant 1: All language fields must be present
  if (!context.uiLanguage || !context.queryLanguage || !context.assistantLanguage || !context.searchLanguage) {
    throw new Error('Language context missing required fields');
  }
  
  // Invariant 2: All language fields must be 'he' or 'en'
  const validLanguages = ['he', 'en'];
  if (!validLanguages.includes(context.uiLanguage) ||
      !validLanguages.includes(context.queryLanguage) ||
      !validLanguages.includes(context.assistantLanguage) ||
      !validLanguages.includes(context.searchLanguage)) {
    throw new Error('Language context contains invalid language values');
  }
  
  // Invariant 3: Sources must be present
  if (!context.sources.assistantLanguage || !context.sources.searchLanguage) {
    throw new Error('Language context missing source attribution');
  }
  
  // Invariant 4: searchLanguage source must be region-based (never query/assistant)
  if (context.sources.searchLanguage.includes('query') ||
      context.sources.searchLanguage.includes('assistant') ||
      context.sources.searchLanguage.includes('ui')) {
    throw new Error(`Invalid searchLanguage source: ${context.sources.searchLanguage} (must be region-based)`);
  }
}

/**
 * Get region language policy (for testing/docs)
 */
export function getRegionLanguagePolicy(): Record<string, 'he' | 'en'> {
  return { ...REGION_LANGUAGE_POLICY };
}
