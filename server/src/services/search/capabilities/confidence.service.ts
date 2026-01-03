/**
 * Confidence Service
 * Phase 1: Combined confidence calculation
 * 
 * Combines intent confidence (from LLM) with results quality
 * to produce a final confidence level for the search.
 */

import { ParsedIntent, RestaurantResult } from '../types/search.types.js';
import { getRankingPoolConfig } from '../config/ranking.config.js';

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface ConfidenceFactors {
  intentConfidence: number;    // 0-1 from intent parsing
  resultsQuality: number;      // 0-1 based on results
  combined: number;            // 0-1 final
  level: ConfidenceLevel;      // high/medium/low
}

export class ConfidenceService {
  private config = getRankingPoolConfig();
  
  /**
   * Combine intent confidence with results quality
   */
  calculateConfidence(
    intentConfidence: number,
    rankedResults: RestaurantResult[]
  ): ConfidenceFactors {
    const resultsQuality = this.assessResultsQuality(rankedResults);
    
    // Weighted average: intent 60%, results 40%
    const combined = (intentConfidence * 0.6) + (resultsQuality * 0.4);
    
    return {
      intentConfidence,
      resultsQuality,
      combined,
      level: this.getConfidenceLevel(combined, rankedResults.length),
    };
  }
  
  /**
   * Assess quality of ranked results
   */
  private assessResultsQuality(results: RestaurantResult[]): number {
    if (results.length === 0) return 0;
    
    const top10 = results.slice(0, 10);
    
    // Factors:
    // 1. Average score of top 10
    const avgScore = top10.reduce((sum, r) => sum + (r.score || 0), 0) / top10.length;
    
    // 2. Score gap between #1 and #10 (lower = more consistent)
    const scoreGap = top10.length >= 10 
      ? (top10[0]?.score || 0) - (top10[9]?.score || 0)
      : 0;
    const gapPenalty = Math.min(scoreGap / 50, 0.2); // Max 20% penalty
    
    // 3. Number of high-scoring results
    const highScoreCount = top10.filter(r => (r.score || 0) >= 70).length;
    const highScoreBonus = (highScoreCount / 10) * 0.1; // Max 10% bonus
    
    // Combine factors
    let quality = (avgScore / 100) - gapPenalty + highScoreBonus;
    
    return Math.max(0, Math.min(1, quality));
  }
  
  /**
   * Map combined confidence to level
   */
  private getConfidenceLevel(combined: number, resultCount: number): ConfidenceLevel {
    if (combined >= 0.8 && resultCount >= this.config.minCandidatesForHighConf) {
      return 'high';
    } else if (combined >= 0.6) {
      return 'medium';
    } else {
      return 'low';
    }
  }
}

