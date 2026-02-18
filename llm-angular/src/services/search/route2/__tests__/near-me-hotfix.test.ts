/**
 * Integration tests for Near-Me location requirement HOTFIX
 * 
 * Tests the deterministic override logic in route2.orchestrator.ts
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { SearchRequest } from '../../types/search.types.js';
import type { Route2Context } from '../types.js';
import type { LLMProvider } from '../../../../llm/types.js';

// Mock modules
jest.mock('../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../../server.js', () => ({
  wsManager: {
    publishToChannel: jest.fn()
  }
}));

jest.mock('../stages/gate2.stage.js', () => ({
  executeGate2Stage: jest.fn().mockResolvedValue({
    gate: {
      route: 'CONTINUE',
      confidence: 0.9,
      reason: 'food_signal_detected'
    },
    filters: {},
    region: 'IL'
  })
}));

jest.mock('../stages/intent/intent.stage.js', () => ({
  executeIntentStage: jest.fn().mockResolvedValue({
    route: 'TEXTSEARCH',
    region: 'IL',
    language: 'he',
    confidence: 0.8,
    reason: 'text_search_detected'
  })
}));

jest.mock('../stages/route-llm/route-llm.dispatcher.js', () => ({
  executeRouteLLM: jest.fn().mockResolvedValue({
    providerMethod: 'textSearch',
    region: 'IL',
    language: 'he',
    textQuery: 'מסעדות פתוחות',
    categoryHint: 'restaurant'
  })
}));

jest.mock('../shared/base-filters-llm.js', () => ({
  resolveBaseFiltersLLM: jest.fn().mockResolvedValue({
    language: 'he',
    openState: null
  })
}));

jest.mock('../stages/post-constraints/post-constraints.stage.js', () => ({
  executePostConstraintsStage: jest.fn().mockResolvedValue({
    openState: null,
    openAt: null,
    openBetween: null,
    priceLevel: null,
    isKosher: null,
    isGlutenFree: null,
    requirements: {
      accessible: null,
      parking: null
    }
  })
}));

describe('Near-Me HOTFIX - Integration Tests', () => {
  let mockLLMProvider: LLMProvider;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMProvider = {
      completeJSON: jest.fn(),
      complete: jest.fn()
    } as any;
  });

  const createRequest = (query: string, userLocation?: { lat: number; lng: number }): SearchRequest => ({
    query,
    userLocation,
    filters: {}
  });

  const createContext = (): Route2Context => ({
    requestId: 'test-req-123',
    sessionId: 'test-session-456',
    llmProvider: mockLLMProvider,
    userRegionCode: 'IL',
    userLocation: undefined
  });

  describe('CASE 1: Near-me WITHOUT location → CLARIFY', () => {
    it('should return CLARIFY for "לידי" without userLocation', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');

      const request = createRequest('מסעדות פתוחות לידי');
      const context = createContext();
      // No userLocation set

      const result = await searchRoute2(request, context);

      // Assertions
      expect(result.results).toHaveLength(0);
      expect(result.assist).toBeDefined();
      expect(result.assist?.type).toBe('clarify');
      expect(result.assist?.message).toContain('מיקום');
      expect(result.meta.failureReason).toBe('LOCATION_REQUIRED');
      expect(result.meta.source).toBe('route2_near_me_clarify');
    });

    it('should return CLARIFY for "ממני" without userLocation', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');

      const request = createRequest('פיצה קרוב ממני');
      const context = createContext();

      const result = await searchRoute2(request, context);

      expect(result.results).toHaveLength(0);
      expect(result.assist?.type).toBe('clarify');
      expect(result.meta.failureReason).toBe('LOCATION_REQUIRED');
    });

    it('should return CLARIFY for "near me" without userLocation', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');

      const request = createRequest('pizza near me');
      const context = createContext();

      const result = await searchRoute2(request, context);

      expect(result.results).toHaveLength(0);
      expect(result.assist?.type).toBe('clarify');
      expect(result.meta.failureReason).toBe('LOCATION_REQUIRED');
    });

    it('should return CLARIFY for "בסביבה" without userLocation', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');

      const request = createRequest('המבורגר בסביבה');
      const context = createContext();

      const result = await searchRoute2(request, context);

      expect(result.results).toHaveLength(0);
      expect(result.assist?.type).toBe('clarify');
      expect(result.meta.failureReason).toBe('LOCATION_REQUIRED');
    });

    it('should NOT call Google Maps stage when returning CLARIFY', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');
      const { executeGoogleMapsStage } = await import('../stages/google-maps.stage.js');

      const request = createRequest('מסעדות לידי');
      const context = createContext();

      await searchRoute2(request, context);

      // Google Maps stage should NOT be called
      expect(executeGoogleMapsStage).not.toHaveBeenCalled();
    });
  });

  describe('CASE 2: Near-me WITH location → Force NEARBY', () => {
    it('should force NEARBY route for "לידי" when userLocation exists', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');
      const { executeIntentStage } = await import('../stages/intent/intent.stage.js');
      const { executeRouteLLM } = await import('../stages/route-llm/route-llm.dispatcher.js');

      // Mock intent to return TEXTSEARCH initially
      (executeIntentStage as jest.Mock).mockResolvedValueOnce({
        route: 'TEXTSEARCH',
        region: 'IL',
        language: 'he',
        confidence: 0.8,
        reason: 'text_search_detected'
      });

      // Mock route-llm to return nearby params after override
      (executeRouteLLM as jest.Mock).mockResolvedValueOnce({
        providerMethod: 'nearbySearch',
        region: 'IL',
        language: 'he',
        lat: 32.0853,
        lng: 34.7818,
        radius: 2000,
        categoryHint: 'restaurant'
      });

      const request = createRequest('מסעדות לידי', { lat: 32.0853, lng: 34.7818 });
      const context = {
        ...createContext(),
        userLocation: { lat: 32.0853, lng: 34.7818 }
      };

      // Mock Google Maps to return results
      const { executeGoogleMapsStage } = await import('../stages/google-maps.stage.js');
      (executeGoogleMapsStage as jest.Mock).mockResolvedValueOnce({
        results: [
          { id: 'place1', name: 'Restaurant 1' },
          { id: 'place2', name: 'Restaurant 2' }
        ]
      });

      const result = await searchRoute2(request, context);

      // Should have results (not CLARIFY)
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.meta.failureReason).toBe('NONE');

      // Should have overridden to NEARBY
      expect(executeRouteLLM).toHaveBeenCalledWith(
        expect.objectContaining({
          route: 'NEARBY',
          reason: 'near_me_keyword_override'
        }),
        expect.anything(),
        expect.anything()
      );
    });

    it('should keep NEARBY route if LLM already selected it', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');
      const { executeIntentStage } = await import('../stages/intent/intent.stage.js');

      // Mock intent to return NEARBY
      (executeIntentStage as jest.Mock).mockResolvedValueOnce({
        route: 'NEARBY',
        region: 'IL',
        language: 'he',
        confidence: 0.9,
        reason: 'nearby_detected'
      });

      const request = createRequest('מסעדות קרוב אליי', { lat: 32.0853, lng: 34.7818 });
      const context = {
        ...createContext(),
        userLocation: { lat: 32.0853, lng: 34.7818 }
      };

      // Should not throw or fail
      await expect(searchRoute2(request, context)).resolves.toBeDefined();
    });
  });

  describe('CASE 3: NON near-me queries (no change)', () => {
    it('should NOT affect queries without near-me keywords', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');

      const request = createRequest('מסעדות בתל אביב');
      const context = createContext();

      // Mock Google Maps to return results
      const { executeGoogleMapsStage } = await import('../stages/google-maps.stage.js');
      (executeGoogleMapsStage as jest.Mock).mockResolvedValueOnce({
        results: [{ id: 'place1', name: 'Restaurant 1' }]
      });

      const result = await searchRoute2(request, context);

      // Should proceed normally (no CLARIFY)
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.assist?.type).not.toBe('clarify');
      expect(result.meta.failureReason).toBe('NONE');
    });

    it('should allow TEXTSEARCH without location for city-based queries', async () => {
      const { searchRoute2 } = await import('../route2.orchestrator.js');

      const request = createRequest('פיצה ברעננה');
      const context = createContext();
      // No userLocation (should be OK for city-based)

      const { executeGoogleMapsStage } = await import('../stages/google-maps.stage.js');
      (executeGoogleMapsStage as jest.Mock).mockResolvedValueOnce({
        results: [{ id: 'place1', name: 'Pizza Place' }]
      });

      const result = await searchRoute2(request, context);

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.meta.failureReason).not.toBe('LOCATION_REQUIRED');
    });
  });
});
