/**
 * Canonical Google Query Generator (LLM-based)
 * Generates canonical Google-optimized search queries
 * 
 * Rules:
 * - Output: { "googleQuery": string, "confidence": number }
 * - googleQuery MUST be exactly "<canonical phrase> <city>" if city exists
 * - Allowed phrases ONLY (he/en)
 * - No extra tokens
 * - Fallback to original query if confidence < 0.7 or error/timeout
 */

import { createHash } from 'crypto';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { resolveLLM } from '../../../../../lib/llm/index.js';
import type { Message } from '../../../../../llm/types.js';
import { z } from 'zod';

const CANONICAL_QUERY_VERSION = 'canonical_query_v1';

// Allowed canonical phrases (strict list)
const ALLOWED_PHRASES = {
  he: [
    'מסעדה איטלקית',
    'פיצה',
    'בית קפה',
    'שווארמה',
    'תחנת דלק',
    'מסעדות'
  ],
  en: [
    'italian restaurant',
    'pizza',
    'cafe',
    'shawarma',
    'gas station',
    'restaurants'
  ]
} as const;

const CANONICAL_QUERY_PROMPT = `SYSTEM: You analyze a restaurant search query for Google Places Text Search.

OUTPUT: JSON ONLY
{
  "providerMethod": "textSearch",
  "mode": "KEYED" | "FREE_TEXT",
  "cuisineKey": string | null,
  "placeTypeKey": "restaurant" | "cafe" | "bar" | null,
  "cityText": string | null,
  "region": string,
  "reason": "keyed_city" | "keyed_cuisine" | "keyed_both" | "freetext",
  "strictness": "STRICT" | "RELAX_IF_EMPTY",
  "typeHint": "restaurant" | "cafe" | "bar" | "any"
}

RULES:
- DO NOT detect, infer, translate, or output language.
- DO NOT use keyword lists, word mappings, or hardcoded examples.
- Decide KEYED vs FREE_TEXT by semantic meaning only.
- cuisineKey must be a short canonical label (e.g., "italian", "asian", "burger") or null.
- cuisineKey must be chosen from an allowed canonical set provided by the system.
- cityText ONLY if explicitly present; keep original form; do not translate.
- region must be ISO-3166-1 alpha-2; default "IL" if unknown.
- Never generate full query sentences.
- Never add or remove words beyond extracting structured fields.
`;

const CANONICAL_QUERY_PROMPT_HASH = createHash('sha256')
  .update(CANONICAL_QUERY_PROMPT, 'utf8')
  .digest('hex');

// Zod schema for LLM response validation
const CanonicalQuerySchema = z.object({
  googleQuery: z.string(),
  confidence: z.number().min(0).max(1)
});

type CanonicalQueryResult = z.infer<typeof CanonicalQuerySchema>;

// JSON schema for OpenAI structured output
const CANONICAL_QUERY_JSON_SCHEMA = {
  type: 'object' as const,
  properties: {
    googleQuery: { type: 'string' as const },
    confidence: { type: 'number' as const, minimum: 0, maximum: 1 }
  },
  required: ['googleQuery', 'confidence'],
  additionalProperties: false
};

const CANONICAL_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(CANONICAL_QUERY_JSON_SCHEMA))
  .digest('hex');

export interface CanonicalQueryGeneratorOptions {
  requestId: string;
  traceId?: string;
  sessionId?: string;
  llmProvider: any;
  uiLanguage: 'he' | 'en';
  regionCode: string;
}

export interface CanonicalQueryOutput {
  googleQuery: string;
  wasRewritten: boolean;
  confidence: number;
  reason: 'canonical_success' | 'canonical_fallback_low_confidence' | 'canonical_fallback_preservation_failed' | 'canonical_fallback_error' | 'canonical_fallback_timeout';
}

/**
 * Generate canonical Google query using LLM
 * Returns original query if confidence < 0.7 or error/timeout
 */
export async function generateCanonicalQuery(
  originalQuery: string,
  cityText: string | null,
  options: CanonicalQueryGeneratorOptions
): Promise<CanonicalQueryOutput> {
  const { requestId, traceId, sessionId, llmProvider, uiLanguage, regionCode } = options;
  const startTime = Date.now();

  // Build user prompt with context
  const userPrompt = buildUserPrompt(originalQuery, cityText, uiLanguage, regionCode);

  const messages: Message[] = [
    { role: 'system', content: CANONICAL_QUERY_PROMPT },
    { role: 'user', content: userPrompt }
  ];

  // Resolve model and timeout (use fast model for this task)
  const { model, timeoutMs } = resolveLLM('routeMapper');

  try {
    const response = await llmProvider.completeJSON(
      messages,
      CanonicalQuerySchema,
      {
        model,
        temperature: 0, // Deterministic output
        timeout: timeoutMs,
        requestId,
        ...(traceId && { traceId }),
        ...(sessionId && { sessionId }),
        stage: 'canonical_query_generator',
        promptVersion: CANONICAL_QUERY_VERSION,
        promptHash: CANONICAL_QUERY_PROMPT_HASH,
        schemaHash: CANONICAL_SCHEMA_HASH
      },
      CANONICAL_QUERY_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;
    const result: CanonicalQueryResult = response.data;

    // Validate confidence threshold
    if (result.confidence < 0.7) {
      logger.info({
        requestId,
        stage: 'canonical_query_generator',
        event: 'canonical_query_fallback',
        reason: 'low_confidence',
        originalQuery,
        proposedQuery: result.googleQuery,
        confidence: result.confidence,
        durationMs
      }, '[CANONICAL] Low confidence, using original query');

      return {
        googleQuery: originalQuery,
        wasRewritten: false,
        confidence: result.confidence,
        reason: 'canonical_fallback_low_confidence'
      };
    }

    // CRITICAL: Validate preservation of cuisine + city tokens
    const preservation = validateCanonicalPreservation(
      originalQuery,
      result.googleQuery,
      cityText
    );

    if (!preservation.valid) {
      logger.warn({
        requestId,
        stage: 'canonical_query_generator',
        event: 'canonical_query_preservation_failed',
        reason: preservation.reason,
        originalQuery,
        proposedQuery: result.googleQuery,
        confidence: result.confidence,
        durationMs
      }, '[CANONICAL] Preservation check failed, using original query');

      return {
        googleQuery: originalQuery,
        wasRewritten: false,
        confidence: result.confidence,
        reason: 'canonical_fallback_preservation_failed'
      };
    }

    // Success: Use canonical query
    logger.info({
      requestId,
      stage: 'canonical_query_generator',
      event: 'canonical_query_success',
      type: 'llm_rewrite',
      queryHash: createHash('sha256').update(originalQuery).digest('hex').substring(0, 12),
      originalQuery,
      canonicalQuery: result.googleQuery,
      confidence: result.confidence,
      preservationValid: true,
      durationMs
    }, '[CANONICAL] Generated canonical query');

    return {
      googleQuery: result.googleQuery,
      wasRewritten: true,
      confidence: result.confidence,
      reason: 'canonical_success'
    };

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error?.message || String(error);
    const errorType = error?.errorType || '';
    const isTimeout = errorType === 'abort_timeout' ||
      errorMsg.toLowerCase().includes('abort') ||
      errorMsg.toLowerCase().includes('timeout');

    const reason = isTimeout ? 'canonical_fallback_timeout' : 'canonical_fallback_error';

    logger.warn({
      requestId,
      stage: 'canonical_query_generator',
      event: 'canonical_query_fallback',
      reason,
      errorType,
      error: errorMsg,
      durationMs
    }, '[CANONICAL] LLM failed, using original query');

    return {
      googleQuery: originalQuery,
      wasRewritten: false,
      confidence: 0,
      reason
    };
  }
}

/**
 * Build user prompt with context
 */
function buildUserPrompt(
  query: string,
  cityText: string | null,
  uiLanguage: 'he' | 'en',
  regionCode: string
): string {
  let prompt = `Query: "${query}"\n`;
  prompt += `Language: ${uiLanguage}\n`;
  prompt += `Region: ${regionCode}\n`;
  if (cityText) {
    prompt += `City: ${cityText}\n`;
  }
  return prompt;
}

/**
 * Validate that the canonical query uses only allowed phrases
 * (Post-LLM validation for safety)
 */
export function validateCanonicalPhrase(
  googleQuery: string,
  uiLanguage: 'he' | 'en'
): boolean {
  const allowedPhrases = ALLOWED_PHRASES[uiLanguage];

  // Check if query starts with any allowed phrase
  for (const phrase of allowedPhrases) {
    if (googleQuery.toLowerCase().startsWith(phrase.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that canonical query preserves critical tokens
 * 
 * INVARIANTS:
 * 1. MUST contain "מסעדה" or "מסעדות" (Hebrew) / "restaurant" (English)
 * 2. If originalQuery contains cuisine keyword → canonical MUST contain it
 * 3. If cityText provided → canonical MUST contain it
 * 
 * @param originalQuery User's original query
 * @param canonicalQuery LLM-generated canonical query
 * @param cityText Optional city name
 * @returns true if valid, false if critical tokens lost
 */
export function validateCanonicalPreservation(
  originalQuery: string,
  canonicalQuery: string,
  cityText?: string | null
): { valid: boolean; reason?: string } {
  const originalLower = originalQuery.toLowerCase();
  const canonicalLower = canonicalQuery.toLowerCase();

  // Rule 1: Must contain restaurant word
  const hasRestaurantWord =
    canonicalLower.includes('מסעדה') ||
    canonicalLower.includes('מסעדות') ||
    canonicalLower.includes('restaurant');

  if (!hasRestaurantWord) {
    return { valid: false, reason: 'missing_restaurant_word' };
  }

  // Rule 2: If original has cuisine keyword, canonical must preserve it
  const cuisineKeywords = [
    'איטלקי', 'איטלקית', 'איטלקיות',
    'italian',
    'פיצה', 'pizza',
    'סושי', 'sushi',
    'אסייתי', 'אסייתית', 'asian',
    'המבורגר', 'burger',
    'שווארמה', 'shawarma'
  ];

  for (const keyword of cuisineKeywords) {
    if (originalLower.includes(keyword.toLowerCase())) {
      // Find the base form (remove suffix like ות, ית, י)
      const baseForm = keyword.substring(0, Math.max(4, keyword.length - 2));

      if (!canonicalLower.includes(baseForm.toLowerCase())) {
        return {
          valid: false,
          reason: `lost_cuisine_keyword: ${keyword}`
        };
      }
    }
  }

  // Rule 3: If cityText provided, canonical must contain it
  if (cityText) {
    const cityLower = cityText.toLowerCase();
    if (!canonicalLower.includes(cityLower)) {
      return {
        valid: false,
        reason: `lost_city: ${cityText}`
      };
    }
  }

  return { valid: true };
}
