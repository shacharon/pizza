/**
 * Validation Rules Module
 * Format validation, invariant enforcement, and language correctness
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { AssistantLanguage } from './language-detector.js';
import { detectMessageLanguage, detectMismatch, getMessagePreview } from './language-detector.js';
import type { AssistantOutput } from './assistant-llm.service.js';
import { getDeterministicFallback } from './fallback-messages.js';
import type { AssistantContext } from './fallback-messages.js';

const ASSISTANT_LANG_DEBUG = process.env.ASSISTANT_LANG_DEBUG === '1';

/**
 * Count sentences in text
 */
function countSentences(text: string): number {
  if (!text) return 0;
  const matches = text.match(/[.!?](\s|$)/g);
  return matches ? matches.length : 1;
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
 * Validate message format (sentence count, question marks)
 */
export function validateMessageFormat(
  message: string,
  question: string | null
): { messageError?: string; questionError?: string } | null {
  const errors: { messageError?: string; questionError?: string } = {};

  const messageSentences = countSentences(message);
  if (messageSentences > 2) errors.messageError = `Too many sentences (${messageSentences}, max 2)`;

  if (question) {
    const questionSentences = countSentences(question);
    if (questionSentences > 1) errors.questionError = `Too many sentences (${questionSentences}, max 1)`;

    const questionMarks = countQuestionMarks(question);
    if (questionMarks > 1) errors.questionError = `Too many question marks (${questionMarks}, max 1)`;
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/**
 * Enforce type-specific invariants (blocksSearch, suggestedAction)
 */
export function enforceInvariants(
  output: AssistantOutput,
  context: AssistantContext,
  requestId: string
): AssistantOutput {
  const normalized = { ...output };
  let changed = false;

  if (context.type === 'CLARIFY') {
    if (!normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'CLARIFY', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: true },
        '[ASSISTANT] Enforcing CLARIFY invariant: blocksSearch=true');
      normalized.blocksSearch = true;
      changed = true;
    }

    if ((context as any).reason === 'MISSING_LOCATION' && normalized.suggestedAction !== 'ASK_LOCATION') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'CLARIFY', reason: 'MISSING_LOCATION', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'ASK_LOCATION' },
        '[ASSISTANT] Enforcing CLARIFY+MISSING_LOCATION invariant: suggestedAction=ASK_LOCATION');
      normalized.suggestedAction = 'ASK_LOCATION';
      changed = true;
    }

    if ((context as any).reason === 'MISSING_FOOD' && normalized.suggestedAction !== 'ASK_FOOD') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'CLARIFY', reason: 'MISSING_FOOD', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'ASK_FOOD' },
        '[ASSISTANT] Enforcing CLARIFY+MISSING_FOOD invariant: suggestedAction=ASK_FOOD');
      normalized.suggestedAction = 'ASK_FOOD';
      changed = true;
    }
  }

  if (context.type === 'SUMMARY') {
    if (normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_violation_enforced', type: 'SUMMARY', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: false, severity: 'PROMPT_VIOLATION' },
        '[ASSISTANT] CRITICAL: LLM returned blocksSearch=true for SUMMARY - enforcing false');
      normalized.blocksSearch = false;
      changed = true;
    }

    if (normalized.suggestedAction !== 'NONE') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'SUMMARY', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'NONE' },
        '[ASSISTANT] Enforcing SUMMARY invariant: suggestedAction=NONE');
      normalized.suggestedAction = 'NONE';
      changed = true;
    }
  }

  if (context.type === 'GATE_FAIL') {
    if (!normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GATE_FAIL', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: true },
        '[ASSISTANT] Enforcing GATE_FAIL invariant: blocksSearch=true');
      normalized.blocksSearch = true;
      changed = true;
    }

    if (normalized.suggestedAction !== 'RETRY') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GATE_FAIL', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'RETRY' },
        '[ASSISTANT] Enforcing GATE_FAIL invariant: suggestedAction=RETRY');
      normalized.suggestedAction = 'RETRY';
      changed = true;
    }
  }

  if (context.type === 'GENERIC_QUERY_NARRATION') {
    if (normalized.blocksSearch) {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GENERIC_QUERY_NARRATION', field: 'blocksSearch', llmValue: normalized.blocksSearch, enforcedValue: false },
        '[ASSISTANT] Enforcing GENERIC_QUERY_NARRATION invariant: blocksSearch=false');
      normalized.blocksSearch = false;
      changed = true;
    }

    if (normalized.suggestedAction !== 'REFINE') {
      logger.warn({ requestId, event: 'assistant_invariant_enforced', type: 'GENERIC_QUERY_NARRATION', field: 'suggestedAction', llmValue: normalized.suggestedAction, enforcedValue: 'REFINE' },
        '[ASSISTANT] Enforcing GENERIC_QUERY_NARRATION invariant: suggestedAction=REFINE');
      normalized.suggestedAction = 'REFINE';
      changed = true;
    }
  }

  if (changed) {
    logger.info({ requestId, event: 'assistant_invariants_applied', type: context.type }, '[ASSISTANT] Applied type-specific invariants');
  }

  return normalized;
}

/**
 * Validate language + format; fallback on mismatch
 */
export function validateAndEnforceCorrectness(
  output: AssistantOutput,
  requestedLanguage: Exclude<AssistantLanguage, 'other'>,
  context: AssistantContext,
  requestId: string
): AssistantOutput {
  let useFallback = false;
  const validationIssues: string[] = [];

  // 1) Language validation (script-based) - ONLY check message field
  const msgLang = detectMessageLanguage(output.message);

  const messageMismatch = detectMismatch(msgLang, requestedLanguage);

  if (messageMismatch) {
    validationIssues.push(`language_mismatch (requested=${requestedLanguage}, detected=${msgLang})`);
    useFallback = true;

    if (ASSISTANT_LANG_DEBUG) {
      logger.warn({
        requestId,
        event: 'assistant_language_mismatch_debug',
        requestedLang: requestedLanguage,
        messageDetected: msgLang,
        checkedField: 'message',
        messagePreview: getMessagePreview(output.message),
        willUseFallback: true
      }, '[ASSISTANT_DEBUG] Language mismatch detected in message field');
    }
  }

  // Debug log for successful validation (when enabled)
  if (!messageMismatch && ASSISTANT_LANG_DEBUG) {
    logger.info({
      requestId,
      event: 'assistant_language_validated',
      requestedLang: requestedLanguage,
      messageDetected: msgLang,
      checkedField: 'message',
      messagePreview: getMessagePreview(output.message)
    }, '[ASSISTANT_DEBUG] Language validation passed');
  }

  // 2) Format validation
  const formatErrors = validateMessageFormat(output.message, output.question);
  if (formatErrors) {
    if (formatErrors.messageError) validationIssues.push(`message_format: ${formatErrors.messageError}`);
    if (formatErrors.questionError) validationIssues.push(`question_format: ${formatErrors.questionError}`);
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
