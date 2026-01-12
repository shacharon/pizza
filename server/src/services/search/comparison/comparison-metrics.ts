/**
 * Comparison Metrics Tracker (Phase 3)
 * 
 * Tracks and aggregates intent comparison results across requests.
 * Provides statistics for monitoring LLM prompt performance.
 */

import type { IntentComparison, DifferenceType } from './intent-comparator.js';

/**
 * Aggregated statistics from all comparisons
 */
export interface ComparisonStats {
  /**
   * Total number of comparisons performed
   */
  totalComparisons: number;
  
  /**
   * Percentage of comparisons that matched (0-1)
   */
  matchRate: number;
  
  /**
   * Average confidence delta (direct - mapped)
   */
  avgConfidenceDelta: number;
  
  /**
   * Count of each difference type
   */
  commonDifferences: Record<string, number>;
  
  /**
   * Field-level match rates
   */
  fieldMatchRates: {
    foodAnchor: number;
    locationAnchor: number;
    nearMe: number;
    preferences: number;
  };
}

/**
 * Singleton class to track comparison metrics
 */
export class ComparisonMetrics {
  private static instance: ComparisonMetrics;
  
  private results: IntentComparison[] = [];
  private differenceCount: Map<DifferenceType, number> = new Map();
  
  /**
   * Get singleton instance
   */
  static getInstance(): ComparisonMetrics {
    if (!ComparisonMetrics.instance) {
      ComparisonMetrics.instance = new ComparisonMetrics();
    }
    return ComparisonMetrics.instance;
  }
  
  /**
   * Record a comparison result
   */
  record(comparison: IntentComparison): void {
    this.results.push(comparison);
    
    // Track difference types
    for (const diff of comparison.differences) {
      const current = this.differenceCount.get(diff.field) || 0;
      this.differenceCount.set(diff.field, current + 1);
    }
    
    // Keep only last 1000 comparisons to prevent memory issues
    if (this.results.length > 1000) {
      this.results = this.results.slice(-1000);
    }
  }
  
  /**
   * Get aggregated statistics
   */
  getStats(): ComparisonStats {
    if (this.results.length === 0) {
      return {
        totalComparisons: 0,
        matchRate: 0,
        avgConfidenceDelta: 0,
        commonDifferences: {},
        fieldMatchRates: {
          foodAnchor: 0,
          locationAnchor: 0,
          nearMe: 0,
          preferences: 0
        }
      };
    }
    
    const totalComparisons = this.results.length;
    
    // Calculate match rate
    const matchCount = this.results.filter(r => r.matched).length;
    const matchRate = matchCount / totalComparisons;
    
    // Calculate average confidence delta
    const totalDelta = this.results.reduce((sum, r) => sum + r.confidence.delta, 0);
    const avgConfidenceDelta = totalDelta / totalComparisons;
    
    // Build common differences map
    const commonDifferences: Record<string, number> = {};
    for (const [field, count] of this.differenceCount.entries()) {
      commonDifferences[field] = count;
    }
    
    // Calculate field-level match rates
    const foodAnchorMatches = this.results.filter(r => r.metrics.foodAnchorMatch).length;
    const locationAnchorMatches = this.results.filter(r => r.metrics.locationAnchorMatch).length;
    const nearMeMatches = this.results.filter(r => r.metrics.nearMeMatch).length;
    const preferencesMatches = this.results.filter(r => r.metrics.preferencesMatch).length;
    
    return {
      totalComparisons,
      matchRate,
      avgConfidenceDelta,
      commonDifferences,
      fieldMatchRates: {
        foodAnchor: foodAnchorMatches / totalComparisons,
        locationAnchor: locationAnchorMatches / totalComparisons,
        nearMe: nearMeMatches / totalComparisons,
        preferences: preferencesMatches / totalComparisons
      }
    };
  }
  
  /**
   * Get recent failures (last N comparisons that didn't match)
   */
  getRecentFailures(limit: number = 10): IntentComparison[] {
    return this.results
      .filter(r => !r.matched)
      .slice(-limit)
      .reverse();
  }
  
  /**
   * Reset all metrics
   */
  reset(): void {
    this.results = [];
    this.differenceCount.clear();
  }
  
  /**
   * Get total comparison count
   */
  getTotalCount(): number {
    return this.results.length;
  }
  
  /**
   * Get match rate (0-1)
   */
  getMatchRate(): number {
    if (this.results.length === 0) return 0;
    const matchCount = this.results.filter(r => r.matched).length;
    return matchCount / this.results.length;
  }
}

/**
 * Export singleton instance for easy access
 */
export const comparisonMetrics = ComparisonMetrics.getInstance();
