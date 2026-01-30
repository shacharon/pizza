/**
 * Ranking Suggestion Service
 * 
 * Generates actionable suggestions based on RankingSignals.
 * Only called when triggers fire or user clicks "load more".
 */

import { z } from 'zod';
import type { LLMProvider } from '../../../../llm/types.js';
import type { RankingSignals } from '../ranking/ranking-signals.js';
import { completeJSONWithPurpose } from '../../../../lib/llm/llm-client.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import {
  buildRankingSuggestionPrompt,
  RANKING_SUGGESTION_SYSTEM_PROMPT,
  type RankingSuggestionContext
} from './prompts/ranking-suggestion.prompt.js';

/**
 * Ranking Suggestion Output Schema (strict)
 */
export const RankingSuggestionSchema = z.object({
  message: z.string(),
  suggestion: z.string().nullable(),
  suggestedAction: z.enum(['REFINE_LOCATION', 'ADD_MIN_RATING', 'REMOVE_OPEN_NOW', 'REMOVE_PRICE', 'NONE'])
}).strict();

export type RankingSuggestion = z.infer<typeof RankingSuggestionSchema>;

/**
 * Check if ranking suggestion should be shown
 * 
 * Show when:
 * - Any trigger is active (lowResults, relaxUsed, manyOpenUnknown, dominatedByOneFactor)
 * - OR user explicitly requests "load more" (handled by caller)
 */
export function shouldShowRankingSuggestion(rankingSignals: RankingSignals): boolean {
  const { triggers } = rankingSignals;
  return (
    triggers.lowResults ||
    triggers.relaxUsed ||
    triggers.manyOpenUnknown ||
    triggers.dominatedByOneFactor
  );
}

/**
 * Generate ranking suggestion using LLM
 * 
 * @param uiLanguage - User's UI language (he or en)
 * @param query - Original search query
 * @param rankingSignals - Ranking signals from post-filter + ranking
 * @param llmProvider - LLM provider instance
 * @param requestId - Request ID for logging
 * @returns Ranking suggestion with message and action
 */
export async function generateRankingSuggestion(
  uiLanguage: 'he' | 'en',
  query: string,
  rankingSignals: RankingSignals,
  llmProvider: LLMProvider,
  requestId: string
): Promise<RankingSuggestion> {
  const startTime = Date.now();

  try {
    // Build context
    const context: RankingSuggestionContext = {
      uiLanguage,
      query,
      rankingSignals
    };

    // Build prompts
    const systemPrompt = RANKING_SUGGESTION_SYSTEM_PROMPT;
    const userPrompt = buildRankingSuggestionPrompt(context);

    // Call LLM with ranking_profile purpose (fast, simple extraction)
    const result = await completeJSONWithPurpose(
      llmProvider,
      'ranking_profile', // Reuse ranking_profile purpose (2500ms timeout)
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      RankingSuggestionSchema,
      null, // No static schema
      {
        temperature: 0.3, // Slightly higher for more natural suggestions
        requestId,
        stage: 'ranking_suggestion'
      }
    );

    const suggestion = result.data;

    logger.info({
      requestId,
      event: 'ranking_suggestion_generated',
      profile: rankingSignals.profile,
      suggestedAction: suggestion.suggestedAction,
      hasSuggestion: !!suggestion.suggestion,
      durationMs: Date.now() - startTime
    }, '[RANKING_SUGGESTION] Generated suggestion');

    return suggestion;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'ranking_suggestion_failed',
      error: msg,
      durationMs: Date.now() - startTime
    }, '[RANKING_SUGGESTION] Failed to generate suggestion');

    // Fallback to generic message
    return generateFallbackSuggestion(uiLanguage, rankingSignals);
  }
}

/**
 * Generate fallback suggestion when LLM fails
 * Deterministic fallback based on triggers
 */
function generateFallbackSuggestion(
  uiLanguage: 'he' | 'en',
  rankingSignals: RankingSignals
): RankingSuggestion {
  const { triggers, facts } = rankingSignals;

  // Priority 1: Low results
  if (triggers.lowResults) {
    if (uiLanguage === 'he') {
      return {
        message: 'מצאנו מעט תוצאות. נסה להרחיב את החיפוש.',
        suggestion: 'הסר סינונים',
        suggestedAction: 'REMOVE_OPEN_NOW'
      };
    }
    return {
      message: 'Found few results. Try expanding your search.',
      suggestion: 'Remove filters',
      suggestedAction: 'REMOVE_OPEN_NOW'
    };
  }

  // Priority 2: Relaxation used
  if (triggers.relaxUsed) {
    if (uiLanguage === 'he') {
      return {
        message: 'הרחבנו את החיפוש כדי למצוא יותר תוצאות.',
        suggestion: null,
        suggestedAction: 'NONE'
      };
    }
    return {
      message: 'We expanded the search to find more results.',
      suggestion: null,
      suggestedAction: 'NONE'
    };
  }

  // Priority 3: Many open unknown
  if (triggers.manyOpenUnknown) {
    if (uiLanguage === 'he') {
      return {
        message: 'אין מידע על שעות פתיחה לחלק מהמקומות.',
        suggestion: 'נסה ללא סינון שעות',
        suggestedAction: 'REMOVE_OPEN_NOW'
      };
    }
    return {
      message: 'Hours information is incomplete for some places.',
      suggestion: 'Try without hours filter',
      suggestedAction: 'REMOVE_OPEN_NOW'
    };
  }

  // Default: No suggestion needed
  if (uiLanguage === 'he') {
    return {
      message: `מצאנו ${facts.shownNow} תוצאות.`,
      suggestion: null,
      suggestedAction: 'NONE'
    };
  }
  return {
    message: `Found ${facts.shownNow} results.`,
    suggestion: null,
    suggestedAction: 'NONE'
  };
}
