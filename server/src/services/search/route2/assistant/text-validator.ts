/**
 * Text Validator
 * Pure text analysis functions for assistant validation
 */

/**
 * Validation error result
 */
export interface ValidationErrors {
  messageError?: string | undefined;
  questionError?: string | undefined;
}

/**
 * Detect if text is primarily Hebrew
 * Uses Unicode range for Hebrew characters (U+0590–U+05FF)
 */
export function isHebrewText(text: string): boolean {
  const hebrewChars = text.match(/[\u0590-\u05FF]/g);
  const totalChars = text.replace(/\s/g, '').length;
  return hebrewChars !== null && hebrewChars.length / totalChars > 0.5;
}

/**
 * Count sentences in text
 * Heuristic: period, exclamation, question mark followed by space or end
 */
export function countSentences(text: string): number {
  if (!text) return 0;
  // Match sentence-ending punctuation followed by space/end
  const matches = text.match(/[.!?](\s|$)/g);
  return matches ? matches.length : 1; // Default to 1 if no punctuation
}

/**
 * Count question marks in text
 */
export function countQuestionMarks(text: string): number {
  if (!text) return 0;
  const matches = text.match(/\?/g);
  return matches ? matches.length : 0;
}

/**
 * Validate message and question format
 * Returns validation errors or null if valid
 */
export function validateMessageFormat(
  message: string,
  question: string | null
): ValidationErrors | null {
  const errors: ValidationErrors = {};

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
