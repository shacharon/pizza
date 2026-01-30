/**
 * Search Response Mapper Tests
 * Tests for pure response transformation functions
 */

import {
  flattenResultGroups,
  extractExactResults,
  extractNearbyResults,
  requiresClarification,
  hasResults,
  getConfidence,
  isLowConfidence,
  getAppliedFilters,
  isFilterApplied,
  getAssistMode,
  isPipelineStopped
} from './search-response.mapper';
import type { SearchResponse, ResultGroup, Restaurant } from '../types/search.types';

describe('Search Response Mapper', () => {
  // Mock restaurant data
  const mockRestaurant1: Restaurant = {
    id: 'r1',
    placeId: 'place1',
    name: 'Restaurant 1',
    address: '123 Main St',
    location: { lat: 40.7128, lng: -74.006 },
    rank: 1
  } as Restaurant;

  const mockRestaurant2: Restaurant = {
    id: 'r2',
    placeId: 'place2',
    name: 'Restaurant 2',
    address: '456 Oak Ave',
    location: { lat: 40.7129, lng: -74.007 },
    rank: 2
  } as Restaurant;

  const mockRestaurant3: Restaurant = {
    id: 'r3',
    placeId: 'place3',
    name: 'Restaurant 3',
    address: '789 Pine Rd',
    location: { lat: 40.7130, lng: -74.008 },
    rank: 3
  } as Restaurant;

  describe('flattenResultGroups', () => {
    it('should flatten multiple groups', () => {
      const groups: ResultGroup[] = [
        { kind: 'EXACT', results: [mockRestaurant1, mockRestaurant2], label: 'Exact matches' },
        { kind: 'NEARBY', results: [mockRestaurant3], label: 'Nearby' }
      ];

      const result = flattenResultGroups(groups);
      expect(result).toEqual([mockRestaurant1, mockRestaurant2, mockRestaurant3]);
    });

    it('should return empty array for undefined groups', () => {
      expect(flattenResultGroups(undefined)).toEqual([]);
    });

    it('should return empty array for empty groups', () => {
      expect(flattenResultGroups([])).toEqual([]);
    });

    it('should handle single group', () => {
      const groups: ResultGroup[] = [
        { kind: 'EXACT', results: [mockRestaurant1], label: 'Exact' }
      ];
      expect(flattenResultGroups(groups)).toEqual([mockRestaurant1]);
    });

    it('should preserve ordering', () => {
      const groups: ResultGroup[] = [
        { kind: 'EXACT', results: [mockRestaurant1], label: 'A' },
        { kind: 'NEARBY', results: [mockRestaurant2], label: 'B' },
        { kind: 'EXACT', results: [mockRestaurant3], label: 'C' }
      ];
      const result = flattenResultGroups(groups);
      expect(result[0].id).toBe('r1');
      expect(result[1].id).toBe('r2');
      expect(result[2].id).toBe('r3');
    });
  });

  describe('extractExactResults', () => {
    it('should extract EXACT group results', () => {
      const groups: ResultGroup[] = [
        { kind: 'EXACT', results: [mockRestaurant1, mockRestaurant2], label: 'Exact' },
        { kind: 'NEARBY', results: [mockRestaurant3], label: 'Nearby' }
      ];

      const result = extractExactResults(groups);
      expect(result).toEqual([mockRestaurant1, mockRestaurant2]);
    });

    it('should return empty array if no EXACT group', () => {
      const groups: ResultGroup[] = [
        { kind: 'NEARBY', results: [mockRestaurant1], label: 'Nearby' }
      ];
      expect(extractExactResults(groups)).toEqual([]);
    });

    it('should return empty array for undefined groups', () => {
      expect(extractExactResults(undefined)).toEqual([]);
    });
  });

  describe('extractNearbyResults', () => {
    it('should extract NEARBY group results', () => {
      const groups: ResultGroup[] = [
        { kind: 'EXACT', results: [mockRestaurant1], label: 'Exact' },
        { kind: 'NEARBY', results: [mockRestaurant2, mockRestaurant3], label: 'Nearby' }
      ];

      const result = extractNearbyResults(groups);
      expect(result).toEqual([mockRestaurant2, mockRestaurant3]);
    });

    it('should return empty array if no NEARBY group', () => {
      const groups: ResultGroup[] = [
        { kind: 'EXACT', results: [mockRestaurant1], label: 'Exact' }
      ];
      expect(extractNearbyResults(groups)).toEqual([]);
    });

    it('should return empty array for undefined groups', () => {
      expect(extractNearbyResults(undefined)).toEqual([]);
    });
  });

  describe('requiresClarification', () => {
    it('should return true when requiresClarification is true', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        requiresClarification: true,
        meta: {}
      };
      expect(requiresClarification(response)).toBe(true);
    });

    it('should return false when requiresClarification is false', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        requiresClarification: false,
        meta: {}
      };
      expect(requiresClarification(response)).toBe(false);
    });

    it('should return false for null response', () => {
      expect(requiresClarification(null)).toBe(false);
    });
  });

  describe('hasResults', () => {
    it('should return true when results exist', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [mockRestaurant1],
        chips: [],
        meta: {}
      };
      expect(hasResults(response)).toBe(true);
    });

    it('should return false when results array is empty', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: {}
      };
      expect(hasResults(response)).toBe(false);
    });

    it('should return false for null response', () => {
      expect(hasResults(null)).toBe(false);
    });
  });

  describe('getConfidence', () => {
    it('should return confidence from meta', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { confidence: 0.85 }
      };
      expect(getConfidence(response)).toBe(0.85);
    });

    it('should return 1.0 as default when meta missing', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: {}
      };
      expect(getConfidence(response)).toBe(1.0);
    });

    it('should return 1.0 for null response', () => {
      expect(getConfidence(null)).toBe(1.0);
    });
  });

  describe('isLowConfidence', () => {
    it('should return true when confidence below default threshold (0.6)', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { confidence: 0.5 }
      };
      expect(isLowConfidence(response)).toBe(true);
    });

    it('should return false when confidence above threshold', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { confidence: 0.8 }
      };
      expect(isLowConfidence(response)).toBe(false);
    });

    it('should support custom threshold', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { confidence: 0.7 }
      };
      expect(isLowConfidence(response, 0.8)).toBe(true);
      expect(isLowConfidence(response, 0.5)).toBe(false);
    });
  });

  describe('getAppliedFilters', () => {
    it('should return applied filters from meta', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { appliedFilters: ['open_now', 'delivery'] }
      };
      expect(getAppliedFilters(response)).toEqual(['open_now', 'delivery']);
    });

    it('should return empty array when no filters', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: {}
      };
      expect(getAppliedFilters(response)).toEqual([]);
    });

    it('should return empty array for null response', () => {
      expect(getAppliedFilters(null)).toEqual([]);
    });
  });

  describe('isFilterApplied', () => {
    it('should return true when filter is applied', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { appliedFilters: ['open_now', 'delivery'] }
      };
      expect(isFilterApplied(response, 'open_now')).toBe(true);
      expect(isFilterApplied(response, 'delivery')).toBe(true);
    });

    it('should return false when filter is not applied', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { appliedFilters: ['open_now'] }
      };
      expect(isFilterApplied(response, 'kosher')).toBe(false);
    });
  });

  describe('getAssistMode', () => {
    it('should return assist mode from response', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        assist: { mode: 'RECOVERY' },
        meta: {}
      };
      expect(getAssistMode(response)).toBe('RECOVERY');
    });

    it('should return NORMAL as default', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: {}
      };
      expect(getAssistMode(response)).toBe('NORMAL');
    });

    it('should return NORMAL for null response', () => {
      expect(getAssistMode(null)).toBe('NORMAL');
    });
  });

  describe('isPipelineStopped', () => {
    it('should return true when source is route2_gate_stop', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { source: 'route2_gate_stop' }
      };
      expect(isPipelineStopped(response)).toBe(true);
    });

    it('should return true when failureReason is LOW_CONFIDENCE', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: { failureReason: 'LOW_CONFIDENCE' }
      };
      expect(isPipelineStopped(response)).toBe(true);
    });

    it('should return false when neither condition met', () => {
      const response: SearchResponse = {
        requestId: 'req-1',
        sessionId: 'sess-1',
        query: { original: 'test', parsed: {}, language: 'en' },
        results: [],
        chips: [],
        meta: {}
      };
      expect(isPipelineStopped(response)).toBe(false);
    });

    it('should return false for null response', () => {
      expect(isPipelineStopped(null)).toBe(false);
    });
  });
});
