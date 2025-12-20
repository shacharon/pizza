/**
 * RankingService: Scores and sorts restaurant results based on relevance
 * Configurable scoring algorithm for ML-based ranking in the future
 */

import type { IRankingService, RestaurantResult, ParsedIntent } from '../types/search.types.js';
import { SearchConfig, type RankingConfig } from '../config/search.config.js';

export interface RankingWeights {
  rating: number;
  reviewCount: number;
  distance?: number;
  priceMatch: number;
  openNow: number;
  vibeMatch?: number;
}

export class RankingService implements IRankingService {
  private weights: RankingWeights;
  private config: RankingConfig;

  constructor(config?: Partial<RankingConfig>) {
    this.config = {
      weights: { ...SearchConfig.ranking.weights, ...config?.weights },
      thresholds: { ...SearchConfig.ranking.thresholds, ...config?.thresholds },
    };
    
    this.weights = {
      ...this.config.weights,
      distance: undefined,
      vibeMatch: undefined,
    };
  }

  /**
   * Rank restaurants based on relevance to the intent
   */
  rank(results: RestaurantResult[], intent: ParsedIntent): RestaurantResult[] {
    // Calculate score for each result
    const scored = results.map(restaurant => ({
      ...restaurant,
      score: this.calculateScore(restaurant, intent),
      matchReasons: this.getMatchReasons(restaurant, intent),
    }));

    // Sort by score (descending)
    scored.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return scored;
  }

  /**
   * Calculate relevance score for a restaurant
   */
  private calculateScore(restaurant: RestaurantResult, intent: ParsedIntent): number {
    let score = 0;

    // Base: rating × weight
    if (restaurant.rating) {
      score += restaurant.rating * this.weights.rating;
    }

    // Review count (logarithmic scale to avoid overwhelming)
    if (restaurant.userRatingsTotal) {
      score += Math.log10(restaurant.userRatingsTotal + 1) * this.weights.reviewCount;
    }

    // Price match
    if (intent.filters.priceLevel && restaurant.priceLevel) {
      const diff = Math.abs(intent.filters.priceLevel - restaurant.priceLevel);
      score -= diff * this.weights.priceMatch;
    }

    // Open now (hard requirement)
    if (intent.filters.openNow) {
      if (restaurant.openNow === true) {
        score += this.weights.openNow;
      } else if (restaurant.openNow === false) {
        score -= this.weights.openNow;  // Penalize closed restaurants
      }
    }

    // Dietary restrictions (boost if mentioned in tags)
    if (intent.filters.dietary && restaurant.tags) {
      const dietaryMatches = intent.filters.dietary.filter(diet =>
        restaurant.tags?.some(tag => tag.toLowerCase().includes(diet.toLowerCase()))
      );
      score += dietaryMatches.length * 5;
    }

    // Cuisine match
    if (intent.cuisine && restaurant.tags) {
      const cuisineMatches = intent.cuisine.filter(cuisine =>
        restaurant.tags?.some(tag => tag.toLowerCase().includes(cuisine.toLowerCase()))
      );
      score += cuisineMatches.length * 3;
    }

    // Highly rated boost
    if (restaurant.rating && restaurant.rating >= this.config.thresholds.highlyRated) {
      score += this.config.thresholds.highlyRatedBonus;
    }

    return Math.max(0, score);
  }

  /**
   * Get reasons why this restaurant matches the query
   */
  private getMatchReasons(restaurant: RestaurantResult, intent: ParsedIntent): string[] {
    const reasons: string[] = [];

    if (restaurant.rating && restaurant.rating >= this.config.thresholds.highlyRated) {
      reasons.push('highly_rated');
    }

    if (intent.filters.priceLevel && restaurant.priceLevel === intent.filters.priceLevel) {
      reasons.push('price_match');
    }

    if (intent.filters.openNow && restaurant.openNow) {
      reasons.push('open_now');
    }

    if (intent.filters.dietary && restaurant.tags) {
      intent.filters.dietary.forEach(diet => {
        if (restaurant.tags?.some(tag => tag.toLowerCase().includes(diet.toLowerCase()))) {
          reasons.push(`dietary_${diet}`);
        }
      });
    }

    if (intent.cuisine && restaurant.tags) {
      intent.cuisine.forEach(cuisine => {
        if (restaurant.tags?.some(tag => tag.toLowerCase().includes(cuisine.toLowerCase()))) {
          reasons.push(`cuisine_${cuisine}`);
        }
      });
    }

    if (restaurant.userRatingsTotal && restaurant.userRatingsTotal > this.config.thresholds.popularReviews) {
      reasons.push('popular');
    }

    return reasons;
  }

  /**
   * Update ranking weights (for A/B testing or ML-based tuning)
   */
  updateWeights(weights: Partial<RankingWeights>): void {
    this.weights = { ...this.weights, ...weights };
  }

  /**
   * Get current weights
   */
  getWeights(): RankingWeights {
    return { ...this.weights };
  }
}

