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
import { resolveDistanceOrigin } from './ranking/distance-origin.js';

/**
 * Ranking Result
 * Returns ranked results + ranking signals for metadata
 */
export interface RankingResult {
  rankedResults: any[];
  signals: RankingSignals | null;
  /** Whether ranking was actually applied (true) or results are in original Google order (false) */
  rankingApplied: boolean;
  /** Order explanation data (for frontend transparency) */
  orderExplain?: {
    profile: string;
    weights: {
      rating: number;
      reviews: number;
      distance: number;
      openBoost: number;
    };
    distanceOrigin: 'CITY_CENTER' | 'USER_LOCATION' | 'NONE';
    distanceRef: { lat: number; lng: number } | null;
    reordered: boolean;
  };
}

/**
 * Apply LLM-driven ranking to results (if enabled) and build ranking signals
 * 
 * This is the ONLY place where ranking is applied.
 * Called after post-filters in orchestrator.
 * 
 * @param cityCenter - Optional city center coordinates (for explicit city queries)
 * @returns RankingResult with ranked results + signals (or null if disabled)
 */
export async function applyRankingIfEnabled(
  finalResults: any[],
  intentDecision: IntentResult,
  finalFilters: FinalSharedFilters,
  resultsBeforeFilters: number,
  relaxApplied: RelaxationApplied,
  ctx: Route2Context,
  mapping?: RouteLLMMapping,
  cityCenter?: { lat: number; lng: number } | null
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
      mode: rankingConfig.defaultMode,
      orderSource: 'google',
      reordered: false
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

    // Build order explanation (ranking disabled - Google order)
    const orderExplain = {
      profile: 'GOOGLE_ORDER',
      weights: { rating: 0, reviews: 0, distance: 0, openBoost: 0 },
      distanceOrigin: 'NONE' as const,
      distanceRef: null,
      reordered: false
    };

    return { rankedResults: finalResults, signals, rankingApplied: false, orderExplain };
  }

  // Empty results - nothing to rank
  if (finalResults.length === 0) {
    logger.info({
      requestId,
      event: 'ranking_skipped',
      reason: 'empty_results',
      orderSource: 'google',
      reordered: false
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

    // Build order explanation (no results - Google order)
    const orderExplain = {
      profile: 'GOOGLE_ORDER',
      weights: { rating: 0, reviews: 0, distance: 0, openBoost: 0 },
      distanceOrigin: 'NONE' as const,
      distanceRef: null,
      reordered: false
    };

    return { rankedResults: finalResults, signals, rankingApplied: false, orderExplain };
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
      first10: beforeOrder,
      orderSource: 'google',
      reordered: false
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

    // Step 2: DETERMINISTIC distance origin resolution
    const distanceDecision = resolveDistanceOrigin(intentDecision, ctx.userLocation, mapping);

    // Log distance origin decision ONCE with full context
    logger.info({
      requestId,
      event: 'ranking_distance_origin_selected',
      origin: distanceDecision.origin,
      ...(distanceDecision.cityText && { cityText: distanceDecision.cityText }),
      hadUserLocation: distanceDecision.hadUserLocation,
      ...(distanceDecision.refLatLng && {
        refLatLng: {
          lat: distanceDecision.refLatLng.lat,
          lng: distanceDecision.refLatLng.lng
        }
      }),
      ...(distanceDecision.userToCityDistanceKm !== undefined && {
        userToCityDistanceKm: Math.round(distanceDecision.userToCityDistanceKm * 100) / 100
      }),
      intentReason: intentDecision.reason
    }, `[RANKING] Distance origin: ${distanceDecision.origin}`);

    // Step 3: Adjust ranking weights if distance origin is NONE
    let effectiveWeights = selection.weights;
    if (distanceDecision.origin === 'NONE') {
      // Force distance weight to 0 when no anchor available
      effectiveWeights = {
        ...selection.weights,
        distance: 0
      };
      logger.debug({
        requestId,
        event: 'ranking_distance_disabled',
        reason: 'no_distance_origin'
      }, '[RANKING] Distance scoring disabled (no anchor)');
    }

    // Step 4: Deterministically score and sort results
    const rankedResults = rankResults(finalResults, {
      weights: effectiveWeights,
      userLocation: distanceDecision.refLatLng
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
      first10: afterOrder,
      orderSource: 'ranking',
      reordered: true
    }, '[RANKING] Output order (ranked)');

    // Log score breakdown for top 10 results
    // Use the resolved distance origin coordinates (not ctx.userLocation)
    const scoreBreakdowns = rankedResults.slice(0, 10).map(r =>
      computeScoreBreakdown(r, effectiveWeights, distanceDecision.refLatLng)
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
      mode: 'LLM_SCORE',
      orderSource: 'ranking',
      reordered: true
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

    // Build order explanation for frontend transparency
    const orderExplain = {
      profile: selection.profile,
      weights: effectiveWeights,
      distanceOrigin: distanceDecision.origin,
      distanceRef: distanceDecision.refLatLng,
      reordered: true
    };

    return { rankedResults, signals, rankingApplied: true, orderExplain };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    logger.error({
      requestId,
      event: 'ranking_failed',
      error: msg,
      orderSource: 'google',
      reordered: false
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

    // Build order explanation (ranking failed - Google order)
    const orderExplain = {
      profile: 'GOOGLE_ORDER',
      weights: { rating: 0, reviews: 0, distance: 0, openBoost: 0 },
      distanceOrigin: 'NONE' as const,
      distanceRef: null,
      reordered: false
    };

    return { rankedResults: finalResults, signals, rankingApplied: false, orderExplain };
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
