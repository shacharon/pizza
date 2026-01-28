/**
 * Integration tests for Dietary Hints in post-results filter
 * 
 * Verifies SOFT hint behavior:
 * - No result removal
 * - No sorting changes
 * - Hints only attached when preference is active
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPostFilters } from '../src/services/search/route2/post-filters/post-results.filter.js';
import type { FinalSharedFilters } from '../src/services/search/route2/shared/shared-filters.types.js';

describe('Dietary Hints Integration - SOFT Hinting', () => {
  // Helper to create mock place results
  function createMockPlace(id: string, name: string, tags: string[]): any {
    return {
      id,
      placeId: id,
      source: 'google_places',
      name,
      address: 'Test Address',
      location: { lat: 32.0, lng: 34.0 },
      rating: 4.5,
      userRatingsTotal: 100,
      openNow: true,
      googleMapsUrl: `https://maps.google.com/?q=place_id:${id}`,
      tags
    };
  }

  // Helper to create mock filters
  function createMockFilters(isGlutenFree: boolean | null): FinalSharedFilters {
    return {
      uiLanguage: 'he',
      providerLanguage: 'he',
      openState: null,
      regionCode: 'IL',
      isGlutenFree,
      disclaimers: {
        hours: true,
        dietary: true
      }
    } as any;
  }

  describe('SOFT hint behavior - NO result removal', () => {
    it('should NOT remove results when isGlutenFree=true', () => {
      const results = [
        createMockPlace('place1', 'Regular Pizza', ['restaurant']),
        createMockPlace('place2', 'Gluten-Free Bakery', ['bakery']),
        createMockPlace('place3', 'Burger Joint', ['restaurant']),
        createMockPlace('place4', 'Vegan Cafe', ['cafe', 'vegan_restaurant']),
        createMockPlace('place5', 'Bank', ['bank'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-no-removal',
        pipelineVersion: 'route2'
      });

      // CRITICAL: All results must be kept (SOFT hint)
      assert.equal(output.resultsFiltered.length, 5);
      assert.equal(output.stats.before, 5);
      assert.equal(output.stats.after, 5);
      assert.equal(output.stats.removed, 0);
    });

    it('should preserve original result order', () => {
      const results = [
        createMockPlace('place1', 'Pizza A', ['restaurant']),
        createMockPlace('place2', 'Gluten-Free Bakery', ['bakery']),
        createMockPlace('place3', 'Pizza B', ['restaurant']),
        createMockPlace('place4', 'Vegan Cafe', ['cafe'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-order',
        pipelineVersion: 'route2'
      });

      // Verify order unchanged
      assert.equal(output.resultsFiltered[0].id, 'place1');
      assert.equal(output.resultsFiltered[1].id, 'place2');
      assert.equal(output.resultsFiltered[2].id, 'place3');
      assert.equal(output.resultsFiltered[3].id, 'place4');
    });

    it('should keep even non-food establishments', () => {
      const results = [
        createMockPlace('place1', 'Bank', ['bank']),
        createMockPlace('place2', 'Store', ['clothing_store']),
        createMockPlace('place3', 'Gluten-Free Bakery', ['bakery'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-non-food',
        pipelineVersion: 'route2'
      });

      // All kept, even non-food
      assert.equal(output.resultsFiltered.length, 3);
      assert.ok(output.resultsFiltered.some(r => r.name === 'Bank'));
      assert.ok(output.resultsFiltered.some(r => r.name === 'Store'));
    });
  });

  describe('Hint attachment behavior', () => {
    it('should attach glutenFree hints when isGlutenFree=true', () => {
      const results = [
        createMockPlace('place1', 'Gluten-Free Bakery', ['bakery']),
        createMockPlace('place2', 'Regular Cafe', ['cafe'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-attach-hints',
        pipelineVersion: 'route2'
      });

      // All results should have dietaryHints
      for (const result of output.resultsFiltered) {
        assert.ok(result.dietaryHints, `Result ${result.id} missing dietaryHints`);
        assert.ok(result.dietaryHints.glutenFree, `Result ${result.id} missing glutenFree hint`);
        assert.ok(['HIGH', 'MEDIUM', 'LOW', 'NONE'].includes(result.dietaryHints.glutenFree.confidence));
      }
    });

    it('should attach HIGH confidence for explicit gluten-free', () => {
      const results = [
        createMockPlace('place1', 'Gluten-Free Bakery', ['bakery'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-high-confidence',
        pipelineVersion: 'route2'
      });

      assert.equal(output.resultsFiltered[0].dietaryHints.glutenFree.confidence, 'HIGH');
      assert.ok(output.resultsFiltered[0].dietaryHints.glutenFree.matchedTerms.length > 0);
    });

    it('should attach MEDIUM confidence for vegan restaurant', () => {
      const results = [
        createMockPlace('place1', 'Vegan Delight', ['vegan_restaurant'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-medium-confidence',
        pipelineVersion: 'route2'
      });

      assert.equal(output.resultsFiltered[0].dietaryHints.glutenFree.confidence, 'MEDIUM');
    });

    it('should attach LOW confidence for generic restaurant', () => {
      const results = [
        createMockPlace('place1', 'Italian Restaurant', ['restaurant'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-low-confidence',
        pipelineVersion: 'route2'
      });

      assert.equal(output.resultsFiltered[0].dietaryHints.glutenFree.confidence, 'LOW');
    });

    it('should attach NONE confidence for non-food establishment', () => {
      const results = [
        createMockPlace('place1', 'Bank', ['bank'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-none-confidence',
        pipelineVersion: 'route2'
      });

      assert.equal(output.resultsFiltered[0].dietaryHints.glutenFree.confidence, 'NONE');
      assert.equal(output.resultsFiltered[0].dietaryHints.glutenFree.matchedTerms.length, 0);
    });

    it('should NOT attach hints when isGlutenFree=null', () => {
      const results = [
        createMockPlace('place1', 'Gluten-Free Bakery', ['bakery']),
        createMockPlace('place2', 'Regular Cafe', ['cafe'])
      ];

      const filters = createMockFilters(null);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-no-hints',
        pipelineVersion: 'route2'
      });

      // No hints should be attached
      for (const result of output.resultsFiltered) {
        assert.ok(!result.dietaryHints, `Result ${result.id} should not have dietaryHints`);
      }
    });

    it('should NOT attach hints when isGlutenFree=false', () => {
      const results = [
        createMockPlace('place1', 'Gluten-Free Bakery', ['bakery'])
      ];

      const filters = createMockFilters(false);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-false-no-hints',
        pipelineVersion: 'route2'
      });

      assert.ok(!output.resultsFiltered[0].dietaryHints);
    });
  });

  describe('Integration with openState filtering', () => {
    it('should apply both openState filter and dietary hints', () => {
      const results = [
        { ...createMockPlace('place1', 'Gluten-Free Bakery', ['bakery']), openNow: true },
        { ...createMockPlace('place2', 'Regular Cafe', ['cafe']), openNow: false },
        { ...createMockPlace('place3', 'Vegan Restaurant', ['vegan_restaurant']), openNow: true }
      ];

      const filters: FinalSharedFilters = {
        uiLanguage: 'he',
        providerLanguage: 'he',
        openState: 'OPEN_NOW', // Filter by open
        regionCode: 'IL',
        isGlutenFree: true, // Also attach hints
        disclaimers: {
          hours: true,
          dietary: true
        }
      } as any;

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-combined',
        pipelineVersion: 'route2'
      });

      // Should filter by openState (2 results)
      assert.equal(output.resultsFiltered.length, 2);
      assert.ok(output.resultsFiltered.every(r => r.openNow === true));

      // Should attach hints to remaining results
      for (const result of output.resultsFiltered) {
        assert.ok(result.dietaryHints);
        assert.ok(result.dietaryHints.glutenFree);
      }
    });
  });

  describe('Performance and edge cases', () => {
    it('should handle empty results array', () => {
      const results: any[] = [];
      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-empty',
        pipelineVersion: 'route2'
      });

      assert.equal(output.resultsFiltered.length, 0);
      assert.equal(output.stats.before, 0);
      assert.equal(output.stats.after, 0);
    });

    it('should handle large result sets efficiently', () => {
      const results = Array.from({ length: 100 }, (_, i) =>
        createMockPlace(`place${i}`, `Restaurant ${i}`, ['restaurant'])
      );

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-large',
        pipelineVersion: 'route2'
      });

      // All results kept
      assert.equal(output.resultsFiltered.length, 100);

      // All have hints
      assert.ok(output.resultsFiltered.every(r => r.dietaryHints?.glutenFree));
    });

    it('should handle missing fields gracefully', () => {
      const results = [
        { id: 'place1' }, // Minimal object
        createMockPlace('place2', 'Gluten-Free Cafe', ['cafe'])
      ];

      const filters = createMockFilters(true);

      const output = applyPostFilters({
        results,
        sharedFilters: filters,
        requestId: 'test-missing-fields',
        pipelineVersion: 'route2'
      });

      // Should not crash
      assert.equal(output.resultsFiltered.length, 2);
      assert.ok(output.resultsFiltered[0].dietaryHints);
      assert.equal(output.resultsFiltered[0].dietaryHints.glutenFree.confidence, 'NONE');
    });
  });
});
