/**
 * Fallback Generator
 * Provides deterministic fallback messages for assistant validation failures
 */

import type {
  AssistantContext,
  AssistantClarifyContext,
  AssistantOutput
} from './assistant.types.js';

/**
 * Fallback result
 */
export interface FallbackResult {
  message: string;
  question: string | null;
  suggestedAction: AssistantOutput['suggestedAction'];
  blocksSearch: boolean;
}

/**
 * Get deterministic fallback message for language mismatch or validation failure
 * Public for use by LLMClient error handling
 */
export function getDeterministicFallback(
  context: AssistantContext,
  requestedLanguage: 'he' | 'en'
): FallbackResult {
  if (requestedLanguage === 'he') {
    return getHebrewFallback(context);
  } else {
    return getEnglishFallback(context);
  }
}

/**
 * Hebrew fallbacks for all context types
 */
function getHebrewFallback(context: AssistantContext): FallbackResult {
  if (context.type === 'CLARIFY') {
    if ((context as AssistantClarifyContext).reason === 'MISSING_LOCATION') {
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
      message: 'זה לא נראה כמו חיפוש אוכל/מסעדות.',
      question: 'מה תרצה/י לאכול ובאיזה עיר/אזור?',
      suggestedAction: 'ASK_FOOD',
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
    return {
      message: 'חיפשתי לפי המיקום הנוכחי שלך.',
      question: 'איזה סוג אוכל מעניין אותך?',
      suggestedAction: 'REFINE',
      blocksSearch: false
    };
  } else {
    // SUMMARY
    return getHebrewSummaryFallback(context);
  }
}

/**
 * Hebrew summary fallbacks (context-aware)
 */
function getHebrewSummaryFallback(context: AssistantContext): FallbackResult {
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

/**
 * English fallbacks for all context types
 */
function getEnglishFallback(context: AssistantContext): FallbackResult {
  if (context.type === 'CLARIFY') {
    if ((context as AssistantClarifyContext).reason === 'MISSING_LOCATION') {
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
      message: "This doesn't look like a food/restaurant search.",
      question: 'What do you want to eat, and in which city/area?',
      suggestedAction: 'ASK_FOOD',
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
    return {
      message: 'I searched near your current location.',
      question: 'What type of cuisine interests you?',
      suggestedAction: 'REFINE',
      blocksSearch: false
    };
  } else {
    // SUMMARY
    return getEnglishSummaryFallback(context);
  }
}

/**
 * English summary fallbacks (context-aware)
 */
function getEnglishSummaryFallback(context: AssistantContext): FallbackResult {
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
