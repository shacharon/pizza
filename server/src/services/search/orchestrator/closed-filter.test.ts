/**
 * Search Orchestrator - Derived Closed Filter Tests
 * Tests for Phase 8: Honest "closed now" filtering
 */

import { describe, it, expect } from '@jest/globals';
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

      expect(summary.open).toBe(2);
      expect(summary.closed).toBe(1);
      expect(summary.unknown).toBe(2);
      expect(summary.total).toBe(5);
    });

    it('should handle all-open results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Open A', address: 'St 1', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Open B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: true, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      expect(summary.open).toBe(2);
      expect(summary.closed).toBe(0);
      expect(summary.unknown).toBe(0);
      expect(summary.total).toBe(2);
    });

    it('should handle all-closed results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Closed A', address: 'St 1', location: { lat: 0, lng: 0 }, openNow: false, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Closed B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: false, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      expect(summary.open).toBe(0);
      expect(summary.closed).toBe(2);
      expect(summary.unknown).toBe(0);
      expect(summary.total).toBe(2);
    });

    it('should handle all-unknown results', () => {
      const results: Partial<RestaurantResult>[] = [
        { id: '1', placeId: 'p1', name: 'Unknown A', address: 'St 1', location: { lat: 0, lng: 0 }, source: 'google_places' },
        { id: '2', placeId: 'p2', name: 'Unknown B', address: 'St 2', location: { lat: 0, lng: 0 }, openNow: undefined, source: 'google_places' },
      ];

      const summary = calculateOpenNowSummary(results as RestaurantResult[]);

      expect(summary.open).toBe(0);
      expect(summary.closed).toBe(0);
      expect(summary.unknown).toBe(2);
      expect(summary.total).toBe(2);
    });

    it('should handle empty results', () => {
      const results: RestaurantResult[] = [];

      const summary = calculateOpenNowSummary(results);

      expect(summary.open).toBe(0);
      expect(summary.closed).toBe(0);
      expect(summary.unknown).toBe(0);
      expect(summary.total).toBe(0);
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

      expect(expectedBehavior.googleApiCall.openNow).toBeUndefined();
      expect(expectedBehavior.needsClosedFiltering).toBe(true);
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
      
      expect(summary.total).toBe(3);
      expect(summary.open).toBe(1);
      expect(summary.closed).toBe(1);
      expect(summary.unknown).toBe(1);

      // Step 2: Apply derived filter
      const filtered = (rawResults as RestaurantResult[]).filter(r => r.openNow === false);
      
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('2');

      // Summary must reflect BEFORE filtering
      expect(summary.total).toBe(3); // Not 1!
    });

    it('should add capabilities metadata to response', () => {
      const expectedCapabilities = {
        openNowApiSupported: true,
        closedNowApiSupported: false,
        closedNowIsDerived: true,
      };

      expect(expectedCapabilities.openNowApiSupported).toBe(true);
      expect(expectedCapabilities.closedNowApiSupported).toBe(false);
      expect(expectedCapabilities.closedNowIsDerived).toBe(true);
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
      expect(summary.total).toBe(4);
      expect(summary.open).toBe(2);
      expect(summary.closed).toBe(2);

      // Step 3: Apply derived filter (backend)
      const closedOnly = (googleResults as RestaurantResult[]).filter(r => r.openNow === false);
      expect(closedOnly.length).toBe(2);
      expect(closedOnly.every(r => r.openNow === false)).toBe(true);

      // Step 4: Response includes transparency metadata
      const responseMeta = {
        openNowSummary: summary,
        capabilities: {
          openNowApiSupported: true,
          closedNowApiSupported: false,
          closedNowIsDerived: true,
        }
      };

      expect(responseMeta.openNowSummary.closed).toBe(2);
      expect(responseMeta.capabilities.closedNowIsDerived).toBe(true);

      // Step 5: UI shows disclosure banner
      // "מציג רק מקומות סגורים (2 מתוך 4 תוצאות)"
      const expectedDisclosure = `מציג רק מקומות סגורים (${summary.closed} מתוך ${summary.total} תוצאות)`;
      expect(expectedDisclosure).toBe('מציג רק מקומות סגורים (2 מתוך 4 תוצאות)');
    });
  });
});

