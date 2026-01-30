/**
 * Ranking Pool Configuration
 * Phase 1: Candidate pool size and display settings
 * 
 * Controls how many candidates we fetch from Google Places (pool size)
 * and how many we return to the UI (display size).
 */

export interface RankingPoolConfig {
  candidatePoolSize: number;      // Fetch this many from Google
  displayResultsSize: number;     // Return this many to UI

  // Confidence computation
  combineIntentConfidence: boolean;  // Use intent + results confidence
  minCandidatesForHighConf: number;  // Need 10+ for "high" confidence
}

export function getRankingPoolConfig(): RankingPoolConfig {
  return {
    candidatePoolSize: Number(process.env.CANDIDATE_POOL_SIZE || 30),
    displayResultsSize: Number(process.env.DISPLAY_RESULTS_SIZE || 10),

    combineIntentConfidence: true,
    minCandidatesForHighConf: 10,
  };
}

/**
 * LLM-Driven Ranking Configuration
 * Phase 2: LLM-driven ranking profile selection with deterministic scoring
 * 
 * Feature flags:
 * - RANKING_LLM_ENABLED: Enable LLM-driven ranking (default: false)
 * - RANKING_DEFAULT_MODE: Default ranking mode when enabled (GOOGLE|LLM_SCORE, default: GOOGLE)
 */
export type RankingMode = 'GOOGLE' | 'LLM_SCORE';

export interface RankingLLMConfig {
  enabled: boolean;
  defaultMode: RankingMode;
}

export function getRankingLLMConfig(): RankingLLMConfig {
  const enabled = process.env.RANKING_LLM_ENABLED === 'true';
  const defaultMode = (process.env.RANKING_DEFAULT_MODE || 'GOOGLE') as RankingMode;

  return {
    enabled,
    defaultMode
  };
}

