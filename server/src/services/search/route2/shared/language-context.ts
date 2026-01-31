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
 * Supported UI languages (limited set for consistency)
 */
export type UILanguage = 'he' | 'en';

/**
 * Supported query languages (what user can type)
 */
export type QueryLanguage = 'he' | 'en' | 'es' | 'ru' | 'ar' | 'fr';

/**
 * Language Context - strict separation of concerns
 */
export interface LanguageContext {
  /** UI language (client preference) - limited to he/en */
  uiLanguage: UILanguage;
  
  /** Query language (deterministic detection) - supports more languages */
  queryLanguage: QueryLanguage;
  
  /** Intent language (LLM detection - for transparency only) */
  intentLanguage?: string;
  
  /** Assistant message language (LLM-generated text) - ALWAYS = queryLanguage */
  assistantLanguage: QueryLanguage;
  
  /** Search/Provider language (Google Places API) - supports Google-compatible languages */
  searchLanguage: QueryLanguage;
  
  /** Provider language (alias for searchLanguage) */
  providerLanguage: QueryLanguage;
  
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
  uiLanguage: UILanguage;
  queryLanguage: QueryLanguage;
  regionCode: string;
  cityText?: string | null;
  countryCode?: string | null;
  intentLanguage?: string;
  intentLanguageConfidence?: number;
}

/**
 * Feature flag: Provider language policy
 * - "regionDefault": searchLanguage from region policy (DEPRECATED)
 * - "queryLanguage": searchLanguage = queryLanguage (ACTIVE - query-driven UX)
 * 
 * PRODUCT DECISION: Language follows what user types, not where they're located
 */
export const PROVIDER_LANGUAGE_POLICY: 'regionDefault' | 'queryLanguage' = 'queryLanguage';

/**
 * Region-to-language policy map (DEPRECATED in queryLanguage mode)
 * Defines default searchLanguage for each region
 * 
 * NOTE: Only used when PROVIDER_LANGUAGE_POLICY='regionDefault'
 * When PROVIDER_LANGUAGE_POLICY='queryLanguage', this map is ignored
 */
const REGION_LANGUAGE_POLICY: Record<string, UILanguage> = {
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
 * DEPRECATED: No longer used for assistantLanguage
 * assistantLanguage now ALWAYS = queryLanguage (deterministic rule)
 */
const ASSISTANT_LANGUAGE_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Allowed languages for Google Places API
 * Google supports many languages, but we normalize to this set for simplicity
 */
const ALLOWED_GOOGLE_LANGUAGES = ['he', 'en', 'es', 'ru', 'ar', 'fr'] as const;
type GoogleLanguage = typeof ALLOWED_GOOGLE_LANGUAGES[number];

/**
 * Check if language is supported by Google Places API
 */
function isAllowedGoogleLanguage(lang: string): lang is GoogleLanguage {
  return ALLOWED_GOOGLE_LANGUAGES.includes(lang as any);
}

/**
 * Resolve searchLanguage (providerLanguage) based on feature flag
 * 
 * Policy (controlled by PROVIDER_LANGUAGE_POLICY):
 * - "regionDefault": Use region policy (DEPRECATED)
 * - "queryLanguage": Use queryLanguage with fallback to 'en' if unsupported
 * 
 * NEW BEHAVIOR (queryLanguage mode):
 * - Query language drives Google API language
 * - Fallback to 'en' only if query language not in ALLOWED_GOOGLE_LANGUAGES
 * 
 * @returns { searchLanguage, source }
 */
function resolveSearchLanguage(input: LanguageContextInput): { searchLanguage: QueryLanguage; source: string } {
  // Feature flag: queryLanguage mode (ACTIVE)
  if (PROVIDER_LANGUAGE_POLICY === 'queryLanguage') {
    // Use query language if allowed by Google
    if (isAllowedGoogleLanguage(input.queryLanguage)) {
      return {
        searchLanguage: input.queryLanguage,
        source: 'query_language_policy'
      };
    }
    
    // Fallback to English if query language not supported
    return {
      searchLanguage: 'en',
      source: 'query_language_fallback_unsupported'
    };
  }
  
  // DEPRECATED: regionDefault mode
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
 * Resolve assistantLanguage - DETERMINISTIC RULE
 * 
 * CRITICAL PRODUCT RULE: assistantLanguage MUST ALWAYS = queryLanguage
 * 
 * This ensures assistant messages match the language the user typed in,
 * regardless of UI preferences or LLM confidence.
 * 
 * Examples:
 * - User types Spanish query → assistant responds in Spanish
 * - User types Hebrew query → assistant responds in Hebrew
 * - User types English query → assistant responds in English
 * - User types Russian query → assistant responds in Russian
 * 
 * @returns { assistantLanguage, source }
 */
function resolveAssistantLanguage(input: LanguageContextInput): { assistantLanguage: QueryLanguage; source: string } {
  // DETERMINISTIC: assistantLanguage ALWAYS = queryLanguage
  // This is a hard product rule for consistent UX
  return {
    assistantLanguage: input.queryLanguage,
    source: 'query_language_deterministic'
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
    ...(input.intentLanguage && { intentLanguage: input.intentLanguage }),
    assistantLanguage,
    searchLanguage,
    providerLanguage: searchLanguage, // Alias
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
      // queryLanguage: Final resolved query language (may come from intentLanguage if confidence high)
      queryLanguage: context.queryLanguage,
      // intentLanguage: from LLM detection (intent stage, more accurate)
      intentLanguage: input.intentLanguage || null,
      intentLanguageConfidence: input.intentLanguageConfidence,
      // CRITICAL: assistantLanguage ALWAYS = queryLanguage (deterministic rule)
      assistantLanguage: context.assistantLanguage,
      searchLanguage: context.searchLanguage,
      providerLanguage: context.providerLanguage,
      regionCode: context.regionCode,
      sources: context.sources,
      providerLanguagePolicy: PROVIDER_LANGUAGE_POLICY
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
  
  // Invariant 2: Language fields must be valid
  const validUILanguages = ['he', 'en'];
  const validQueryLanguages = ['he', 'en', 'es', 'ru', 'ar', 'fr'];
  
  if (!validUILanguages.includes(context.uiLanguage)) {
    throw new Error(`Invalid uiLanguage: ${context.uiLanguage} (must be he or en)`);
  }
  
  if (!validQueryLanguages.includes(context.queryLanguage)) {
    throw new Error(`Invalid queryLanguage: ${context.queryLanguage}`);
  }
  
  if (!validQueryLanguages.includes(context.assistantLanguage)) {
    throw new Error(`Invalid assistantLanguage: ${context.assistantLanguage}`);
  }
  
  if (!validQueryLanguages.includes(context.searchLanguage)) {
    throw new Error(`Invalid searchLanguage: ${context.searchLanguage}`);
  }
  
  // Invariant 3: Sources must be present
  if (!context.sources.assistantLanguage || !context.sources.searchLanguage) {
    throw new Error('Language context missing source attribution');
  }
  
  // Invariant 4: searchLanguage source must be region-based OR query_language_policy
  // When PROVIDER_LANGUAGE_POLICY='queryLanguage', searchLanguage can come from query
  if (PROVIDER_LANGUAGE_POLICY === 'regionDefault') {
    if (context.sources.searchLanguage.includes('query') ||
        context.sources.searchLanguage.includes('assistant') ||
        context.sources.searchLanguage.includes('ui')) {
      throw new Error(`Invalid searchLanguage source: ${context.sources.searchLanguage} (must be region-based in regionDefault mode)`);
    }
  }
  
  // Invariant 5: assistantLanguage must = queryLanguage (deterministic rule)
  if (context.assistantLanguage !== context.queryLanguage) {
    throw new Error(`assistantLanguage (${context.assistantLanguage}) must equal queryLanguage (${context.queryLanguage})`);
  }
  
  // Invariant 6: providerLanguage must = searchLanguage (alias)
  if (context.providerLanguage !== context.searchLanguage) {
    throw new Error(`providerLanguage (${context.providerLanguage}) must equal searchLanguage (${context.searchLanguage})`);
  }
}

/**
 * Get region language policy (for testing/docs)
 * DEPRECATED: Only used when PROVIDER_LANGUAGE_POLICY='regionDefault'
 */
export function getRegionLanguagePolicy(): Record<string, UILanguage> {
  return { ...REGION_LANGUAGE_POLICY };
}

/**
 * Get allowed Google languages (for testing/docs)
 */
export function getAllowedGoogleLanguages(): readonly string[] {
  return ALLOWED_GOOGLE_LANGUAGES;
}
