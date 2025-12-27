/**
 * TruthState Types - Unit Tests
 * Phase 2: Test deterministic helper functions
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeResponseMode,
  buildAssistantContext,
  type ResponseMode,
  type FailureReason,
  type TruthState,
} from './truth-state.types.js';
import type { ParsedIntent } from './search.types.js';

describe('computeResponseMode', () => {
  it('should return CLARIFY for GEOCODING_FAILED', () => {
    expect(computeResponseMode('GEOCODING_FAILED')).toBe('CLARIFY');
  });

  it('should return CLARIFY for LOW_CONFIDENCE', () => {
    expect(computeResponseMode('LOW_CONFIDENCE')).toBe('CLARIFY');
  });

  it('should return RECOVERY for NO_RESULTS', () => {
    expect(computeResponseMode('NO_RESULTS')).toBe('RECOVERY');
  });

  it('should return RECOVERY for GOOGLE_API_ERROR', () => {
    expect(computeResponseMode('GOOGLE_API_ERROR')).toBe('RECOVERY');
  });

  it('should return RECOVERY for TIMEOUT', () => {
    expect(computeResponseMode('TIMEOUT')).toBe('RECOVERY');
  });

  it('should return RECOVERY for QUOTA_EXCEEDED', () => {
    expect(computeResponseMode('QUOTA_EXCEEDED')).toBe('RECOVERY');
  });

  it('should return RECOVERY for LIVE_DATA_UNAVAILABLE', () => {
    expect(computeResponseMode('LIVE_DATA_UNAVAILABLE')).toBe('RECOVERY');
  });

  it('should return NORMAL for NONE', () => {
    expect(computeResponseMode('NONE')).toBe('NORMAL');
  });

  it('should return RECOVERY for WEAK_MATCHES', () => {
    expect(computeResponseMode('WEAK_MATCHES')).toBe('RECOVERY');
  });

  // Phase 5: Test weak matches parameter
  it('should return RECOVERY when NONE but hasWeakMatches is true', () => {
    expect(computeResponseMode('NONE', true)).toBe('RECOVERY');
  });

  it('should return NORMAL when NONE and hasWeakMatches is false', () => {
    expect(computeResponseMode('NONE', false)).toBe('NORMAL');
  });

  it('should return NORMAL when NONE and hasWeakMatches is undefined', () => {
    expect(computeResponseMode('NONE')).toBe('NORMAL');
  });
});

describe('buildAssistantContext', () => {
  const mockIntent: ParsedIntent = {
    query: 'pizza in tel aviv',
    originalQuery: 'pizza in tel aviv',
    language: 'en',
    searchMode: 'textsearch',
    filters: {},
    canonical: {
      category: 'pizza',
      locationText: 'Tel Aviv',
    },
    requiresLiveData: true,
    confidenceLevel: 'high',
    location: {
      city: 'Tel Aviv',
    },
  };

  const mockResults = [
    { placeId: 'place-1', name: 'Pizza 1', openNow: true },
    { placeId: 'place-2', name: 'Pizza 2', openNow: false },
    { placeId: 'place-3', name: 'Pizza 3', openNow: 'UNKNOWN' },
    { placeId: 'place-4', name: 'Pizza 4', openNow: true },
  ];

  const mockChips = [
    { id: 'chip-1', label: 'Delivery', emoji: '🚚', type: 'filter', action: {} },
    { id: 'chip-2', label: 'Open Now', emoji: '🕐', type: 'filter', action: {} },
    { id: 'chip-3', label: 'Top Rated', emoji: '⭐', type: 'sort', action: {} },
  ];

  it('should extract minimal allowlist fields only', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
      liveDataVerified: false,
    });

    // Should have only allowlisted fields
    expect(context).toHaveProperty('language');
    expect(context).toHaveProperty('originalQuery');
    expect(context).toHaveProperty('canonical');
    expect(context).toHaveProperty('resultsCount');
    expect(context).toHaveProperty('topPlaceIds');
    expect(context).toHaveProperty('chipAllowlist');
    expect(context).toHaveProperty('failureReason');
    expect(context).toHaveProperty('mode');
    expect(context).toHaveProperty('liveData');
    expect(context).toHaveProperty('flags');
  });

  it('should set correct language', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.language).toBe('en');
  });

  it('should prefer originalQuery over query', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.originalQuery).toBe('pizza in tel aviv');
  });

  it('should include canonical interpretation', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.canonical).toEqual({
      category: 'pizza',
      locationText: 'Tel Aviv',
    });
  });

  it('should set resultsCount from results length', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.resultsCount).toBe(4);
  });

  it('should include only top 3 place IDs', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.topPlaceIds).toEqual(['place-1', 'place-2', 'place-3']);
    expect(context.topPlaceIds.length).toBe(3);
  });

  it('should extract only ID, label, emoji from chips', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.chipAllowlist).toEqual([
      { id: 'chip-1', label: 'Delivery', emoji: '🚚' },
      { id: 'chip-2', label: 'Open Now', emoji: '🕐' },
      { id: 'chip-3', label: 'Top Rated', emoji: '⭐' },
    ]);

    // Should NOT include 'type' or 'action' fields
    context.chipAllowlist.forEach(chip => {
      expect(chip).not.toHaveProperty('type');
      expect(chip).not.toHaveProperty('action');
    });
  });

  it('should set correct failure reason and mode', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NO_RESULTS',
      mode: 'RECOVERY',
    });

    expect(context.failureReason).toBe('NO_RESULTS');
    expect(context.mode).toBe('RECOVERY');
  });

  it('should set liveData verification flags', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
      liveDataVerified: true,
    });

    expect(context.liveData.openingHoursVerified).toBe(true);
    expect(context.liveData.source).toBe('places_details');
  });

  it('should default liveData to false/places_search', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.liveData.openingHoursVerified).toBe(false);
    expect(context.liveData.source).toBe('places_search');
  });

  it('should set requiresLiveData flag from intent', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.flags.requiresLiveData).toBe(true);
  });

  it('should set isLowConfidence flag based on confidenceLevel', () => {
    const lowConfidenceIntent = {
      ...mockIntent,
      confidenceLevel: 'low' as const,
    };

    const context = buildAssistantContext({
      intent: lowConfidenceIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.flags.isLowConfidence).toBe(true);
  });

  it('should set hasLocation flag when city present', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.flags.hasLocation).toBe(true);
  });

  it('should set hasLocation to false when no city', () => {
    const intentNoCity = {
      ...mockIntent,
      location: undefined,
    };

    const context = buildAssistantContext({
      intent: intentNoCity,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.flags.hasLocation).toBe(false);
  });

  it('should handle empty results array', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: [],
      chips: mockChips as any,
      failureReason: 'NO_RESULTS',
      mode: 'RECOVERY',
    });

    expect(context.resultsCount).toBe(0);
    expect(context.topPlaceIds).toEqual([]);
  });

  it('should handle empty chips array', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: [],
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    expect(context.chipAllowlist).toEqual([]);
  });

  it('should NOT expose full ParsedIntent fields', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    // Should NOT have access to full intent object
    expect(context).not.toHaveProperty('searchMode');
    expect(context).not.toHaveProperty('filters');
    expect(context).not.toHaveProperty('location');
  });

  it('should NOT expose full RestaurantResult objects', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    // Should NOT have results array, only count and top IDs
    expect(context).not.toHaveProperty('results');
    expect(context.resultsCount).toBe(4);
    expect(context.topPlaceIds.length).toBe(3);
  });

  it('should NOT expose chip action details', () => {
    const context = buildAssistantContext({
      intent: mockIntent,
      results: mockResults as any,
      chips: mockChips as any,
      failureReason: 'NONE',
      mode: 'NORMAL',
    });

    // ChipReference should only have id, label, emoji
    context.chipAllowlist.forEach(chip => {
      const keys = Object.keys(chip);
      expect(keys.sort()).toEqual(['emoji', 'id', 'label'].sort());
    });
  });
});

