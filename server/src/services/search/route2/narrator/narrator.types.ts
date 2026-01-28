/**
 * Assistant Narrator Types & Schema
 * 
 * Generates UX-facing assistant messages for 3 trigger points:
 * 1) GATE_FAIL (foodSignal=NO/UNCERTAIN)
 * 2) CLARIFY (location/food missing)
 * 3) SUMMARY (end of search)
 */

import { z } from 'zod';
import { createHash } from 'crypto';

// ============================================================================
// Narrator Output Schema (Zod as source of truth)
// ============================================================================

export const NarratorOutputSchema = z.object({
  type: z.enum(['GATE_FAIL', 'CLARIFY', 'SUMMARY']),
  message: z.string().max(240), // Max 240 chars, max 2 sentences
  question: z.string().max(240).nullable(), // Only allowed when type=CLARIFY
  suggestedAction: z.enum([
    'NONE',
    'ASK_LOCATION',
    'ASK_FOOD',
    'RELAX_OPENNOW',
    'EXPAND_RADIUS',
    'ADD_FILTER'
  ]),
  blocksSearch: z.boolean()
}).strict();

export type NarratorOutput = z.infer<typeof NarratorOutputSchema>;

// Static JSON Schema for OpenAI
export const NARRATOR_JSON_SCHEMA = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      enum: ['GATE_FAIL', 'CLARIFY', 'SUMMARY']
    },
    message: {
      type: 'string',
      maxLength: 240
    },
    question: {
      type: ['string', 'null'],
      maxLength: 240
    },
    suggestedAction: {
      type: 'string',
      enum: ['NONE', 'ASK_LOCATION', 'ASK_FOOD', 'RELAX_OPENNOW', 'EXPAND_RADIUS', 'ADD_FILTER']
    },
    blocksSearch: {
      type: 'boolean'
    }
  },
  required: ['type', 'message', 'question', 'suggestedAction', 'blocksSearch'],
  additionalProperties: false
} as const;

export const NARRATOR_SCHEMA_HASH = createHash('sha256')
  .update(JSON.stringify(NARRATOR_JSON_SCHEMA))
  .digest('hex')
  .substring(0, 12);

// ============================================================================
// Input Context Types
// ============================================================================

export interface NarratorGateContext {
  type: 'GATE_FAIL';
  reason: 'NO_FOOD' | 'UNCERTAIN_FOOD';
  query: string;
  language: 'he' | 'en' | 'other';
  locationKnown: boolean;
}

export interface NarratorClarifyContext {
  type: 'CLARIFY';
  reason: 'MISSING_LOCATION' | 'MISSING_FOOD' | 'AMBIGUOUS';
  query: string;
  language: 'he' | 'en' | 'other';
  locationKnown: boolean;
}

export interface NarratorSummaryContext {
  type: 'SUMMARY';
  query: string;
  language: 'he' | 'en' | 'other';
  resultCount: number;
  top3Names: string[];
  openNowCount: number;
  avgRating: number | null;
  appliedFilters: string[];
}

export type NarratorContext = 
  | NarratorGateContext 
  | NarratorClarifyContext 
  | NarratorSummaryContext;

// ============================================================================
// Deterministic Fallback Messages
// ============================================================================

export const FALLBACK_MESSAGES: Record<string, { he: string; en: string; other: string }> = {
  GATE_FAIL_NO: {
    he: "זה לא נראה כמו חיפוש אוכל/מסעדות. נסה למשל: 'פיצה בתל אביב'.",
    en: "This doesn't look like a food search. Try: 'pizza in Tel Aviv'.",
    other: "This doesn't look like a food search. Try: 'pizza in Tel Aviv'."
  },
  GATE_FAIL_UNCERTAIN: {
    he: "לא בטוח מה אתה מחפש. נסה: 'סושי באשקלון' או 'פיצה ליד הבית'.",
    en: "Not sure what you're looking for. Try: 'sushi in Ashkelon'.",
    other: "Not sure what you're looking for. Try: 'sushi in Ashkelon'."
  },
  CLARIFY_LOCATION: {
    he: "כדי לחפש מסעדות לידי אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.",
    en: "To search nearby, I need your location. Enable location or specify a city.",
    other: "To search nearby, I need your location. Enable location or specify a city."
  },
  CLARIFY_FOOD: {
    he: "כדי לחפש טוב צריך 2 דברים: מה אוכלים + איפה. לדוגמה: 'סושי באשקלון'.",
    en: "To search well, I need 2 things: what food + where. Example: 'sushi in Ashkelon'.",
    other: "To search well, I need 2 things: what food + where. Example: 'sushi in Ashkelon'."
  },
  SUMMARY_ZERO: {
    he: "לא מצאתי תוצאות. נסה להרחיב את החיפוש או לשנות את הפילטרים.",
    en: "No results found. Try expanding the search or changing filters.",
    other: "No results found. Try expanding the search or changing filters."
  },
  SUMMARY_SUCCESS: {
    he: "מצאתי {count} מקומות. תן מבט ב-{top}. נסה גם סינון לפי 'פתוח עכשיו'.",
    en: "Found {count} places. Check out {top}. Try filtering by 'open now'.",
    other: "Found {count} places. Check out {top}. Try filtering by 'open now'."
  }
};

/**
 * Get deterministic fallback message based on context
 */
export function getFallbackMessage(context: NarratorContext): NarratorOutput {
  const lang = context.language === 'he' ? 'he' : context.language === 'en' ? 'en' : 'other';

  if (context.type === 'GATE_FAIL') {
    const key = context.reason === 'NO_FOOD' ? 'GATE_FAIL_NO' : 'GATE_FAIL_UNCERTAIN';
    const fallback = FALLBACK_MESSAGES[key];
    if (!fallback) {
      throw new Error(`Missing fallback for key: ${key}`);
    }
    return {
      type: 'GATE_FAIL',
      message: fallback[lang],
      question: null,
      suggestedAction: 'ASK_FOOD',
      blocksSearch: true
    };
  }

  if (context.type === 'CLARIFY') {
    const key = context.reason === 'MISSING_LOCATION' ? 'CLARIFY_LOCATION' : 'CLARIFY_FOOD';
    const fallback = FALLBACK_MESSAGES[key];
    if (!fallback) {
      throw new Error(`Missing fallback for key: ${key}`);
    }
    return {
      type: 'CLARIFY',
      message: fallback[lang],
      question: fallback[lang],
      suggestedAction: context.reason === 'MISSING_LOCATION' ? 'ASK_LOCATION' : 'ASK_FOOD',
      blocksSearch: true
    };
  }

  // SUMMARY
  if (context.resultCount === 0) {
    const fallback = FALLBACK_MESSAGES.SUMMARY_ZERO;
    if (!fallback) {
      throw new Error('Missing fallback for SUMMARY_ZERO');
    }
    return {
      type: 'SUMMARY',
      message: fallback[lang],
      question: null,
      suggestedAction: 'EXPAND_RADIUS',
      blocksSearch: false
    };
  }

  const top = context.top3Names.slice(0, 2).join(', ');
  const fallback = FALLBACK_MESSAGES.SUMMARY_SUCCESS;
  if (!fallback) {
    throw new Error('Missing fallback for SUMMARY_SUCCESS');
  }
  const message = fallback[lang]
    .replace('{count}', context.resultCount.toString())
    .replace('{top}', top);

  return {
    type: 'SUMMARY',
    message,
    question: null,
    suggestedAction: 'NONE',
    blocksSearch: false
  };
}
