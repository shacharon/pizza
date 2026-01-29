/**
 * Assistant LLM Service
 * 
 * Simple LLM-based assistant message generation for UX messages.
 * NO post-processing, NO policy enforcement, NO deterministic logic.
 * Pure LLM → strict JSON parsing → done.
 */

import { createHash } from 'node:crypto';
import type { LLMProvider } from '../../../../llm/types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { buildLLMOptions } from '../../../../lib/llm/index.js';
import { z } from 'zod';

// ============================================================================
// Types
// ============================================================================

export interface AssistantGateContext {
  type: 'GATE_FAIL';
  reason: 'NO_FOOD' | 'UNCERTAIN_FOOD';
  query: string;
  language: 'he' | 'en' | 'other';
}

export interface AssistantClarifyContext {
  type: 'CLARIFY';
  reason: 'MISSING_LOCATION' | 'MISSING_FOOD';
  query: string;
  language: 'he' | 'en' | 'other';
}

export interface AssistantSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  top3Names: string[];
  // INSIGHT METADATA: Data for intelligent narration
  // NOTE: openNowCount and currentHour are ONLY included if ALL results have known status
  // If any result has unknown status, these fields are omitted entirely
  metadata?: {
    openNowCount?: number; // How many results are currently open (only if no unknowns)
    currentHour?: number; // Current hour (0-23) for time-based insights (only if no unknowns)
    radiusKm?: number; // Search radius in kilometers
    filtersApplied?: string[]; // Active filters (e.g., ['OPEN_NOW', 'kosher', 'price:2'])
  };
  // DIETARY NOTE: Optional soft dietary hint (merged into summary)
  dietaryNote?: {
    type: 'gluten-free';
    shouldInclude: boolean;
  };
}

export interface AssistantSearchFailedContext {
  type: 'SEARCH_FAILED';
  reason: 'GOOGLE_TIMEOUT' | 'PROVIDER_ERROR' | 'NETWORK_ERROR';
  query: string;
  language: 'he' | 'en' | 'other';
}

export interface AssistantGenericQueryNarrationContext {
  type: 'GENERIC_QUERY_NARRATION';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  usedCurrentLocation: boolean; // True if userLocation was used
}

export type AssistantContext =
  | AssistantGateContext
  | AssistantClarifyContext
  | AssistantSummaryContext
  | AssistantSearchFailedContext
  | AssistantGenericQueryNarrationContext;

// Output schema (strict JSON)
export const AssistantOutputSchema = z.object({
  type: z.enum(['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION']),
  message: z.string(),
  question: z.string().nullable(),
  suggestedAction: z.enum(['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE']),
  blocksSearch: z.boolean()
}).strict();

export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// JSON Schema for OpenAI
const ASSISTANT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['GATE_FAIL', 'CLARIFY', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION'] },
    message: { type: 'string' },
    question: { type: ['string', 'null'] },
    suggestedAction: { type: 'string', enum: ['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RETRY', 'EXPAND_RADIUS', 'REFINE'] },
    blocksSearch: { type: 'boolean' }
  },
  required: ['type', 'message', 'question', 'suggestedAction', 'blocksSearch'],
  additionalProperties: false
} as const;

// ============================================================================
// LLM Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are an assistant for a food search app. Return ONLY JSON.

Rules:
- Be friendly, concise (1-2 sentences max for message), helpful
- CRITICAL: Respond in the EXACT language specified (he=Hebrew ONLY, en=English ONLY)
- "question" field: add a clarifying question when needed (CLARIFY should ask, others optional)
- "blocksSearch": 
  * SUMMARY type: MUST be false (search already completed, showing results)
  * GENERIC_QUERY_NARRATION type: MUST be false (search already completed)
  * CLARIFY/GATE_FAIL type: MUST be true (search cannot proceed)
  * SEARCH_FAILED type: usually true (search failed, user should try again)
- "suggestedAction": YOU decide what helps user most
- Type-specific rules:
  * SUMMARY: blocksSearch MUST be false, suggestedAction MUST be NONE (user is viewing results)
  * GENERIC_QUERY_NARRATION: blocksSearch MUST be false, suggestedAction MUST be REFINE

Schema: {"type":"GATE_FAIL|CLARIFY|SUMMARY|SEARCH_FAILED|GENERIC_QUERY_NARRATION","message":"...","question":"..."|null,"suggestedAction":"NONE|ASK_LOCATION|ASK_FOOD|RETRY|EXPAND_RADIUS|REFINE","blocksSearch":true|false}`;

function buildUserPrompt(context: AssistantContext): string {
  const languageInstruction = context.language === 'he' ? 'Hebrew' : 'English';
  const languageEmphasis = context.language === 'he' ? 'MUST write in Hebrew (עברית)' : 'MUST write in English';
  
  if (context.type === 'GATE_FAIL') {
    const reason = context.reason === 'NO_FOOD' ? 'not food-related' : 'uncertain if food-related';
    return `Query: "${context.query}"
Type: GATE_FAIL
Reason: ${reason}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Generate friendly message. Help user understand and guide them. Decide blocksSearch and suggestedAction.`;
  }

  if (context.type === 'CLARIFY') {
    const missing = context.reason === 'MISSING_LOCATION' ? 'location' : 'food type';
    return `Query: "${context.query}"
Type: CLARIFY
Reason: missing ${missing}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Ask a question to get the missing info. Decide blocksSearch and suggestedAction.`;
  }

  if (context.type === 'SEARCH_FAILED') {
    const reason = context.reason === 'GOOGLE_TIMEOUT' ? 'Google API timeout' : 'provider error';
    return `Query: "${context.query}"
Type: SEARCH_FAILED
Reason: ${reason}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Tell user search failed. Decide what to suggest and whether to block. Be helpful and honest.`;
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    const locationSource = context.usedCurrentLocation ? 'current location' : 'default area';
    return `Query: "${context.query}"
Type: GENERIC_QUERY_NARRATION
Results: ${context.resultCount}
Location used: ${locationSource}
Language: ${context.language}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Instructions:
1. Message (1 sentence): Explain assumption - we used their current location because query was generic
2. Question (1 sentence): Ask for ONE refinement to help narrow results. Choose the MOST helpful:
   - Cuisine type (e.g., "איזה סוג אוכל?", "What cuisine?")
   - Dietary preference (e.g., "צריך כשר?", "Need kosher?")
   - Time constraint (e.g., "צריך פתוח עכשיו?", "Need open now?")
   - Distance (e.g., "כמה רחוק בסדר?", "How far is okay?")
3. Set blocksSearch=false (search already ran)
4. Set suggestedAction="REFINE"

Examples:
- (he) "חיפשתי לפי המיקום הנוכחי שלך. איזה סוג אוכל מעניין אותך?"
- (en) "I searched near your current location. What type of cuisine interests you?"`;
  }

  // SUMMARY
  const metadata = context.metadata || {};
  const dietaryNote = context.dietaryNote?.shouldInclude
    ? `\nDietary Note: Add SOFT gluten-free hint at end (1 sentence max).
  - Tone: uncertain, non-authoritative, helpful
  - Example (he): "ייתכן שיש אפשרויות ללא גלוטן - כדאי לוודא עם המסעדה."
  - Example (en): "Some places may offer gluten-free options - please confirm with restaurant."
  - NO medical claims, NO guarantees
  - Combine naturally with summary (max 2 sentences total)`
    : '';

  const metadataContext = `
Metadata (use ONLY this data, DO NOT invent):
- Results: ${context.resultCount}
${metadata.openNowCount !== undefined ? `- Open now: ${metadata.openNowCount}/${context.resultCount}` : ''}
${metadata.currentHour !== undefined ? `- Current hour: ${metadata.currentHour}:00` : ''}
${metadata.radiusKm !== undefined ? `- Search radius: ${metadata.radiusKm}km` : ''}
${metadata.filtersApplied && metadata.filtersApplied.length > 0 ? `- Active filters: ${metadata.filtersApplied.join(', ')}` : ''}
- Top3: ${context.top3Names.slice(0, 3).join(', ')}`;

  return `Query: "${context.query}"
Type: SUMMARY
Language: ${context.language}${metadataContext}${dietaryNote}

CRITICAL: You ${languageEmphasis}. Both "message" and "question" fields must be in ${languageInstruction}.

Instructions:
1. NO generic phrases like "thank you", "here are", "found X results"
2. Provide ONE short insight (why results look this way) based on metadata
3. Optionally suggest: narrow search (filters, rating), expand search (radius, remove filters), or time-based advice
4. Use ONLY existing metadata - DO NOT invent weather, delivery, availability
5. Max 2 sentences total (including any dietary note)
6. Examples:
   - (he) "רוב המקומות סגורים עכשיו בשעה מאוחרת. אפשר לסנן לפתוח עכשיו או לחפש למחר."
   - (en) "Most places are rated highly in this area. Try sorting by closest if you want nearby options."

Generate insight-based message that helps user understand the results.`;
}

// ============================================================================
// Schema Version (for cache keys if needed)
// ============================================================================

export const ASSISTANT_SCHEMA_VERSION = 'v3_strict_validation';
export const ASSISTANT_PROMPT_VERSION = 'v2_language_enforcement';

// Generate schema hash for telemetry (consistent with other mappers)
export const ASSISTANT_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(ASSISTANT_JSON_SCHEMA), 'utf8')
  .digest('hex')
  .substring(0, 12);

// ============================================================================
// Validation & Normalization
// ============================================================================

/**
 * Detect if text is primarily Hebrew
 */
function isHebrewText(text: string): boolean {
  const hebrewChars = text.match(/[\u0590-\u05FF]/g);
  const totalChars = text.replace(/\s/g, '').length;
  return hebrewChars !== null && hebrewChars.length / totalChars > 0.5;
}

/**
 * Count sentences in text (simple heuristic: period, exclamation, question mark followed by space or end)
 */
function countSentences(text: string): number {
  if (!text) return 0;
  // Match sentence-ending punctuation followed by space/end
  const matches = text.match(/[.!?](\s|$)/g);
  return matches ? matches.length : 1; // Default to 1 if no punctuation
}

/**
 * Count question marks in text
 */
function countQuestionMarks(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\?/g);
  return matches ? matches.length : 0;
}

/**
 * Validate message and question format
 * Returns validation errors or null if valid
 */
function validateMessageFormat(
  message: string,
  question: string | null
): { messageError?: string; questionError?: string } | null {
  const errors: { messageError?: string; questionError?: string } = {};

  // Message: max 2 sentences
  const messageSentences = countSentences(message);
  if (messageSentences > 2) {
    errors.messageError = `Too many sentences (${messageSentences}, max 2)`;
  }

  // Question: max 1 sentence and max one "?"
  if (question) {
    const questionSentences = countSentences(question);
    if (questionSentences > 1) {
      errors.questionError = `Too many sentences (${questionSentences}, max 1)`;
    }

    const questionMarks = countQuestionMarks(question);
    if (questionMarks > 1) {
      errors.questionError = `Too many question marks (${questionMarks}, max 1)`;
    }
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Enforce type-specific invariants (hard-coded business rules)
 * These override LLM output to ensure consistency
 */
function enforceInvariants(
  output: AssistantOutput,
  context: AssistantContext,
  requestId: string
): AssistantOutput {
  const normalized = { ...output };
  let changed = false;

  // CLARIFY invariants
  if (context.type === 'CLARIFY') {
    // blocksSearch MUST be true
    if (!normalized.blocksSearch) {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'CLARIFY',
        field: 'blocksSearch',
        llmValue: normalized.blocksSearch,
        enforcedValue: true
      }, '[ASSISTANT] Enforcing CLARIFY invariant: blocksSearch=true');
      normalized.blocksSearch = true;
      changed = true;
    }

    // suggestedAction MUST be ASK_LOCATION for MISSING_LOCATION
    if ((context as AssistantClarifyContext).reason === 'MISSING_LOCATION' && 
        normalized.suggestedAction !== 'ASK_LOCATION') {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'CLARIFY',
        reason: 'MISSING_LOCATION',
        field: 'suggestedAction',
        llmValue: normalized.suggestedAction,
        enforcedValue: 'ASK_LOCATION'
      }, '[ASSISTANT] Enforcing CLARIFY+MISSING_LOCATION invariant: suggestedAction=ASK_LOCATION');
      normalized.suggestedAction = 'ASK_LOCATION';
      changed = true;
    }

    // suggestedAction MUST be ASK_FOOD for MISSING_FOOD
    if ((context as AssistantClarifyContext).reason === 'MISSING_FOOD' && 
        normalized.suggestedAction !== 'ASK_FOOD') {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'CLARIFY',
        reason: 'MISSING_FOOD',
        field: 'suggestedAction',
        llmValue: normalized.suggestedAction,
        enforcedValue: 'ASK_FOOD'
      }, '[ASSISTANT] Enforcing CLARIFY+MISSING_FOOD invariant: suggestedAction=ASK_FOOD');
      normalized.suggestedAction = 'ASK_FOOD';
      changed = true;
    }
  }

  // SUMMARY invariants
  // CORRECTNESS: SUMMARY is shown AFTER search completes with results
  // blocksSearch=true would be logically incorrect (search already ran)
  // This enforcement is a safety net - prompt explicitly forbids this
  if (context.type === 'SUMMARY') {
    // blocksSearch MUST be false
    if (normalized.blocksSearch) {
      logger.warn({
        requestId,
        event: 'assistant_invariant_violation_enforced',
        type: 'SUMMARY',
        field: 'blocksSearch',
        llmValue: normalized.blocksSearch,
        enforcedValue: false,
        severity: 'PROMPT_VIOLATION' // LLM ignored explicit prompt rule
      }, '[ASSISTANT] CRITICAL: LLM returned blocksSearch=true for SUMMARY (violates prompt) - enforcing false');
      normalized.blocksSearch = false;
      changed = true;
    }

    // suggestedAction MUST be NONE
    if (normalized.suggestedAction !== 'NONE') {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'SUMMARY',
        field: 'suggestedAction',
        llmValue: normalized.suggestedAction,
        enforcedValue: 'NONE'
      }, '[ASSISTANT] Enforcing SUMMARY invariant: suggestedAction=NONE');
      normalized.suggestedAction = 'NONE';
      changed = true;
    }
  }

  // GATE_FAIL invariants (HARD enforcement)
  if (context.type === 'GATE_FAIL') {
    // blocksSearch MUST be true
    if (!normalized.blocksSearch) {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'GATE_FAIL',
        field: 'blocksSearch',
        llmValue: normalized.blocksSearch,
        enforcedValue: true
      }, '[ASSISTANT] Enforcing GATE_FAIL invariant: blocksSearch=true');
      normalized.blocksSearch = true;
      changed = true;
    }

    // suggestedAction MUST be RETRY (HARD enforcement - changed from soft)
    if (normalized.suggestedAction !== 'RETRY') {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'GATE_FAIL',
        field: 'suggestedAction',
        llmValue: normalized.suggestedAction,
        enforcedValue: 'RETRY'
      }, '[ASSISTANT] Enforcing GATE_FAIL invariant: suggestedAction=RETRY');
      normalized.suggestedAction = 'RETRY';
      changed = true;
    }
  }

  // SEARCH_FAILED invariants
  if (context.type === 'SEARCH_FAILED') {
    // blocksSearch SHOULD typically be true (soft enforcement)
    if (!normalized.blocksSearch) {
      logger.info({
        requestId,
        event: 'assistant_invariant_observation',
        type: 'SEARCH_FAILED',
        field: 'blocksSearch',
        llmValue: normalized.blocksSearch
      }, '[ASSISTANT] SEARCH_FAILED blocksSearch=false (accepting LLM choice)');
    }
  }

  // GENERIC_QUERY_NARRATION invariants
  if (context.type === 'GENERIC_QUERY_NARRATION') {
    // blocksSearch MUST be false (search already ran)
    if (normalized.blocksSearch) {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'GENERIC_QUERY_NARRATION',
        field: 'blocksSearch',
        llmValue: normalized.blocksSearch,
        enforcedValue: false
      }, '[ASSISTANT] Enforcing GENERIC_QUERY_NARRATION invariant: blocksSearch=false');
      normalized.blocksSearch = false;
      changed = true;
    }

    // suggestedAction MUST be REFINE
    if (normalized.suggestedAction !== 'REFINE') {
      logger.warn({
        requestId,
        event: 'assistant_invariant_enforced',
        type: 'GENERIC_QUERY_NARRATION',
        field: 'suggestedAction',
        llmValue: normalized.suggestedAction,
        enforcedValue: 'REFINE'
      }, '[ASSISTANT] Enforcing GENERIC_QUERY_NARRATION invariant: suggestedAction=REFINE');
      normalized.suggestedAction = 'REFINE';
      changed = true;
    }
  }

  if (changed) {
    logger.info({
      requestId,
      event: 'assistant_invariants_applied',
      type: context.type
    }, '[ASSISTANT] Applied type-specific invariants');
  }

  return normalized;
}

/**
 * Get deterministic fallback message for language mismatch OR validation failure
 */
function getDeterministicFallback(
  context: AssistantContext,
  requestedLanguage: 'he' | 'en'
): { message: string; question: string | null; suggestedAction: AssistantOutput['suggestedAction']; blocksSearch: boolean } {
  if (requestedLanguage === 'he') {
    // Hebrew fallbacks (with correct invariants)
    if (context.type === 'CLARIFY') {
      if (context.reason === 'MISSING_LOCATION') {
        return {
          message: 'כדי לחפש מסעדות לידך אני צריך את המיקום שלך.',
          question: 'אפשר לאשר מיקום או לכתוב עיר/אזור?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        };
      } else {
        return {
          message: 'כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה.',
          question: 'איזה אוכל את/ה מחפש/ת?',
          suggestedAction: 'ASK_FOOD',
          blocksSearch: true
        };
      }
    } else if (context.type === 'GATE_FAIL') {
      return {
        message: 'זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: "פיצה בתל אביב".',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };
    } else if (context.type === 'SEARCH_FAILED') {
      return {
        message: 'משהו השתבש בחיפוש. אפשר לנסות שוב?',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };
    } else if (context.type === 'GENERIC_QUERY_NARRATION') {
      // Generic query narration - explain assumption and ask for refinement
      return {
        message: 'חיפשתי לפי המיקום הנוכחי שלך.',
        question: 'איזה סוג אוכל מעניין אותך?',
        suggestedAction: 'REFINE',
        blocksSearch: false
      };
    } else {
      // SUMMARY - insight-based fallback (NO generic "found X results")
      const count = (context as any).resultCount || 0;
      const metadata = (context as any).metadata || {};
      
      if (count === 0) {
        return {
          message: 'לא מצאתי תוצאות. נסה להרחיב רדיוס חיפוש או להסיר סינון.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        };
      }
      
      // Provide insight based on available metadata
      if (metadata.openNowCount !== undefined && metadata.openNowCount < count / 2) {
        return {
          message: 'רוב המקומות סגורים עכשיו. אפשר לסנן ל"פתוח עכשיו" או לחפש שוב מאוחר יותר.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        };
      }
      
      return {
        message: 'יש כמה אפשרויות טובות באזור. אפשר למיין לפי מרחק או דירוג.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };
    }
  } else {
    // English fallbacks (with correct invariants)
    if (context.type === 'CLARIFY') {
      if (context.reason === 'MISSING_LOCATION') {
        return {
          message: 'To search for restaurants near you, I need your location.',
          question: 'Can you enable location or enter a city/area?',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: true
        };
      } else {
        return {
          message: 'To search well, I need 2 things: what food + where.',
          question: 'What type of food are you looking for?',
          suggestedAction: 'ASK_FOOD',
          blocksSearch: true
        };
      }
    } else if (context.type === 'GATE_FAIL') {
      return {
        message: 'This doesn\'t look like a food/restaurant search. Try: "pizza in Tel Aviv".',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };
    } else if (context.type === 'SEARCH_FAILED') {
      return {
        message: 'Something went wrong with the search. Can you try again?',
        question: null,
        suggestedAction: 'RETRY',
        blocksSearch: true
      };
    } else if (context.type === 'GENERIC_QUERY_NARRATION') {
      // Generic query narration - explain assumption and ask for refinement
      return {
        message: 'I searched near your current location.',
        question: 'What type of cuisine interests you?',
        suggestedAction: 'REFINE',
        blocksSearch: false
      };
    } else {
      // SUMMARY - insight-based fallback (NO generic "found X results")
      const count = (context as any).resultCount || 0;
      const metadata = (context as any).metadata || {};
      
      if (count === 0) {
        return {
          message: 'No results found. Try expanding search radius or removing filters.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        };
      }
      
      // Provide insight based on available metadata
      if (metadata.openNowCount !== undefined && metadata.openNowCount < count / 2) {
        return {
          message: 'Most places are closed right now. Filter by "open now" or search again later.',
          question: null,
          suggestedAction: 'NONE',
          blocksSearch: false
        };
      }
      
      return {
        message: 'Several good options in the area. Sort by distance or rating to refine.',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };
    }
  }
}

/**
 * Validate language, format, and enforce correctness
 * Returns corrected output if validation fails
 */
function validateAndEnforceCorrectness(
  output: AssistantOutput,
  requestedLanguage: 'he' | 'en',
  context: AssistantContext,
  requestId: string
): AssistantOutput {
  let useFallback = false;
  const validationIssues: string[] = [];

  // 1. Validate language match
  const messageIsHebrew = isHebrewText(output.message);
  const questionIsHebrew = output.question ? isHebrewText(output.question) : null;

  const requestedHebrew = requestedLanguage === 'he';
  const messageMismatch = messageIsHebrew !== requestedHebrew;
  const questionMismatch = questionIsHebrew !== null && questionIsHebrew !== requestedHebrew;

  if (messageMismatch || questionMismatch) {
    validationIssues.push(`language_mismatch (requested=${requestedLanguage}, message=${messageIsHebrew ? 'he' : 'en'})`);
    useFallback = true;
  }

  // 2. Validate message/question format
  const formatErrors = validateMessageFormat(output.message, output.question);
  if (formatErrors) {
    if (formatErrors.messageError) {
      validationIssues.push(`message_format: ${formatErrors.messageError}`);
    }
    if (formatErrors.questionError) {
      validationIssues.push(`question_format: ${formatErrors.questionError}`);
    }
    useFallback = true;
  }

  if (useFallback) {
    logger.warn({
      requestId,
      event: 'assistant_validation_failed',
      requestedLanguage,
      validationIssues,
      usingFallback: true
    }, '[ASSISTANT] Validation failed - using deterministic fallback');

    const fallback = getDeterministicFallback(context, requestedLanguage);

    return {
      type: output.type,
      message: fallback.message,
      question: fallback.question,
      suggestedAction: fallback.suggestedAction,
      blocksSearch: fallback.blocksSearch
    };
  }

  return output;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Generate assistant message via LLM
 * With deterministic validation, invariant enforcement, and fallback
 */
export async function generateAssistantMessage(
  context: AssistantContext,
  llmProvider: LLMProvider,
  requestId: string,
  opts?: { timeout?: number; model?: string; traceId?: string; sessionId?: string }
): Promise<AssistantOutput> {
  const startTime = Date.now();
  const questionLanguage = context.language === 'other' ? 'en' : context.language;

  try {
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'user' as const, content: buildUserPrompt(context) }
    ];

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_start',
      type: context.type,
      reason: (context as any).reason,
      questionLanguage,
      queryLen: context.query.length,
      schemaVersion: ASSISTANT_SCHEMA_VERSION,
      promptVersion: ASSISTANT_PROMPT_VERSION
    }, '[ASSISTANT] Calling LLM');

    const llmOpts = buildLLMOptions('assistant', {
      temperature: 0.7,
      requestId,
      stage: 'assistant_llm',
      promptLength: messages.reduce((sum, m) => sum + m.content.length, 0)
    });

    if (opts?.model) llmOpts.model = opts.model;
    if (opts?.timeout) llmOpts.timeout = opts.timeout;
    if (opts?.traceId) (llmOpts as any).traceId = opts.traceId;
    if (opts?.sessionId) (llmOpts as any).sessionId = opts.sessionId;
    
    // CORRECTNESS FIX: Always emit promptVersion and schemaHash for telemetry
    (llmOpts as any).promptVersion = ASSISTANT_PROMPT_VERSION;
    (llmOpts as any).schemaHash = ASSISTANT_SCHEMA_HASH;

    const result = await llmProvider.completeJSON(
      messages,
      AssistantOutputSchema,
      llmOpts,
      ASSISTANT_JSON_SCHEMA
    );

    const durationMs = Date.now() - startTime;

    // STEP 1: Enforce type-specific invariants (hard-coded business rules)
    const withInvariants = enforceInvariants(result.data, context, requestId);

    // STEP 2: Validate and enforce correctness (language + format)
    const validated = validateAndEnforceCorrectness(
      withInvariants,
      questionLanguage,
      context,
      requestId
    );

    logger.info({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_success',
      type: validated.type,
      questionLanguage,
      suggestedAction: validated.suggestedAction,
      blocksSearch: validated.blocksSearch, // Log final value after enforcement
      durationMs,
      usage: result.usage,
      model: result.model
    }, '[ASSISTANT] LLM generated and validated message');

    return validated;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout') || errorMsg.toLowerCase().includes('abort');

    logger.error({
      requestId,
      stage: 'assistant_llm',
      event: 'assistant_llm_failed',
      type: context.type,
      questionLanguage,
      error: errorMsg,
      isTimeout,
      durationMs
    }, '[ASSISTANT] LLM call failed - using deterministic fallback');

    // Use deterministic fallback on LLM error/timeout
    const fallback = getDeterministicFallback(context, questionLanguage);

    return {
      type: context.type,
      message: fallback.message,
      question: fallback.question,
      suggestedAction: fallback.suggestedAction,
      blocksSearch: fallback.blocksSearch
    };
  }
}
