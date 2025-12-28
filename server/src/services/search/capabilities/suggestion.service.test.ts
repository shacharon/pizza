/**
 * Comprehensive Suggestion Service Tests
 * Tests all chip types, modes, and filters
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { SuggestionService } from './suggestion.service.js';
import type { ParsedIntent, RestaurantResult } from '../types/search.types.js';

describe('SuggestionService - Complete Chip Coverage', () => {
  let service: SuggestionService;

  beforeEach(() => {
    service = new SuggestionService();
  });

  describe('NORMAL Mode Chips', () => {
    const intent: ParsedIntent = {
      query: 'pizza',
      language: 'en',
      searchMode: 'textsearch',
      location: { city: 'Tel Aviv', coords: { lat: 32.0853, lng: 34.7818 } },
      filters: { openNow: false, dietary: [] }
    };

    it('should generate delivery chip when results have delivery', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza Place', address: 'Addr1', 
          location: { lat: 32, lng: 34 }, tags: ['delivery'] }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const deliveryChip = chips.find(c => c.id === 'delivery');
      expect(deliveryChip).toBeDefined();
      expect(deliveryChip?.emoji).toBe('🚗');
      expect(deliveryChip?.action).toBe('filter');
      expect(deliveryChip?.filter).toBe('delivery');
    });

    it('should generate budget chip when cheap options exist', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Cheap Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, priceLevel: 1 }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const budgetChip = chips.find(c => c.id === 'budget');
      expect(budgetChip).toBeDefined();
      expect(budgetChip?.emoji).toBe('💰');
      expect(budgetChip?.filter).toBe('price<=2');
    });

    it('should NOT generate sort chips when results < 5 (context-aware)', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Great Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, rating: 4.8 }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      // No sort chips when results.length < 5
      const sortChips = chips.filter(c => c.action === 'sort');
      expect(sortChips.length).toBe(0);
    });

    it('should generate sort chips when results >= 5 and confidence high', () => {
      const highConfidenceIntent: ParsedIntent = {
        ...intent,
        confidenceLevel: 'high'
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza 1', address: 'Addr1', location: { lat: 32, lng: 34 }, rating: 4.8 },
        { id: '2', placeId: 'p2', name: 'Pizza 2', address: 'Addr2', location: { lat: 32, lng: 34 }, rating: 4.5 },
        { id: '3', placeId: 'p3', name: 'Pizza 3', address: 'Addr3', location: { lat: 32, lng: 34 }, rating: 4.3 },
        { id: '4', placeId: 'p4', name: 'Pizza 4', address: 'Addr4', location: { lat: 32, lng: 34 }, rating: 4.0 },
        { id: '5', placeId: 'p5', name: 'Pizza 5', address: 'Addr5', location: { lat: 32, lng: 34 }, rating: 3.8 }
      ];

      const chips = service.generate(highConfidenceIntent, results, 'NORMAL');
      
      // Should have sort chips
      const sortBestMatch = chips.find(c => c.id === 'sort_best_match');
      expect(sortBestMatch).toBeDefined();
      expect(sortBestMatch?.emoji).toBe('✨');
      expect(sortBestMatch?.action).toBe('sort');
      expect(sortBestMatch?.filter).toBe('best_match');

      const sortRating = chips.find(c => c.id === 'sort_rating');
      expect(sortRating).toBeDefined();
      expect(sortRating?.emoji).toBe('⭐');
      expect(sortRating?.action).toBe('sort');
      expect(sortRating?.filter).toBe('rating');
    });

    it('should generate sort_closest when location available', () => {
      const highConfidenceIntent: ParsedIntent = {
        ...intent,
        confidenceLevel: 'high'
      };

      const results: RestaurantResult[] = Array(5).fill(null).map((_, i) => ({
        id: `${i}`, placeId: `p${i}`, name: `Pizza ${i}`, address: `Addr${i}`,
        location: { lat: 32, lng: 34 }
      }));

      const chips = service.generate(highConfidenceIntent, results, 'NORMAL');
      
      const sortClosest = chips.find(c => c.id === 'sort_closest');
      expect(sortClosest).toBeDefined();
      expect(sortClosest?.emoji).toBe('📍');
      expect(sortClosest?.action).toBe('sort');
      expect(sortClosest?.filter).toBe('distance');
    });

    it('should generate sort_price when price data available', () => {
      const highConfidenceIntent: ParsedIntent = {
        ...intent,
        confidenceLevel: 'high'
      };

      const results: RestaurantResult[] = Array(5).fill(null).map((_, i) => ({
        id: `${i}`, placeId: `p${i}`, name: `Pizza ${i}`, address: `Addr${i}`,
        location: { lat: 32, lng: 34 }, priceLevel: 2
      }));

      const chips = service.generate(highConfidenceIntent, results, 'NORMAL');
      
      const sortPrice = chips.find(c => c.id === 'sort_price');
      expect(sortPrice).toBeDefined();
      expect(sortPrice?.emoji).toBe('💰');
      expect(sortPrice?.action).toBe('sort');
      expect(sortPrice?.filter).toBe('price');
    });

    it('should generate open now chip by default', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const openNowChip = chips.find(c => c.id === 'opennow');
      expect(openNowChip).toBeDefined();
      expect(openNowChip?.emoji).toBe('🟢');
      expect(openNowChip?.filter).toBe('opennow');
    });

    it('should generate map chip', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const mapChip = chips.find(c => c.id === 'map');
      expect(mapChip).toBeDefined();
      expect(mapChip?.emoji).toBe('🗺️');
      expect(mapChip?.action).toBe('map');
    });

    it('should generate closest chip when location exists', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const closestChip = chips.find(c => c.id === 'closest');
      expect(closestChip).toBeDefined();
      expect(closestChip?.emoji).toBe('📍');
      expect(closestChip?.action).toBe('sort');
      expect(closestChip?.filter).toBe('distance');
    });

    it('should limit to max 5 chips', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, rating: 4.8, priceLevel: 1,
          tags: ['delivery', 'takeout'] }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      expect(chips.length).toBeLessThanOrEqual(5);
    });

    it('should generate takeout chip when results have takeout', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza Place', address: 'Addr1', 
          location: { lat: 32, lng: 34 }, tags: ['takeout', 'meal_takeaway'] }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const takeoutChip = chips.find(c => c.id === 'takeout');
      expect(takeoutChip).toBeDefined();
      expect(takeoutChip?.emoji).toBe('🥡');
    });

    it('should NOT generate delivery chip when already filtered', () => {
      const intentWithDelivery: ParsedIntent = {
        ...intent,
        filters: { ...intent.filters, delivery: true }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, tags: ['delivery'] }
      ];

      const chips = service.generate(intentWithDelivery, results, 'NORMAL');
      
      const deliveryChip = chips.find(c => c.id === 'delivery');
      expect(deliveryChip).toBeUndefined();
    });
  });

  describe('RECOVERY Mode Chips', () => {
    const intent: ParsedIntent = {
      query: 'pizza',
      language: 'en',
      searchMode: 'textsearch',
      location: { city: 'Tel Aviv', coords: { lat: 32.0853, lng: 34.7818 } },
      filters: { openNow: true, dietary: ['vegan'] }
    };

    it('should generate expand radius chip', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      
      const expandChip = chips.find(c => c.id === 'expand_radius');
      expect(expandChip).toBeDefined();
      expect(expandChip?.emoji).toBe('🔍');
      expect(expandChip?.filter).toBe('radius:10000');
    });

    it('should generate remove filters chip when filters exist', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      
      const removeFiltersChip = chips.find(c => c.id === 'remove_filters');
      expect(removeFiltersChip).toBeDefined();
      expect(removeFiltersChip?.emoji).toBe('🔄');
      expect(removeFiltersChip?.filter).toBe('clear_filters');
    });

    it('should generate try nearby chip', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      
      const tryNearbyChip = chips.find(c => c.id === 'try_nearby');
      expect(tryNearbyChip).toBeDefined();
      expect(tryNearbyChip?.emoji).toBe('📍');
      expect(tryNearbyChip?.filter).toBe('nearby_fallback');
    });

    it('should generate sort by rating chip as SORT not FILTER', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      
      const sortRatingChip = chips.find(c => c.id === 'sort_rating');
      expect(sortRatingChip).toBeDefined();
      expect(sortRatingChip?.emoji).toBe('⭐');
      expect(sortRatingChip?.action).toBe('sort');
      expect(sortRatingChip?.filter).toBe('rating'); // Sort key, not filter condition
    });

    it('should generate closednow chip ONLY when user searched for open but got 0 results', () => {
      const intentOpenFilter: ParsedIntent = {
        ...intent,
        filters: { openNow: true, dietary: [] }
      };

      const chips = service.generate(intentOpenFilter, [], 'RECOVERY');
      
      const closedNowChip = chips.find(c => c.id === 'closednow');
      expect(closedNowChip).toBeDefined();
      expect(closedNowChip?.emoji).toBe('🔴');
      expect(closedNowChip?.action).toBe('filter');
      expect(closedNowChip?.filter).toBe('closed');
    });

    it('should NOT generate closednow chip when openNow filter not active', () => {
      const intentNoOpenFilter: ParsedIntent = {
        ...intent,
        filters: { openNow: false, dietary: [] }
      };

      const chips = service.generate(intentNoOpenFilter, [], 'RECOVERY');
      
      const closedNowChip = chips.find(c => c.id === 'closednow');
      expect(closedNowChip).toBeUndefined();
    });

    it('should NOT generate closednow chip when openNow=true but results exist', () => {
      const intentOpenFilter: ParsedIntent = {
        ...intent,
        filters: { openNow: true, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Open Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, openNow: true }
      ];

      const chips = service.generate(intentOpenFilter, results, 'RECOVERY');
      
      const closedNowChip = chips.find(c => c.id === 'closednow');
      expect(closedNowChip).toBeUndefined();
    });

    it('should generate map chip', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      
      const mapChip = chips.find(c => c.id === 'map');
      expect(mapChip).toBeDefined();
      expect(mapChip?.action).toBe('map');
    });

    it('should limit to max 5 recovery chips', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      expect(chips.length).toBeLessThanOrEqual(5);
    });

    it('should NOT generate remove filters chip when no filters applied', () => {
      const intentNoFilters: ParsedIntent = {
        ...intent,
        filters: { openNow: false, dietary: [] }
      };

      const chips = service.generate(intentNoFilters, [], 'RECOVERY');
      
      const removeFiltersChip = chips.find(c => c.id === 'remove_filters');
      expect(removeFiltersChip).toBeUndefined();
    });
  });

  describe('CLARIFY Mode Chips', () => {
    const intent: ParsedIntent = {
      query: 'pizza',
      language: 'en',
      searchMode: 'textsearch',
      location: {},
      filters: { openNow: false, dietary: [] }
    };

    it('should generate city suggestion chips when city missing', () => {
      const chips = service.generate(intent, [], 'CLARIFY');
      
      const telAvivChip = chips.find(c => c.id === 'city_tel_aviv');
      expect(telAvivChip).toBeDefined();
      expect(telAvivChip?.emoji).toBe('📍');
    });

    it('should generate multiple city suggestions', () => {
      const chips = service.generate(intent, [], 'CLARIFY');
      
      const cityChips = chips.filter(c => c.id.startsWith('city_'));
      expect(cityChips.length).toBeGreaterThan(0);
      expect(cityChips.length).toBeLessThanOrEqual(3);
    });

    it('should limit to max 3 clarification chips', () => {
      const chips = service.generate(intent, [], 'CLARIFY');
      expect(chips.length).toBeLessThanOrEqual(3);
    });

    it('should generate default exploration chips when no specific clarification needed', () => {
      const intentWithCity: ParsedIntent = {
        ...intent,
        location: { city: 'Tel Aviv' }
      };

      const chips = service.generate(intentWithCity, [], 'CLARIFY');
      
      const mapChip = chips.find(c => c.id === 'map');
      const closestChip = chips.find(c => c.id === 'closest');
      
      expect(mapChip || closestChip).toBeDefined();
    });

    it('should include query in city chip labels', () => {
      const chips = service.generate(intent, [], 'CLARIFY');
      
      const cityChip = chips.find(c => c.id.startsWith('city_'));
      expect(cityChip?.label).toContain('pizza');
    });
  });

  describe('i18n Support', () => {
    it('should generate Hebrew chips when language is he', () => {
      const intent: ParsedIntent = {
        query: 'פיצה',
        language: 'he',
        searchMode: 'textsearch',
        location: { city: 'תל אביב', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      // Verify chips are generated (labels will be in Hebrew)
      expect(chips.length).toBeGreaterThan(0);
      expect(chips.every(c => c.id && c.emoji && c.label)).toBe(true);
    });

    it('should support Arabic language', () => {
      const intent: ParsedIntent = {
        query: 'بيتزا',
        language: 'ar',
        searchMode: 'textsearch',
        location: { city: 'تل أبيب', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      expect(chips.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty results gracefully', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };

      const chips = service.generate(intent, [], 'NORMAL');
      
      // Should still generate some chips (map, etc.)
      expect(chips.length).toBeGreaterThan(0);
    });

    it('should handle missing location gracefully', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: {},
        filters: { openNow: false, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      expect(chips.length).toBeGreaterThan(0);
    });

    it('should handle results without optional fields', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 } }
        // No rating, priceLevel, tags, etc.
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      expect(chips.length).toBeGreaterThan(0);
      expect(chips.every(c => c.id && c.emoji && c.label && c.action)).toBe(true);
    });
  });

  describe('Chip Structure Validation', () => {
    it('should generate chips with all required fields', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, rating: 4.5 }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      chips.forEach(chip => {
        expect(chip.id).toBeDefined();
        expect(typeof chip.id).toBe('string');
        expect(chip.emoji).toBeDefined();
        expect(typeof chip.emoji).toBe('string');
        expect(chip.label).toBeDefined();
        expect(typeof chip.label).toBe('string');
        expect(chip.action).toBeDefined();
        expect(['filter', 'sort', 'map']).toContain(chip.action);
      });
    });

    it('should generate filter chips with filter field', () => {
      const intent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        location: { city: 'Tel Aviv', coords: { lat: 32, lng: 34 } },
        filters: { openNow: false, dietary: [] }
      };

      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, rating: 4.8 }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const filterChips = chips.filter(c => c.action === 'filter');
      filterChips.forEach(chip => {
        expect(chip.filter).toBeDefined();
        expect(typeof chip.filter).toBe('string');
      });
    });
  });
});

