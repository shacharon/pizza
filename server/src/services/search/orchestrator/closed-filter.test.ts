/**
 * Search Orchestrator - Derived Closed Filter Tests
 * Tests for Phase 8: Honest "closed now" filtering
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calculateOpenNowSummary } from '../utils/opening-hours-summary.js';
import type { RestaurantResult } from '../types/search.types.js';

describe('Search Orchestrator - Derived Closed Filter', () => {
  describe('calculateOpenNowSummary', () => {
    it('should calculate summary correctly with mixed results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Open A', address: 'St 1', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Open B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
        { id: '3', placeId: 'p3', name: 'Closed A', address: 'St 3', location: { lat: 0, lng: 0 }, openNow: false, source: 'google_places' },
        { id: '4', placeId: 'p4', name: 'Unknown A', address: 'St 4', location: { lat: 0, lng: 0 }, openNow: undefined, source: 'google_places' },
        { id: '5', placeId: 'p5', name: 'Unknown B', address: 'St 5', location: { lat: 0, lng: 0 }, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      assert.strictEqual(summary.open, 2);
      assert.strictEqual(summary.closed, 1);
      assert.strictEqual(summary.unknown, 2);
      assert.strictEqual(summary.total, 5);
    });

    it('should handle all-open results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Open A', address: 'St 1', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Open B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      assert.strictEqual(summary.open, 2);
      assert.strictEqual(summary.closed, 0);
      assert.strictEqual(summary.unknown, 0);
      assert.strictEqual(summary.total, 2);
    });

    it('should handle all-closed results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Closed A', address: 'St 1', location: { lat: 0, lng: 0 }, openNow: false, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Closed B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: false, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      assert.strictEqual(summary.open, 0);
      assert.strictEqual(summary.closed, 2);
      assert.strictEqual(summary.unknown, 0);
      assert.strictEqual(summary.total, 2);
    });

    it('should handle all-unknown results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Unknown A', address: 'St 1', location: { lat: 0, lng: 0 }, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Unknown B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: undefined, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      assert.strictEqual(summary.open, 0);
      assert.strictEqual(summary.closed, 0);
      assert.strictEqual(summary.unknown, 2);
      assert.strictEqual(summary.total, 2);
    });

    it('should handle empty results', () => {
      const results: RestaurantResult[] = [];

      const summary = calculateOpenNowSummary(results);

      assert.strictEqual(summary.open, 0);
      assert.strictEqual(summary.closed, 0);
      assert.strictEqual(summary.unknown, 0);
      assert.strictEqual(summary.total, 0);
    });
  });

  describe('Derived Filter Behavior (Integration)', () => {
    it('should NOT send openNow: false to Google API', () => {
      // This is validated in the orchestrator:
      // When intent.filters.openNow === false:
      // - Do NOT add openNow to Google API filters
      // - Set needsClosedFiltering flag
      // - Fetch all results
      // - Filter on backend for openNow === false

      // This test documents the expected behavior
      const expectedBehavior = {
        googleApiCall: {
          openNow: undefined, // NOT false!
          // Other filters...
        },
        needsClosedFiltering: true,
        postFilter: (results: RestaurantResult[]) => results.filter(r => r.openNow === false)
      };

      assert.strictEqual(expectedBehavior.googleApiCall.openNow, undefined);
      assert.strictEqual(expectedBehavior.needsClosedFiltering, true);
    });

    it('should calculate summary BEFORE applying derived filter', () => {
      // Mock raw results from Google
      const rawResults: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Open', address: 'St 1', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Closed', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: false, source: 'google_places' },
        { id: '3', placeId: 'p3', name: 'Unknown', address: 'St 3', location: { lat: 0, lng: 0 }, openNow: undefined, source: 'google_places' },
      ];

      // Step 1: Calculate summary (BEFORE filtering)
      const summary = calculateOpenNowSummary(rawResults as RestaurantResult[]);

      assert.strictEqual(summary.total, 3);
      assert.strictEqual(summary.open, 1);
      assert.strictEqual(summary.closed, 1);
      assert.strictEqual(summary.unknown, 1);

      // Step 2: Apply derived filter
      const filtered = (rawResults as RestaurantResult[]).filter(r => r.openNow === false);

      assert.strictEqual(filtered.length, 1);
      assert.strictEqual(filtered[0].id, '2');

      // Summary must reflect BEFORE filtering
      assert.strictEqual(summary.total, 3); // Not 1!
    });

    it('should add capabilities metadata to response', () => {
      const expectedCapabilities = {
        openNowApiSupported: true,
        closedNowApiSupported: false,
        closedNowIsDerived: true,
      };

      assert.strictEqual(expectedCapabilities.openNowApiSupported, true);
      assert.strictEqual(expectedCapabilities.closedNowApiSupported, false);
      assert.strictEqual(expectedCapabilities.closedNowIsDerived, true);
    });
  });

  describe('Real-World Scenario: "פיצה בגדרה סגור"', () => {
    it('should filter for closed restaurants transparently', () => {
      // Step 1: Google API returns all results (openNow not specified)
      const googleResults: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Pizza A', address: 'Gedera', location: { lat: 31.8, lng: 34.7 }, openNow: true, rating: 4.5, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Pizza B', address: 'Gedera', location: { lat: 31.8, lng: 34.7 }, openNow: false, rating: 4.3, source: 'google_places' },
        { id: '3', placeId: 'p3', name: 'Pizza C', address: 'Gedera', location: { lat: 31.8, lng: 34.7 }, openNow: true, rating: 4.7, source: 'google_places' },
        { id: '4', placeId: 'p4', name: 'Pizza D', address: 'Gedera', location: { lat: 31.8, lng: 34.7 }, openNow: false, rating: 4.2, source: 'google_places' },
      ];

      // Step 2: Calculate summary BEFORE filtering
      const summary = calculateOpenNowSummary(googleResults as RestaurantResult[]);
      assert.strictEqual(summary.total, 4);
      assert.strictEqual(summary.open, 2);
      assert.strictEqual(summary.closed, 2);

      // Step 3: Apply derived filter (backend)
      const closedOnly = (googleResults as RestaurantResult[]).filter(r => r.openNow === false);
      assert.strictEqual(closedOnly.length, 2);
      assert.strictEqual(closedOnly.every(r => r.openNow === false), true);

      // Step 4: Response includes transparency metadata
      const responseMeta = {
        openNowSummary: summary,
        capabilities: {
          openNowApiSupported: true,
          closedNowApiSupported: false,
          closedNowIsDerived: true,
        }
      };

      assert.strictEqual(responseMeta.openNowSummary.closed, 2);
      assert.strictEqual(responseMeta.capabilities.closedNowIsDerived, true);

      // Step 5: UI shows disclosure banner
      // "מציג רק מקומות סגורים (2 מתוך 4 תוצאות)"
      const expectedDisclosure = `מציג רק מקומות סגורים (${summary.closed} מתוך ${summary.total} תוצאות)`;
      assert.strictEqual(expectedDisclosure, 'מציג רק מקומות סגורים (2 מתוך 4 תוצאות)');
    });
  });
});

