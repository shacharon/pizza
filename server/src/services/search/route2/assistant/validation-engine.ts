/**
 * Assistant Validation Engine
 * Validates LLM output, enforces business rules, provides fallbacks
 * 
 * Responsibility: 
 * - Validate language match
 * - Validate message/question format
 * - Enforce type-specific invariants
 * - Provide deterministic fallbacks
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type {
  AssistantContext,
  AssistantGateContext,
  AssistantClarifyContext,
  AssistantSummaryContext,
  AssistantSearchFailedContext,
  AssistantGenericQueryNarrationContext,
  AssistantOutput
} from './assistant.types.js';

/**
 * Validation error result
 */
interface ValidationErrors {
  messageError?: string;
  questionError?: string;
}

/**
 * Assistant Validation Engine
 */
export class AssistantValidationEngine {
  /**
   * Main entry point: validate and correct LLM output
   */
  validateAndCorrect(
    output: AssistantOutput,
    requestedLanguage: 'he' | 'en',
    context: AssistantContext,
    requestId: string
  ): AssistantOutput {
    let useFallback = false;
    const validationIssues: string[] = [];

    // 1. Validate language match
    const messageIsHebrew = this.isHebrewText(output.message);
    const questionIsHebrew = output.question ? this.isHebrewText(output.question) : null;

    const requestedHebrew = requestedLanguage === 'he';
    const messageMismatch = messageIsHebrew !== requestedHebrew;
    const questionMismatch = questionIsHebrew !== null && questionIsHebrew !== requestedHebrew;

    if (messageMismatch || questionMismatch) {
      validationIssues.push(`language_mismatch (requested=${requestedLanguage}, message=${messageIsHebrew ? 'he' : 'en'})`);
      useFallback = true;
    }

    // 2. Validate message/question format
    const formatErrors = this.validateMessageFormat(output.message, output.question);
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

      const fallback = this.getDeterministicFallback(context, requestedLanguage);

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

  /**
   * Enforce type-specific invariants (hard-coded business rules)
   * These override LLM output to ensure consistency
   */
  enforceInvariants(
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
      if (!normalized.blocksSearch) {
        /* keep as-is */
        normalized.blocksSearch = true;
        changed = true;
      }

      const desired =
        (context as AssistantGateContext).reason === 'NO_FOOD'
          ? 'ASK_FOOD'
          : 'ASK_FOOD';

      if (normalized.suggestedAction !== desired) {
        logger.warn({
          requestId,
          event: 'assistant_invariant_enforced',
          type: 'GATE_FAIL',
          reason: (context as AssistantGateContext).reason,
          field: 'suggestedAction',
          llmValue: normalized.suggestedAction,
          enforcedValue: desired
        }, `[ASSISTANT] Enforcing GATE_FAIL invariant: suggestedAction=${desired}`);
        normalized.suggestedAction = desired;
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

  // ========================================================================
  // Private Helpers
  // ========================================================================

  /**
   * Detect if text is primarily Hebrew
   */
  private isHebrewText(text: string): boolean {
    const hebrewChars = text.match(/[\u0590-\u05FF]/g);
    const totalChars = text.replace(/\s/g, '').length;
    return hebrewChars !== null && hebrewChars.length / totalChars > 0.5;
  }

  /**
   * Count sentences in text (simple heuristic: period, exclamation, question mark followed by space or end)
   */
  private countSentences(text: string): number {
    if (!text) return 0;
    // Match sentence-ending punctuation followed by space/end
    const matches = text.match(/[.!?](\s|$)/g);
    return matches ? matches.length : 1; // Default to 1 if no punctuation
  }

  /**
   * Count question marks in text
   */
  private countQuestionMarks(text: string): number {
    if (!text) return 0;
    const matches = text.match(/\?/g);
    return matches ? matches.length : 0;
  }

  /**
   * Validate message and question format
   * Returns validation errors or null if valid
   */
  private validateMessageFormat(
    message: string,
    question: string | null
  ): ValidationErrors | null {
    const errors: ValidationErrors = {};

    // Message: max 2 sentences
    const messageSentences = this.countSentences(message);
    if (messageSentences > 2) {
      errors.messageError = `Too many sentences (${messageSentences}, max 2)`;
    }

    // Question: max 1 sentence and max one "?"
    if (question) {
      const questionSentences = this.countSentences(question);
      if (questionSentences > 1) {
        errors.questionError = `Too many sentences (${questionSentences}, max 1)`;
      }

      const questionMarks = this.countQuestionMarks(question);
      if (questionMarks > 1) {
        errors.questionError = `Too many question marks (${questionMarks}, max 1)`;
      }
    }

    return Object.keys(errors).length > 0 ? errors : null;
  }

  /**
   * Get deterministic fallback message for language mismatch OR validation failure
   * Public for use by LLMClient error handling
   */
  getDeterministicFallback(
    context: AssistantContext,
    requestedLanguage: 'he' | 'en'
  ): {
    message: string;
    question: string | null;
    suggestedAction: AssistantOutput['suggestedAction'];
    blocksSearch: boolean;
  } {
    if (requestedLanguage === 'he') {
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
    } else {
      // English fallbacks
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
    }
  }
}
