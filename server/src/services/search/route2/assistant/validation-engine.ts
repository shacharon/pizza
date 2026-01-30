/**
 * Assistant Validation Engine
 * Validates LLM output and enforces business rules
 * 
 * Responsibility: 
 * - Validate language match (delegates to text-validator)
 * - Validate message/question format (delegates to text-validator)
 * - Enforce type-specific invariants
 * - Coordinate fallback generation (delegates to fallback-generator)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type {
  AssistantContext,
  AssistantGateContext,
  AssistantClarifyContext,
  AssistantOutput
} from './assistant.types.js';
import { 
  isHebrewText, 
  validateMessageFormat,
  type ValidationErrors 
} from './text-validator.js';
import { getDeterministicFallback } from './fallback-generator.js';

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
}
