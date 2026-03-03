/**
 * Ranking observability – compact JSON logs for baseline/adaptive evaluation.
 * All logs guarded by RANKING_DEBUG=true. No PII.
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { BaselineScoreBreakdown } from './ranking-apply.js';
import { BASELINE_WEIGHTS } from './ranking-apply.js';

const RANKING_DEBUG = process.env.RANKING_DEBUG === 'true';

/** Compact weights object for logs (no intent keys). */
export interface RankingWeightsResolvedLog {
  requestId: string;
  baselineWeights: Record<string, number>;
  finalWeights: Record<string, number>;
  appliedSignals: string[];
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
 * Emit ranking_weights_resolved (baseline vs final weights + applied signals).
 * When adaptive ranking is added, finalWeights may differ and appliedSignals will list changed signals.
 */
export function logRankingWeightsResolved(
  requestId: string,
  baselineWeights: Record<string, number>,
  finalWeights: Record<string, number>,
  appliedSignals: string[] = []
): void {
  if (!RANKING_DEBUG) return;
  logger.info(
    {
      requestId,
      pipelineVersion: 'route2',
      event: 'ranking_weights_resolved',
      baselineWeights: { ...baselineWeights },
      finalWeights: { ...finalWeights },
      appliedSignals: [...appliedSignals],
    },
    '[ROUTE2] Ranking weights resolved'
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
    id,
    name,
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
 * One-shot: log all three observability events when RANKING_DEBUG is true.
 * Call after applyBaselineRanking with captured before state and outcome.
 */
export function logRankingObservability(params: {
  requestId: string;
  top5Before: RankingTopItemLog[];
  top5After: Array<{ id?: string; name?: string; score: number; breakdown: BaselineScoreBreakdown }>;
  baselineWeights?: Record<string, number>;
  finalWeights?: Record<string, number>;
  appliedSignals?: string[];
}): void {
  if (!RANKING_DEBUG) return;
  const {
    requestId,
    top5Before,
    top5After,
    baselineWeights = { ...BASELINE_WEIGHTS },
    finalWeights = { ...BASELINE_WEIGHTS },
    appliedSignals = [],
  } = params;
  logRankingWeightsResolved(requestId, baselineWeights, finalWeights, appliedSignals);
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
