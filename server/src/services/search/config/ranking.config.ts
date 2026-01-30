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

