/**
 * RankingService: Scores and sorts restaurant results based on relevance
 * Configurable scoring algorithm for ML-based ranking in the future
 */

import type { IRankingService, RestaurantResult, ParsedIntent } from '../types/search.types.js';
import { SearchConfig, type RankingConfig } from '../config/search.config.js';
import { getRankingPoolConfig } from '../config/ranking.config.js';

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
  private poolConfig = getRankingPoolConfig();

  constructor(config?: Partial<RankingConfig>) {
    this.config = {
      weights: { ...SearchConfig.ranking.weights, ...config?.weights },
      thresholds: { ...SearchConfig.ranking.thresholds, ...config?.thresholds },
      scoring: { ...SearchConfig.ranking.scoring, ...config?.scoring },
    };
    
    this.weights = {
      ...this.config.weights,
    };
  }

  /**
   * Phase 3: Rank restaurants based on relevance to the intent
   * Phase 1: Enhanced to rank all candidates and return top N
   */
  rank(
    results: RestaurantResult[],
    intent: ParsedIntent,
    centerCoords?: { lat: number; lng: number }
  ): RestaurantResult[] {
    // Calculate raw scores with distance for ALL candidates
    const scored = results.map(restaurant => {
      const rawScore = this.calculateScore(restaurant, intent, centerCoords);
      const normalizedScore = this.normalizeScore(rawScore);
      
      return {
        ...restaurant,
        score: normalizedScore,
        matchReasons: this.getMatchReasons(restaurant, intent),
        isWeakMatch: normalizedScore < this.config.thresholds.weakMatch,
      };
    });

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    // Phase 1: Add rank numbers (1-based) to ALL results
    const ranked = scored.map((result, index) => ({
      ...result,
      rank: index + 1,
    }));

    // Filter out results below minimum viable score
    const viable = ranked.filter(r => r.score >= this.config.thresholds.minViableScore);

    // Phase 1: Return only top N for display
    return viable.slice(0, this.poolConfig.displayResultsSize);
  }

  /**
   * Phase 3: Calculate relevance score for a restaurant
   * Now includes distance-based scoring
   */
  private calculateScore(
    restaurant: RestaurantResult,
    intent: ParsedIntent,
    centerCoords?: { lat: number; lng: number }
  ): number {
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

    // Open/Closed status (hard requirement)
    if (intent.filters.openNow === true) {
      // User wants open restaurants
      if (restaurant.openNow === true) {
        score += this.weights.openNow;
      } else if (restaurant.openNow === false) {
        score -= this.weights.openNow;  // Penalize closed restaurants
      }
    } else if (intent.filters.openNow === false) {
      // User wants closed restaurants (e.g., "פיצה סגור")
      if (restaurant.openNow === false) {
        score += this.weights.openNow;  // Boost closed restaurants
      } else if (restaurant.openNow === true) {
        score -= this.weights.openNow;  // Penalize open restaurants
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

    // Phase 3: Add distance-based scoring
    if (centerCoords) {
      const distScore = this.calculateDistanceScore(restaurant, centerCoords);
      score += distScore * (this.weights.distance || 0);
    }

    // Highly rated boost
    if (restaurant.rating && restaurant.rating >= this.config.thresholds.highlyRated) {
      score += this.config.thresholds.highlyRatedBonus;
    }

    // Return raw score (will be normalized later)
    return Math.max(0, score);
  }

  /**
   * Phase 3: Get detailed reasons why this restaurant matches the query
   * Expanded to 10+ reason types with distance and rating detail
   */
  private getMatchReasons(restaurant: RestaurantResult, intent: ParsedIntent): string[] {
    const reasons: string[] = [];

    // Rating-based reasons (tiered)
    if (restaurant.rating) {
      if (restaurant.rating >= 4.8) {
        reasons.push('exceptional_rating');
      } else if (restaurant.rating >= this.config.thresholds.highlyRated) {
        reasons.push('highly_rated');
      } else if (restaurant.rating >= 4.0) {
        reasons.push('good_rating');
      }
    }

    // Review count reasons (popularity tiers)
    if (restaurant.userRatingsTotal) {
      if (restaurant.userRatingsTotal >= 500) {
        reasons.push('very_popular');
      } else if (restaurant.userRatingsTotal >= this.config.thresholds.popularReviews) {
        reasons.push('popular');
      }
    }

    // Price match
    if (intent.filters.priceLevel && restaurant.priceLevel === intent.filters.priceLevel) {
      reasons.push('price_match');
    }

    // Open now
    if (intent.filters.openNow && restaurant.openNow === true) {
      reasons.push('open_now');
    }

    // Distance reasons (proximity tiers)
    if (restaurant.distanceMeters !== undefined) {
      if (restaurant.distanceMeters < 500) {
        reasons.push('very_close');
      } else if (restaurant.distanceMeters < 1000) {
        reasons.push('nearby');
      }
    }

    // Dietary matches
    if (intent.filters.dietary && restaurant.tags) {
      intent.filters.dietary.forEach(diet => {
        if (restaurant.tags?.some(tag => tag.toLowerCase().includes(diet.toLowerCase()))) {
          reasons.push(`dietary_${diet}`);
        }
      });
    }

    // Cuisine matches
    if (intent.cuisine && restaurant.tags) {
      const cuisineMatches = intent.cuisine.filter(cuisine =>
        restaurant.tags?.some(tag => tag.toLowerCase().includes(cuisine.toLowerCase()))
      );
      if (cuisineMatches.length > 0) {
        reasons.push('cuisine_match');
      }
    }

    // Fallback if no reasons
    if (reasons.length === 0) {
      reasons.push('general_match');
    }

    return reasons;
  }

  /**
   * Phase 3: Normalize score to 0-100 range
   * Clamps and rounds to 1 decimal place
   */
  private normalizeScore(rawScore: number): number {
    // Normalize to 0-100 range
    const maxRaw = this.config.scoring.maxRawScore;
    const normalized = Math.min(100, (rawScore / maxRaw) * 100);
    return Math.round(normalized * 10) / 10;  // Round to 1 decimal
  }

  /**
   * Phase 3: Calculate distance score using Haversine formula
   * Returns 0-100 score based on proximity to center
   */
  private calculateDistanceScore(
    result: RestaurantResult,
    centerCoords?: { lat: number; lng: number }
  ): number {
    if (!centerCoords || !result.location) return 0;
    
    const distance = this.haversineDistance(
      centerCoords.lat, centerCoords.lng,
      result.location.lat, result.location.lng
    );
    
    // Linear decay: 100 at 0km, 0 at distanceMaxKm
    const maxDist = this.config.scoring.distanceMaxKm * 1000; // Convert to meters
    const score = Math.max(0, 100 - (distance / maxDist) * 100);
    
    // Mutate result to add distance metadata
    (result as any).distanceScore = score;
    (result as any).distanceMeters = distance;
    
    return score;
  }

  /**
   * Phase 3: Haversine distance formula
   * Calculates distance between two coordinates in meters
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
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

