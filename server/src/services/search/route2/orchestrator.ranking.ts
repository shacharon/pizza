/**
 * Orchestrator Ranking Module
 * Handles LLM-driven ranking profile selection and deterministic scoring
 */

import type { Route2Context, IntentResult, RouteLLMMapping } from './types.js';
import type { FinalSharedFilters } from './shared/shared-filters.types.js';
import { getRankingLLMConfig } from '../config/ranking.config.js';
import { selectRankingProfile, type RankingContext } from './ranking/ranking-profile-llm.service.js';
import { rankResults, computeScoreBreakdown } from './ranking/results-ranker.js';
import { buildRankingSignals, type RankingSignals, type RelaxationApplied, type OpenUnknownStats } from './ranking/ranking-signals.js';
import { logger } from '../../../lib/logger/structured-logger.js';

/**
 * Ranking Result
 * Returns ranked results + ranking signals for metadata
 */
export interface RankingResult {
  rankedResults: any[];
  signals: RankingSignals | null;
}

/**
 * Apply LLM-driven ranking to results (if enabled) and build ranking signals
 * 
 * This is the ONLY place where ranking is applied.
 * Called after post-filters in orchestrator.
 * 
 * @returns RankingResult with ranked results + signals (or null if disabled)
 */
export async function applyRankingIfEnabled(
  finalResults: any[],
  intentDecision: IntentResult,
  finalFilters: FinalSharedFilters,
  resultsBeforeFilters: number,
  relaxApplied: RelaxationApplied,
  ctx: Route2Context,
  mapping?: RouteLLMMapping
): Promise<RankingResult> {
  const { requestId } = ctx;
  const rankingConfig = getRankingLLMConfig();

  // Compute open/unknown stats from filtered results
  const openUnknownStats: OpenUnknownStats = computeOpenUnknownStats(finalResults);

  // Feature flag check - skip if disabled or mode is GOOGLE
  if (!rankingConfig.enabled || rankingConfig.defaultMode !== 'LLM_SCORE') {
    logger.info({
      requestId,
      event: 'ranking_skipped',
      reason: 'feature_disabled',
      enabled: rankingConfig.enabled,
      mode: rankingConfig.defaultMode
    }, '[RANKING] Skipping LLM ranking (feature disabled or mode not LLM_SCORE)');

    // Still build signals with default BALANCED profile
    const signals = buildRankingSignals({
      query: ctx.query ?? '',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: !!ctx.userLocation,
      resultsBeforeFilters,
      resultsAfterFilters: finalResults.length,
      relaxApplied,
      openUnknownStats
    });

    return { rankedResults: finalResults, signals };
  }

  // Empty results - nothing to rank
  if (finalResults.length === 0) {
    logger.info({
      requestId,
      event: 'ranking_skipped',
      reason: 'empty_results'
    }, '[RANKING] Skipping ranking (no results)');

    // Build signals even with no results
    const signals = buildRankingSignals({
      query: ctx.query ?? '',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: !!ctx.userLocation,
      resultsBeforeFilters,
      resultsAfterFilters: 0,
      relaxApplied,
      openUnknownStats
    });

    return { rankedResults: finalResults, signals };
  }

  try {
    // Log BEFORE ordering - first 10 placeIds in original Google order
    const beforeOrder = finalResults.slice(0, 10).map((r, idx) => ({
      idx,
      placeId: r.placeId || r.id,
      rating: r.rating,
      userRatingCount: r.userRatingsTotal
    }));

    logger.info({
      requestId,
      event: 'ranking_input_order',
      count: finalResults.length,
      first10: beforeOrder
    }, '[RANKING] Input order (Google)');

    // Build minimal context for LLM (no restaurant data)
    const rankingContext: RankingContext = {
      query: ctx.query ?? '',
      route: intentDecision.route,
      hasUserLocation: !!ctx.userLocation,
      appliedFilters: {
        openState: finalFilters.openState,
        priceIntent: finalFilters.priceIntent ?? null,
        minRatingBucket: finalFilters.minRatingBucket ?? null
      }
    };

    // Extract biasRadiusMeters from mapping (for deterministic profile selection)
    const biasRadiusMeters = mapping && 'bias' in mapping ? mapping.bias?.radiusMeters : undefined;

    // Step 1: LLM selects profile and weights (with deterministic fallback)
    const selection = await selectRankingProfile(
      rankingContext,
      ctx.llmProvider,
      requestId,
      biasRadiusMeters
    );

    // Step 2: Deterministically score and sort results
    const rankedResults = rankResults(finalResults, {
      weights: selection.weights,
      userLocation: ctx.userLocation ?? null
    });

    // Log AFTER ordering - first 10 placeIds after ranking
    const afterOrder = rankedResults.slice(0, 10).map((r, idx) => ({
      idx,
      placeId: r.placeId || r.id,
      rating: r.rating,
      userRatingCount: r.userRatingsTotal
    }));

    logger.info({
      requestId,
      event: 'ranking_output_order',
      count: rankedResults.length,
      first10: afterOrder
    }, '[RANKING] Output order (ranked)');

    // Log score breakdown for top 10 results
    const scoreBreakdowns = rankedResults.slice(0, 10).map(r =>
      computeScoreBreakdown(r, selection.weights, ctx.userLocation ?? null)
    );

    logger.info({
      requestId,
      event: 'ranking_score_breakdown',
      profile: selection.profile,
      top10: scoreBreakdowns
    }, '[RANKING] Score breakdown for top 10 results');

    // Log ranking event (single structured event)
    logger.info({
      requestId,
      event: 'post_rank_applied',
      profile: selection.profile,
      weights: selection.weights,
      resultCount: rankedResults.length,
      hadUserLocation: !!ctx.userLocation,
      mode: 'LLM_SCORE'
    }, '[RANKING] Results ranked deterministically');

    // Build ranking signals
    const signals = buildRankingSignals({
      query: ctx.query ?? '',
      profile: selection.profile,
      weights: selection.weights,
      hasUserLocation: !!ctx.userLocation,
      resultsBeforeFilters,
      resultsAfterFilters: rankedResults.length,
      relaxApplied,
      openUnknownStats
    });

    return { rankedResults, signals };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'ranking_failed',
      error: msg
    }, '[RANKING] Failed to apply ranking, returning original order');

    // Fail gracefully - return original order with fallback signals
    const signals = buildRankingSignals({
      query: ctx.query ?? '',
      profile: 'BALANCED',
      weights: { rating: 0.25, reviews: 0.25, distance: 0.25, openBoost: 0.25 },
      hasUserLocation: !!ctx.userLocation,
      resultsBeforeFilters,
      resultsAfterFilters: finalResults.length,
      relaxApplied,
      openUnknownStats
    });

    return { rankedResults: finalResults, signals };
  }
}

/**
 * Compute open/unknown statistics from results
 */
function computeOpenUnknownStats(results: any[]): OpenUnknownStats {
  let unknownCount = 0;
  let knownOpenCount = 0;
  let knownClosedCount = 0;

  for (const result of results) {
    if (result.openNow === true) {
      knownOpenCount++;
    } else if (result.openNow === false) {
      knownClosedCount++;
    } else {
      unknownCount++;
    }
  }

  return { unknownCount, knownOpenCount, knownClosedCount };
}
