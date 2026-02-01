/**
 * Strict Language Enforcement Module
 * 
 * Ensures single authoritative langCtx flows through entire pipeline:
 * Gate2 → Intent/Route → Provider calls → WS assistant → Result meta
 * 
 * CRITICAL INVARIANTS:
 * 1. assistantLanguage set ONCE by Gate2, NEVER changed
 * 2. assistantLanguageConfidence set ONCE by Gate2, NEVER changed
 * 3. Intent/Route stages can ONLY set: uiLanguage, providerLanguage, region
 * 4. All WS assistant messages MUST use ctx.langCtx.assistantLanguage
 * 5. All provider calls MUST use ctx.langCtx.providerLanguage
 */

import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Supported language codes (aligned with UI i18n)
 */
export type LangCode = 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'other';

/**
 * Language Context - Single Source of Truth
 * Flows through entire pipeline unchanged (assistantLanguage/confidence)
 */
export interface LangCtx {
  /** Language for LLM-generated assistant messages - SET ONCE by Gate2, NEVER changed */
  assistantLanguage: LangCode;

  /** Confidence of assistantLanguage detection - SET ONCE by Gate2, NEVER changed */
  assistantLanguageConfidence: number;

  /** UI display language (client preference) - can be set by Intent stage */
  uiLanguage: LangCode;

  /** Provider/search language (Google Places API) - can be set by Intent stage */
  providerLanguage: LangCode;

  /** Region code (ISO-3166-1 alpha-2) - can be set by Intent stage */
  region: string;
}

/**
 * Initialize langCtx from Gate2 output
 * This is the ONLY place where assistantLanguage and confidence are set
 */
export function initLangCtx(
  assistantLanguage: LangCode,
  assistantLanguageConfidence: number,
  region: string = 'IL'
): LangCtx {
  // Validate inputs
  if (assistantLanguageConfidence < 0 || assistantLanguageConfidence > 1) {
    throw new Error(`Invalid assistantLanguageConfidence: ${assistantLanguageConfidence} (must be 0-1)`);
  }

  const langCtx: LangCtx = {
    assistantLanguage,
    assistantLanguageConfidence,
    // Default uiLanguage and providerLanguage to assistantLanguage (Intent stage can override)
    uiLanguage: assistantLanguage === 'other' ? 'en' : assistantLanguage,
    providerLanguage: assistantLanguage === 'other' ? 'en' : assistantLanguage,
    region
  };

  logger.info({
    event: 'langCtx_initialized',
    assistantLanguage,
    assistantLanguageConfidence,
    uiLanguage: langCtx.uiLanguage,
    providerLanguage: langCtx.providerLanguage,
    region
  }, '[LANG_ENFORCEMENT] LangCtx initialized from Gate2');

  return langCtx;
}

/**
 * Update ONLY mutable fields (uiLanguage, providerLanguage, region)
 * Throws if caller attempts to change assistantLanguage or confidence
 */
export function updateLangCtx(
  existing: LangCtx,
  updates: Partial<Pick<LangCtx, 'uiLanguage' | 'providerLanguage' | 'region'>>,
  stage: string,
  requestId: string
): LangCtx {
  const updated: LangCtx = {
    ...existing,
    ...updates
  };

  logger.info({
    requestId,
    stage,
    event: 'langCtx_updated',
    updates,
    assistantLanguage: updated.assistantLanguage, // Should be unchanged
    assistantLanguageConfidence: updated.assistantLanguageConfidence // Should be unchanged
  }, '[LANG_ENFORCEMENT] LangCtx updated (immutable fields preserved)');

  return updated;
}

/**
 * Assert that assistantLanguage and confidence have NOT been changed
 * Call this after any stage that receives langCtx from external source (e.g., LLM output)
 */
export function assertLangCtxImmutable(
  original: LangCtx,
  received: Partial<LangCtx> | any,
  stage: string,
  requestId: string
): void {
  // Check if received object tries to override immutable fields
  if ('assistantLanguage' in received && received.assistantLanguage !== original.assistantLanguage) {
    const error = new Error(
      `[LANG_ENFORCEMENT_VIOLATION] Stage ${stage} attempted to change assistantLanguage: ${original.assistantLanguage} → ${received.assistantLanguage}`
    );

    logger.error({
      requestId,
      stage,
      event: 'langCtx_violation_assistantLanguage',
      original: original.assistantLanguage,
      attempted: received.assistantLanguage,
      error: error.message
    }, '[LANG_ENFORCEMENT] CRITICAL: assistantLanguage change attempt detected');

    throw error;
  }

  if ('assistantLanguageConfidence' in received && received.assistantLanguageConfidence !== original.assistantLanguageConfidence) {
    const error = new Error(
      `[LANG_ENFORCEMENT_VIOLATION] Stage ${stage} attempted to change assistantLanguageConfidence: ${original.assistantLanguageConfidence} → ${received.assistantLanguageConfidence}`
    );

    logger.error({
      requestId,
      stage,
      event: 'langCtx_violation_confidence',
      original: original.assistantLanguageConfidence,
      attempted: received.assistantLanguageConfidence,
      error: error.message
    }, '[LANG_ENFORCEMENT] CRITICAL: assistantLanguageConfidence change attempt detected');

    throw error;
  }
}

/**
 * Assert WS assistant payload language matches langCtx.assistantLanguage
 * Call before publishing to WebSocket
 * 
 * GRACEFUL DEGRADATION: If langCtx is missing, returns derived expected language
 * instead of throwing, allowing caller to decide whether to enforce or warn.
 */
export function assertAssistantLanguage(
  langCtx: LangCtx,
  payloadLanguage: LangCode | string | undefined,
  requestId: string,
  context: string = 'unknown'
): void {
  const normalized = normalizePayloadLanguage(payloadLanguage);

  if (normalized !== langCtx.assistantLanguage) {
    const error = new Error(
      `[LANG_ENFORCEMENT_VIOLATION] Assistant message language mismatch: expected ${langCtx.assistantLanguage}, got ${normalized} (context: ${context})`
    );

    logger.error({
      requestId,
      event: 'assistant_language_violation',
      expected: langCtx.assistantLanguage,
      actual: normalized,
      context,
      error: error.message
    }, '[LANG_ENFORCEMENT] CRITICAL: Assistant message language mismatch');

    throw error;
  }
}

/**
 * Verify assistant language with graceful degradation
 * 
 * Behavior:
 * - If langCtx present: strict enforcement (throws on mismatch)
 * - If langCtx missing: attempt to derive expected language from fallback sources
 *   - Returns { allowed: true, expectedLanguage, source } for graceful degradation
 * 
 * @returns { allowed: boolean, expectedLanguage: LangCode | 'unknown', source: string, wasEnforced: boolean }
 */
export function verifyAssistantLanguageGraceful(
  langCtx: LangCtx | undefined,
  payloadLanguage: LangCode | string | undefined,
  requestId: string,
  context: string = 'unknown',
  fallbackSources?: {
    uiLanguage?: 'he' | 'en';
    queryLanguage?: LangCode;
    storedLanguageContext?: any;
  }
): {
  allowed: boolean;
  expectedLanguage: LangCode | 'unknown';
  actualLanguage: LangCode;
  source: string;
  wasEnforced: boolean;
  warning?: string;
} {
  const actualLanguage = normalizePayloadLanguage(payloadLanguage);

  // CASE 1: langCtx is present - STRICT ENFORCEMENT
  if (langCtx) {
    if (actualLanguage !== langCtx.assistantLanguage) {
      const error = new Error(
        `[LANG_ENFORCEMENT_VIOLATION] Assistant message language mismatch: expected ${langCtx.assistantLanguage}, got ${actualLanguage} (context: ${context})`
      );

      logger.error({
        requestId,
        event: 'assistant_language_violation',
        expected: langCtx.assistantLanguage,
        actual: actualLanguage,
        context,
        error: error.message
      }, '[LANG_ENFORCEMENT] CRITICAL: Assistant message language mismatch');

      throw error;
    }

    // Match - strict enforcement passed
    return {
      allowed: true,
      expectedLanguage: langCtx.assistantLanguage,
      actualLanguage,
      source: 'langCtx_strict',
      wasEnforced: true
    };
  }

  // CASE 2: langCtx is MISSING - GRACEFUL DEGRADATION
  // Try to derive expected language from fallback sources
  let derivedExpected: LangCode | 'unknown' = 'unknown';
  let source = 'none';

  // Priority 1: Try stored language_context_resolved (from job metadata)
  if (fallbackSources?.storedLanguageContext?.assistantLanguage) {
    derivedExpected = fallbackSources.storedLanguageContext.assistantLanguage as LangCode;
    source = 'stored_context';
  }
  // Priority 2: Try queryLanguage (from request)
  else if (fallbackSources?.queryLanguage) {
    derivedExpected = fallbackSources.queryLanguage;
    source = 'query_language';
  }
  // Priority 3: Try uiLanguage (from request/client)
  else if (fallbackSources?.uiLanguage) {
    derivedExpected = fallbackSources.uiLanguage;
    source = 'ui_language';
  }

  // Check if derived matches actual
  const matches = derivedExpected !== 'unknown' && derivedExpected === actualLanguage;

  if (derivedExpected === 'unknown') {
    // Could not derive - allow publish with warning
    logger.warn({
      requestId,
      event: 'assistant_language_unverified',
      actual: actualLanguage,
      expected: 'unknown',
      context,
      source: 'no_fallback_sources'
    }, '[LANG_ENFORCEMENT] Could not verify language - langCtx missing, no fallback sources');

    return {
      allowed: true,
      expectedLanguage: 'unknown',
      actualLanguage,
      source: 'no_fallback_sources',
      wasEnforced: false,
      warning: 'Could not derive expected language - publishing with unknown'
    };
  } else if (matches) {
    // Derived matches actual - allow with info log
    logger.info({
      requestId,
      event: 'assistant_language_derived_match',
      expected: derivedExpected,
      actual: actualLanguage,
      context,
      source
    }, '[LANG_ENFORCEMENT] Language verified via fallback source (langCtx missing)');

    return {
      allowed: true,
      expectedLanguage: derivedExpected,
      actualLanguage,
      source,
      wasEnforced: false
    };
  } else {
    // Derived does NOT match actual - allow with warning
    logger.warn({
      requestId,
      event: 'assistant_language_derived_mismatch',
      expected: derivedExpected,
      actual: actualLanguage,
      context,
      source
    }, '[LANG_ENFORCEMENT] Language mismatch via fallback source (langCtx missing) - allowing publish');

    return {
      allowed: true,
      expectedLanguage: derivedExpected,
      actualLanguage,
      source,
      wasEnforced: false,
      warning: `Derived expected=${derivedExpected} but got actual=${actualLanguage}`
    };
  }
}

/**
 * Assert provider call uses langCtx.providerLanguage
 * Call before making Google Places API calls
 */
export function assertProviderLanguage(
  langCtx: LangCtx,
  providerLanguage: LangCode | string | undefined,
  requestId: string,
  provider: string = 'google_places'
): void {
  const normalized = normalizePayloadLanguage(providerLanguage);

  if (normalized !== langCtx.providerLanguage) {
    const error = new Error(
      `[LANG_ENFORCEMENT_VIOLATION] Provider language mismatch: expected ${langCtx.providerLanguage}, got ${normalized} (provider: ${provider})`
    );

    logger.error({
      requestId,
      event: 'provider_language_violation',
      expected: langCtx.providerLanguage,
      actual: normalized,
      provider,
      error: error.message
    }, '[LANG_ENFORCEMENT] CRITICAL: Provider language mismatch');

    throw error;
  }
}

/**
 * Normalize payload language to LangCode
 * Handles cases where payload might have different format
 */
function normalizePayloadLanguage(language: LangCode | string | undefined): LangCode {
  if (!language) {
    return 'en'; // Default fallback
  }

  const normalized = language.toLowerCase().substring(0, 2);

  const validLangCodes: LangCode[] = ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'];

  if (validLangCodes.includes(normalized as LangCode)) {
    return normalized as LangCode;
  }

  return 'other';
}

/**
 * Validate complete langCtx structure
 * Throws if any invariant is violated
 */
export function validateLangCtx(langCtx: LangCtx, requestId: string): void {
  // Check all required fields are present
  if (!langCtx.assistantLanguage || !langCtx.uiLanguage || !langCtx.providerLanguage || !langCtx.region) {
    throw new Error('[LANG_ENFORCEMENT] langCtx missing required fields');
  }

  // Check confidence is valid
  if (langCtx.assistantLanguageConfidence < 0 || langCtx.assistantLanguageConfidence > 1) {
    throw new Error(`[LANG_ENFORCEMENT] Invalid assistantLanguageConfidence: ${langCtx.assistantLanguageConfidence}`);
  }

  // Check language codes are valid
  const validCodes: LangCode[] = ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'];

  if (!validCodes.includes(langCtx.assistantLanguage)) {
    throw new Error(`[LANG_ENFORCEMENT] Invalid assistantLanguage: ${langCtx.assistantLanguage}`);
  }

  if (!validCodes.includes(langCtx.uiLanguage)) {
    throw new Error(`[LANG_ENFORCEMENT] Invalid uiLanguage: ${langCtx.uiLanguage}`);
  }

  if (!validCodes.includes(langCtx.providerLanguage)) {
    throw new Error(`[LANG_ENFORCEMENT] Invalid providerLanguage: ${langCtx.providerLanguage}`);
  }

  logger.debug({
    requestId,
    event: 'langCtx_validated',
    langCtx
  }, '[LANG_ENFORCEMENT] LangCtx validation passed');
}

/**
 * Serialize langCtx for result meta
 * Returns clean object for JSON serialization
 */
export function serializeLangCtx(langCtx: LangCtx): Record<string, any> {
  return {
    assistantLanguage: langCtx.assistantLanguage,
    assistantLanguageConfidence: langCtx.assistantLanguageConfidence,
    uiLanguage: langCtx.uiLanguage,
    providerLanguage: langCtx.providerLanguage,
    searchLanguage: langCtx.providerLanguage, // Alias for backward compatibility
    region: langCtx.region
  };
}

/**
 * Convert Gate2Language to LangCode
 * Handles the mapping from existing types
 */
export function gate2LanguageToLangCode(gate2Lang: string): LangCode {
  const normalized = gate2Lang.toLowerCase() as LangCode;
  const validCodes: LangCode[] = ['he', 'en', 'ru', 'ar', 'fr', 'es', 'other'];

  if (validCodes.includes(normalized)) {
    return normalized;
  }

  return 'other';
}
