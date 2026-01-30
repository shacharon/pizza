/**
 * Chip Mapper Tests
 * Tests for pure mapping functions
 */

import {
  mapChipToSortKey,
  buildSearchFilters,
  parseFilterString
} from './chip.mapper';
import type { RefinementChip } from '../types/search.types';

describe('Chip Mapper', () => {
  describe('mapChipToSortKey', () => {
    it('should map sort_best_match to BEST_MATCH', () => {
      expect(mapChipToSortKey('sort_best_match')).toBe('BEST_MATCH');
    });

    it('should map best_match to BEST_MATCH', () => {
      expect(mapChipToSortKey('best_match')).toBe('BEST_MATCH');
    });

    it('should map sort_closest to CLOSEST', () => {
      expect(mapChipToSortKey('sort_closest')).toBe('CLOSEST');
    });

    it('should map closest to CLOSEST', () => {
      expect(mapChipToSortKey('closest')).toBe('CLOSEST');
    });

    it('should map sort_rating to RATING_DESC', () => {
      expect(mapChipToSortKey('sort_rating')).toBe('RATING_DESC');
    });

    it('should map toprated to RATING_DESC', () => {
      expect(mapChipToSortKey('toprated')).toBe('RATING_DESC');
    });

    it('should map sort_price to PRICE_ASC', () => {
      expect(mapChipToSortKey('sort_price')).toBe('PRICE_ASC');
    });

    it('should default to BEST_MATCH for unknown chip IDs', () => {
      expect(mapChipToSortKey('unknown_chip')).toBe('BEST_MATCH');
      expect(mapChipToSortKey('')).toBe('BEST_MATCH');
    });
  });

  describe('buildSearchFilters', () => {
    const mockChips: RefinementChip[] = [
      { id: 'opennow', action: 'filter', filter: 'opennow', label: 'Open now' },
      { id: 'closednow', action: 'filter', filter: 'closednow', label: 'Closed now' },
      { id: 'price_2', action: 'filter', filter: 'price<=2', label: 'Price $$' },
      { id: 'price_4', action: 'filter', filter: 'price<=4', label: 'Price $$$$' },
      { id: 'delivery', action: 'filter', filter: 'delivery', label: 'Delivery' },
      { id: 'kosher', action: 'filter', filter: 'kosher', label: 'Kosher' },
      { id: 'vegan', action: 'filter', filter: 'vegan', label: 'Vegan' },
      { id: 'glutenfree', action: 'filter', filter: 'glutenfree', label: 'Gluten-free' }
    ];

    it('should return empty filters for empty set', () => {
      const result = buildSearchFilters(new Set(), mockChips);
      expect(result).toEqual({});
    });

    it('should map opennow filter', () => {
      const result = buildSearchFilters(new Set(['opennow']), mockChips);
      expect(result).toEqual({ openNow: true });
    });

    it('should map closednow filter', () => {
      const result = buildSearchFilters(new Set(['closednow']), mockChips);
      expect(result).toEqual({ openNow: false });
    });

    it('should map price filter', () => {
      const result = buildSearchFilters(new Set(['price_2']), mockChips);
      expect(result).toEqual({ priceLevel: 2 });
    });

    it('should validate price level range (1-4)', () => {
      const validResult = buildSearchFilters(new Set(['price_4']), mockChips);
      expect(validResult).toEqual({ priceLevel: 4 });

      // Invalid price levels should be ignored
      const invalidChips: RefinementChip[] = [
        { id: 'price_0', action: 'filter', filter: 'price<=0', label: 'Invalid' },
        { id: 'price_5', action: 'filter', filter: 'price<=5', label: 'Invalid' }
      ];
      const invalidResult = buildSearchFilters(new Set(['price_0', 'price_5']), invalidChips);
      expect(invalidResult).toEqual({});
    });

    it('should map delivery filter to mustHave', () => {
      const result = buildSearchFilters(new Set(['delivery']), mockChips);
      expect(result).toEqual({ mustHave: ['delivery'] });
    });

    it('should map dietary filters', () => {
      const result = buildSearchFilters(new Set(['kosher']), mockChips);
      expect(result).toEqual({ dietary: ['kosher'] });
    });

    it('should combine multiple dietary filters', () => {
      const result = buildSearchFilters(new Set(['kosher', 'vegan', 'glutenfree']), mockChips);
      expect(result).toEqual({
        dietary: ['kosher', 'vegan', 'glutenfree']
      });
    });

    it('should combine multiple filter types', () => {
      const result = buildSearchFilters(
        new Set(['opennow', 'price_2', 'delivery', 'kosher']),
        mockChips
      );
      expect(result).toEqual({
        openNow: true,
        priceLevel: 2,
        mustHave: ['delivery'],
        dietary: ['kosher']
      });
    });

    it('should ignore chips without filter action', () => {
      const mixedChips: RefinementChip[] = [
        { id: 'sort_rating', action: 'sort', label: 'Top rated' },
        { id: 'opennow', action: 'filter', filter: 'opennow', label: 'Open now' }
      ];
      const result = buildSearchFilters(new Set(['sort_rating', 'opennow']), mixedChips);
      expect(result).toEqual({ openNow: true });
    });

    it('should ignore non-existent chip IDs', () => {
      const result = buildSearchFilters(new Set(['nonexistent', 'opennow']), mockChips);
      expect(result).toEqual({ openNow: true });
    });
  });

  describe('parseFilterString', () => {
    it('should parse price filter', () => {
      const result = parseFilterString('price<=2');
      expect(result).toEqual({
        type: 'price',
        operator: '<=',
        value: '2'
      });
    });

    it('should parse simple filter', () => {
      const result = parseFilterString('opennow');
      expect(result).toEqual({ type: 'opennow' });
    });

    it('should parse kosher filter', () => {
      const result = parseFilterString('kosher');
      expect(result).toEqual({ type: 'kosher' });
    });

    it('should parse delivery filter', () => {
      const result = parseFilterString('delivery');
      expect(result).toEqual({ type: 'delivery' });
    });

    it('should handle empty string', () => {
      const result = parseFilterString('');
      expect(result).toEqual({ type: '' });
    });
  });
});
