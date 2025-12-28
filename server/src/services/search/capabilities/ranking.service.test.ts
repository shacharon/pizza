/**
 * RankingService - Unit Tests
 * Phase 3: Comprehensive test coverage for ranking logic
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RankingService } from './ranking.service.js';
import type { RestaurantResult, ParsedIntent } from '../types/search.types.js';

describe('RankingService', () => {
  let service: RankingService;
  
  beforeEach(() => {
    service = new RankingService();
  });

  describe('score normalization', () => {
    it('should clamp scores to 0-100 range', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Test Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 5.0,
          userRatingsTotal: 1000,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].score).toBeGreaterThanOrEqual(0);
      expect(ranked[0].score).toBeLessThanOrEqual(100);
    });

    it('should round scores to 1 decimal place', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Test Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.3,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Check that score has at most 1 decimal place
      const scoreStr = ranked[0].score.toString();
      const decimalIndex = scoreStr.indexOf('.');
      if (decimalIndex !== -1) {
        expect(scoreStr.length - decimalIndex - 1).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('match reasons', () => {
    it('should include exceptional_rating for rating >= 4.8', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Excellent Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.9,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('exceptional_rating');
    });

    it('should include highly_rated for rating >= 4.5', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Great Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.6,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('highly_rated');
    });

    it('should include good_rating for rating >= 4.0', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Good Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.2,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('good_rating');
    });

    it('should include very_popular for >= 500 reviews', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Popular Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          userRatingsTotal: 600,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('very_popular');
    });

    it('should include popular for >= 100 reviews', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Popular Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          userRatingsTotal: 150,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('popular');
    });

    it('should include price_match when price levels match', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Affordable Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          priceLevel: 2,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: { priceLevel: 2 },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('price_match');
    });

    it('should include open_now when restaurant is open', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Open Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          openNow: true,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: { openNow: true },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('open_now');
    });

    it('should include distance reasons based on proximity', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Close Restaurant',
          address: '123 Main St',
          location: { lat: 0.001, lng: 0.001 },
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const centerCoords = { lat: 0, lng: 0 };
      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent, centerCoords);
      
      // Should have very_close or nearby reason
      const hasDistanceReason = ranked[0].matchReasons.some(r => 
        r === 'very_close' || r === 'nearby'
      );
      expect(hasDistanceReason).toBe(true);
    });

    it('should include dietary match reasons', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Vegan Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          tags: ['vegan', 'healthy'],
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'vegan food',
        language: 'en',
        searchMode: 'textsearch',
        filters: { dietary: ['vegan'] },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('dietary_vegan');
    });

    it('should include cuisine_match for cuisine matches', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Italian Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          tags: ['italian', 'pasta'],
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'italian food',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
        cuisine: ['italian'],
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('cuisine_match');
    });

    it('should include general_match as fallback', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Generic Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].matchReasons).toContain('general_match');
    });
  });

  describe('weak match detection', () => {
    it('should mark results below threshold as weak', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Low Score Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 2.0,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].isWeakMatch).toBe(true);
    });

    it('should not mark results above threshold as weak', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'High Score Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.5,
          userRatingsTotal: 200,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].isWeakMatch).toBe(false);
    });
  });

  describe('ranking order', () => {
    it('should rank higher scores first', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Low Rating',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 3.0,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'High Rating',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.8,
          userRatingsTotal: 300,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      expect(ranked[0].id).toBe('2');
      expect(ranked[1].id).toBe('1');
    });

    it('should filter out results below minimum viable score', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Very Low Rating',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 1.0,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Decent Rating',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.0,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Very low rating should be filtered out
      expect(ranked.length).toBe(1);
      expect(ranked[0].id).toBe('2');
    });
  });

  describe('distance-based scoring', () => {
    it('should give max distance score at 0km', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Same Location',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.0,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const centerCoords = { lat: 0, lng: 0 };
      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent, centerCoords);
      
      expect(ranked[0].distanceMeters).toBe(0);
      expect(ranked[0].distanceScore).toBe(100);
    });

    it('should give 0 score beyond max distance', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Far Away',
          address: '123 Main St',
          location: { lat: 1, lng: 1 },  // ~157km away
          rating: 4.0,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const centerCoords = { lat: 0, lng: 0 };
      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent, centerCoords);
      
      expect(ranked[0].distanceScore).toBe(0);
    });

    it('should calculate distance score linearly', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Mid Distance',
          address: '123 Main St',
          location: { lat: 0.02, lng: 0.02 },  // ~2.5km away
          rating: 4.0,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const centerCoords = { lat: 0, lng: 0 };
      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent, centerCoords);
      
      // Should be roughly 50% of max score (2.5km out of 5km max)
      expect(ranked[0].distanceScore).toBeGreaterThan(30);
      expect(ranked[0].distanceScore).toBeLessThan(70);
    });
  });

  describe('config override', () => {
    it('should apply custom weights', () => {
      const customService = new RankingService({
        weights: {
          rating: 50,  // Much higher weight
          reviewCount: 1,
          priceMatch: 1,
          openNow: 1,
          distance: 1,
        },
      });

      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'High Rating',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 5.0,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = customService.rank(mockResults as RestaurantResult[], mockIntent);
      
      // With high rating weight, score should be high
      expect(ranked[0].score).toBeGreaterThan(50);
    });

    it('should apply custom thresholds', () => {
      const customService = new RankingService({
        thresholds: {
          highlyRated: 4.0,  // Lower threshold
          highlyRatedBonus: 10,
          popularReviews: 50,
          weakMatch: 50,  // Higher weak match threshold
          minViableScore: 20,
        },
      });

      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Good Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.1,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const ranked = customService.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Should be marked as highly rated with lower threshold
      expect(ranked[0].matchReasons).toContain('highly_rated');
    });
  });

  describe('combined scoring', () => {
    it('should combine rating, reviews, and distance', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Perfect Restaurant',
          address: '123 Main St',
          location: { lat: 0.001, lng: 0.001 },
          rating: 4.8,
          userRatingsTotal: 500,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: {},
      };

      const centerCoords = { lat: 0, lng: 0 };
      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent, centerCoords);
      
      // Should have high score from all factors
      expect(ranked[0].score).toBeGreaterThan(70);
      expect(ranked[0].matchReasons.length).toBeGreaterThan(2);
    });

    it('should penalize closed restaurants when openNow filter is set', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Closed Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.5,
          openNow: false,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Open Restaurant',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.0,
          openNow: true,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'test',
        language: 'en',
        searchMode: 'textsearch',
        filters: { openNow: true },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Open restaurant should rank higher despite lower rating
      expect(ranked[0].id).toBe('2');
    });
  });
});



