/**
 * Ranking observability – compact JSON logs for baseline/adaptive evaluation.
 * All logs guarded by RANKING_DEBUG=true. No PII. Emit once per request.
 *
 * Example expected log shapes (one per event when RANKING_DEBUG=true):
 *
 * ranking_weights_resolved:
 * {
 *   "requestId": "req-1",
 *   "pipelineVersion": "route2",
 *   "event": "ranking_weights_resolved",
 *   "baselineWeights": { "rating": 0.45, "reviewCountSocialProof": 0.25, "distanceMeters": 0.15, "openNow": 0.1, "priceFit": 0.05 },
 *   "finalWeights": { "rating": 0.43, "reviewCountSocialProof": 0.24, "distanceMeters": 0.14, "openNow": 0.16, "priceFit": 0.05 },
 *   "appliedSignals": ["openState"],
 *   "weightAdjustments": { "rating": -0.02, "reviewCountSocialProof": -0.01, "distanceMeters": -0.01, "openNow": 0.06, "priceFit": 0 },
 *   "normalizationApplied": true
 * }
 *
 * ranking_signal_context:
 * { "requestId": "req-1", "event": "ranking_signal_context", "route": "NEARBY", "openState": "OPEN_NOW", "priceIntent": "CHEAP", "priceLevels": [1,2], "priceLevel": null, "hasDistanceSignal": true }
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { BaselineScoreBreakdown } from './ranking-apply.js';
import { BASELINE_WEIGHTS } from './ranking-apply.js';

const RANKING_DEBUG = process.env.RANKING_DEBUG === 'true';

const WEIGHT_KEYS = ['rating', 'reviewCountSocialProof', 'distanceMeters', 'openNow', 'priceFit'] as const;

/** Compact weights object for logs (no intent keys). */
export interface RankingWeightsResolvedLog {
  requestId: string;
  baselineWeights: Record<string, number>;
  finalWeights: Record<string, number>;
  appliedSignals: string[];
  weightAdjustments?: Record<string, number>;
  normalizationApplied?: boolean;
}

/** Minimal context for why weights changed (no PII). */
export interface RankingSignalContextLog {
  route: string;
  openState: string | null;
  priceIntent: string | null;
  priceLevels: number[] | null;
  priceLevel: number | null;
  hasDistanceSignal: boolean;
}

/** Top-N item for before/after (id + name only, no PII beyond place identity). */
export interface RankingTopItemLog {
  rank: number;
  id?: string | undefined;
  name?: string | undefined;
  score?: number | undefined;
}

/** Score breakdown for one item (component = weighted contribution). */
export interface RankingScoreBreakdownItemLog {
  id?: string;
  name?: string;
  totalScore: number;
  rating: number;
  reviewCount: number;
  distance: number;
  openNow: number;
  priceFit: number;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Compute weight deltas (final - baseline) for logging. Keys from WEIGHT_KEYS only.
 */
function computeWeightAdjustments(
  baselineWeights: Record<string, number>,
  finalWeights: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const k of WEIGHT_KEYS) {
    const b = baselineWeights[k];
    const f = finalWeights[k];
    if (typeof b === 'number' && typeof f === 'number') {
      const delta = f - b;
      out[k] = Math.round(delta * 1000) / 1000;
    }
  }
  return out;
}

/**
 * Emit ranking_weights_resolved: baseline, final, appliedSignals, weightAdjustments, normalizationApplied.
 */
export function logRankingWeightsResolved(
  requestId: string,
  baselineWeights: Record<string, number>,
  finalWeights: Record<string, number>,
  appliedSignals: string[] = []
): void {
  if (!RANKING_DEBUG) return;
  const normalizationApplied = appliedSignals.length > 0;
  const weightAdjustments = computeWeightAdjustments(baselineWeights, finalWeights);
  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'ranking_weights_resolved',
      baselineWeights: { ...baselineWeights },
      finalWeights: { ...finalWeights },
      appliedSignals: [...appliedSignals],
      weightAdjustments,
      normalizationApplied,
    },
    '[ROUTE2] Ranking weights resolved'
  );
}

/**
 * Emit ranking_signal_context: route, openState, price flags, hasDistanceSignal (why weights could change).
 */
export function logRankingSignalContext(
  requestId: string,
  context: RankingSignalContextLog
): void {
  if (!RANKING_DEBUG) return;
  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'ranking_signal_context',
      route: context.route,
      openState: context.openState,
      priceIntent: context.priceIntent,
      priceLevels: context.priceLevels,
      priceLevel: context.priceLevel,
      hasDistanceSignal: context.hasDistanceSignal,
    },
    '[ROUTE2] Ranking signal context'
  );
}

/**
 * Emit ranking_top_before_after: top 5 in post-filter order vs top 5 after ranking.
 */
export function logRankingTopBeforeAfter(
  requestId: string,
  top5Before: RankingTopItemLog[],
  top5After: RankingTopItemLog[]
): void {
  if (!RANKING_DEBUG) return;
  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'ranking_top_before_after',
      top5Before: top5Before.map(({ rank, id, name }) => ({ rank, id, name })),
      top5After: top5After.map(({ rank, id, name, score }) =>
        score !== undefined ? { rank, id, name, score: round3(score) } : { rank, id, name }
      ),
    },
    '[ROUTE2] Ranking top 5 before/after'
  );
}

/**
 * Emit ranking_score_breakdown_top3: totalScore + component scores for top 3.
 */
export function logRankingScoreBreakdownTop3(
  requestId: string,
  top3: Array<{ id?: string; name?: string; score: number; breakdown: BaselineScoreBreakdown }>
): void {
  if (!RANKING_DEBUG) return;
  const items: RankingScoreBreakdownItemLog[] = top3.map(({ id, name, score, breakdown }) => ({
    ...(id !== undefined && { id }),
    ...(name !== undefined && { name }),
    totalScore: round3(score),
    rating: round3(breakdown.rating),
    reviewCount: round3(breakdown.reviewSocial),
    distance: round3(breakdown.distance),
    openNow: round3(breakdown.open),
    priceFit: round3(breakdown.priceFit),
  }));
  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'ranking_score_breakdown_top3',
      top3: items,
    },
    '[ROUTE2] Ranking score breakdown top 3'
  );
}

/**
 * One-shot: log all observability events when RANKING_DEBUG is true (once per request).
 * Call after applyBaselineRanking with captured before state and outcome.
 * When signalContext is provided, also emits ranking_signal_context.
 */
export function logRankingObservability(params: {
  requestId: string;
  top5Before: RankingTopItemLog[];
  top5After: Array<{ id?: string; name?: string; score: number; breakdown: BaselineScoreBreakdown }>;
  baselineWeights?: Record<string, number>;
  finalWeights?: Record<string, number>;
  appliedSignals?: string[];
  signalContext?: RankingSignalContextLog;
}): void {
  if (!RANKING_DEBUG) return;
  const {
    requestId,
    top5Before,
    top5After,
    baselineWeights = { ...BASELINE_WEIGHTS },
    finalWeights = { ...BASELINE_WEIGHTS },
    appliedSignals = [],
    signalContext,
  } = params;
  logRankingWeightsResolved(requestId, baselineWeights, finalWeights, appliedSignals);
  if (signalContext) {
    logRankingSignalContext(requestId, signalContext);
  }
  logRankingTopBeforeAfter(
    requestId,
    top5Before,
    top5After.map(({ id, name, score }, i) => ({ rank: i + 1, id, name, score }))
  );
  logRankingScoreBreakdownTop3(requestId, top5After.slice(0, 3));
}

export function isRankingDebugEnabled(): boolean {
  return RANKING_DEBUG;
}
