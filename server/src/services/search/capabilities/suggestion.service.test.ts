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

    it('should generate top rated chip when highly-rated options exist', () => {
      const results: RestaurantResult[] = [
        { id: '1', placeId: 'p1', name: 'Great Pizza', address: 'Addr1',
          location: { lat: 32, lng: 34 }, rating: 4.8 }
      ];

      const chips = service.generate(intent, results, 'NORMAL');
      
      const topRatedChip = chips.find(c => c.id === 'toprated');
      expect(topRatedChip).toBeDefined();
      expect(topRatedChip?.emoji).toBe('⭐');
      expect(topRatedChip?.filter).toBe('rating>=4.5');
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

    it('should generate sort by rating chip', () => {
      const chips = service.generate(intent, [], 'RECOVERY');
      
      const sortRatingChip = chips.find(c => c.id === 'sort_rating');
      expect(sortRatingChip).toBeDefined();
      expect(sortRatingChip?.emoji).toBe('⭐');
      expect(sortRatingChip?.action).toBe('sort');
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

