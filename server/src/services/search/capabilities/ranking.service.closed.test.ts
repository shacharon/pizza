/**
 * Ranking Service - Closed Filter Tests
 * Tests for "סגור" (closed) filter functionality
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { RankingService } from './ranking.service.js';
import type { ParsedIntent, RestaurantResult } from '../types/search.types.js';

describe('RankingService - Closed Filter', () => {
  let service: RankingService;

  beforeEach(() => {
    service = new RankingService();
  });

  describe('openNow: false (Closed Filter)', () => {
    it('should prioritize closed restaurants when openNow is false', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Open Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.5,
          openNow: true,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Closed Restaurant',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.0,
          openNow: false,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'pizza',
        language: 'he',
        searchMode: 'textsearch',
        filters: { openNow: false }, // User wants closed restaurants
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Closed restaurant should rank higher despite lower rating
      expect(ranked[0].id).toBe('2');
      expect(ranked[0].name).toBe('Closed Restaurant');
    });

    it('should penalize open restaurants when openNow is false', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Open Restaurant',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.8,
          openNow: true,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Closed Restaurant',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 3.5,
          openNow: false,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'pizza',
        language: 'he',
        searchMode: 'textsearch',
        filters: { openNow: false },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Even with much lower rating, closed should still rank higher
      expect(ranked[0].id).toBe('2');
    });

    it('should handle multiple closed restaurants correctly', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Closed A',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.5,
          openNow: false,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Closed B',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.8,
          openNow: false,
          source: 'google_places',
        },
        {
          id: '3',
          placeId: 'place-3',
          name: 'Open',
          address: '789 Main St',
          location: { lat: 0, lng: 0 },
          rating: 5.0,
          openNow: true,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'pizza',
        language: 'he',
        searchMode: 'textsearch',
        filters: { openNow: false },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // All closed restaurants should rank above open
      expect(ranked[0].openNow).toBe(false);
      expect(ranked[1].openNow).toBe(false);
      expect(ranked[2].openNow).toBe(true);
      
      // Among closed, higher rating should win
      expect(ranked[0].id).toBe('2'); // 4.8 rating
      expect(ranked[1].id).toBe('1'); // 4.5 rating
    });

    it('should handle unknown openNow status gracefully', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Unknown Status',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.5,
          openNow: undefined,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Closed',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.0,
          openNow: false,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'pizza',
        language: 'he',
        searchMode: 'textsearch',
        filters: { openNow: false },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Closed should rank higher than unknown
      expect(ranked[0].id).toBe('2');
    });
  });

  describe('openNow: true (Open Filter - Existing Behavior)', () => {
    it('should still prioritize open restaurants when openNow is true', () => {
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
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        filters: { openNow: true },
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Open restaurant should rank higher
      expect(ranked[0].id).toBe('2');
    });
  });

  describe('openNow: undefined (No Filter)', () => {
    it('should not apply open/closed penalty when openNow is undefined', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Closed High Rating',
          address: '123 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.8,
          openNow: false,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Open Low Rating',
          address: '456 Main St',
          location: { lat: 0, lng: 0 },
          rating: 4.0,
          openNow: true,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'pizza',
        language: 'en',
        searchMode: 'textsearch',
        filters: {}, // No openNow filter
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Higher rating should win (no open/closed penalty)
      expect(ranked[0].id).toBe('1');
    });
  });

  describe('Real-World Scenarios', () => {
    it('should handle "פיצה בגדרה סגור" query', () => {
      const mockResults: Partial<RestaurantResult>[] = [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Pizza Place (Open)',
          address: 'Gedera',
          location: { lat: 31.8, lng: 34.7 },
          rating: 4.5,
          openNow: true,
          source: 'google_places',
        },
        {
          id: '2',
          placeId: 'place-2',
          name: 'Pizza Place (Closed)',
          address: 'Gedera',
          location: { lat: 31.8, lng: 34.7 },
          rating: 4.3,
          openNow: false,
          source: 'google_places',
        },
      ];

      const mockIntent: ParsedIntent = {
        query: 'פיצה',
        language: 'he',
        searchMode: 'textsearch',
        location: { city: 'גדרה' },
        filters: { openNow: false }, // סגור
      };

      const ranked = service.rank(mockResults as RestaurantResult[], mockIntent);
      
      // Closed pizza place should rank first
      expect(ranked[0].id).toBe('2');
      expect(ranked[0].openNow).toBe(false);
    });
  });
});

