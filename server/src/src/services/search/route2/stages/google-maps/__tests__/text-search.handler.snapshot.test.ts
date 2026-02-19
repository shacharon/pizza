/**
 * Snapshot regression test for text-search.handler
 * Ensures refactored handler produces identical output to original
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeTextSearch } from '../text-search.handler.js';
import type { RouteLLMMapping, Route2Context } from '../../../types.js';

// Mock all dependencies
vi.mock('../../../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../cache-manager.js', () => ({
  getCacheService: vi.fn(() => null), // No cache for simplicity
  raceWithCleanup: vi.fn((promise) => promise)
}));

vi.mock('../result-mapper.js', () => ({
  mapGooglePlaceToResult: vi.fn((place) => place) // Identity mapper
}));

vi.mock('../../../../../../utils/fetch-with-timeout.js', () => ({
  fetchWithTimeout: vi.fn()
}));

vi.mock('../textsearch/geocoding-service.js', () => ({
  geocodeCity: vi.fn()
}));

describe('executeTextSearch - Snapshot Regression Test', () => {
  let fetchWithTimeout: any;
  let geocodeCity: any;

  beforeEach(async () => {
    const fetchModule = await import('../../../../../../utils/fetch-with-timeout.js');
    const geocodingModule = await import('../textsearch/geocoding-service.js');
    fetchWithTimeout = fetchModule.fetchWithTimeout;
    geocodeCity = geocodingModule.geocodeCity;
    vi.clearAllMocks();
    process.env.GOOGLE_API_KEY = 'test-api-key';
  });

  it('should produce expected output structure for successful search', async () => {
    // Mock Google Places API response
    const mockPlacesResponse = {
      ok: true,
      json: async () => ({
        places: [
          {
            id: 'place-1',
            displayName: { text: 'Restaurant A' },
            formattedAddress: '123 Main St',
            location: { latitude: 32.0853, longitude: 34.7818 }
          },
          {
            id: 'place-2',
            displayName: { text: 'Restaurant B' },
            formattedAddress: '456 Oak Ave',
            location: { latitude: 32.0900, longitude: 34.7850 }
          }
        ]
      })
    };

    (fetchWithTimeout as any).mockResolvedValue(mockPlacesResponse);

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      textQuery: 'pizza in tel aviv',
      language: 'en',
      region: 'IL',
      bias: null,
      cityText: null
    };

    const ctx: Route2Context = {
      requestId: 'snapshot-req-123',
      startTime: Date.now()
    };

    const result = await executeTextSearch(mapping, ctx);

    // Snapshot: verify output structure
    expect(result).toMatchObject({
      results: expect.any(Array),
      servedFrom: 'google_api'
    });

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toHaveProperty('id', 'place-1');
    expect(result.results[1]).toHaveProperty('id', 'place-2');
  });

  it('should geocode city when cityText provided and no bias', async () => {
    // Mock geocoding
    (geocodeCity as any).mockResolvedValue({ lat: 32.0853, lng: 34.7818 });

    // Mock Places API
    const mockPlacesResponse = {
      ok: true,
      json: async () => ({
        places: [
          { id: 'place-1', displayName: { text: 'Restaurant' } }
        ]
      })
    };

    (fetchWithTimeout as any).mockResolvedValue(mockPlacesResponse);

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      textQuery: 'pizza',
      language: 'he',
      region: 'IL',
      bias: null,
      cityText: 'תל אביב'
    };

    const ctx: Route2Context = {
      requestId: 'geocode-req-456',
      startTime: Date.now()
    };

    const result = await executeTextSearch(mapping, ctx);

    // Verify geocodeCity was called
    expect(geocodeCity).toHaveBeenCalledWith('תל אביב', 'IL', 'test-api-key', 'geocode-req-456');

    // Verify results returned
    expect(result.results).toHaveLength(1);
    expect(result.servedFrom).toBe('google_api');
  });

  it('should retry with bias removed when low results', async () => {
    // First call: 1 result (low)
    const mockFirstResponse = {
      ok: true,
      json: async () => ({
        places: [
          { id: 'place-1', displayName: { text: 'Restaurant' } }
        ]
      })
    };

    // Second call (retry without bias): 3 results
    const mockRetryResponse = {
      ok: true,
      json: async () => ({
        places: [
          { id: 'place-1', displayName: { text: 'Restaurant' } },
          { id: 'place-2', displayName: { text: 'Cafe' } },
          { id: 'place-3', displayName: { text: 'Bistro' } }
        ]
      })
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce(mockFirstResponse)
      .mockResolvedValueOnce(mockRetryResponse);

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      textQuery: 'pizza',
      language: 'en',
      region: 'IL',
      bias: {
        type: 'locationBias',
        center: { lat: 32.0853, lng: 34.7818 },
        radiusMeters: 5000
      },
      cityText: null
    };

    const ctx: Route2Context = {
      requestId: 'retry-req-789',
      startTime: Date.now()
    };

    const result = await executeTextSearch(mapping, ctx);

    // Verify retry logic: should use retry results (3 > 1)
    expect(result.results).toHaveLength(3);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('should return empty results when API key missing', async () => {
    delete process.env.GOOGLE_API_KEY;

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      textQuery: 'pizza',
      language: 'en',
      region: 'IL',
      bias: null,
      cityText: null
    };

    const ctx: Route2Context = {
      requestId: 'no-key-req',
      startTime: Date.now()
    };

    const result = await executeTextSearch(mapping, ctx);

    expect(result).toEqual({
      results: [],
      servedFrom: 'google_api'
    });

    // Restore for other tests
    process.env.GOOGLE_API_KEY = 'test-api-key';
  });

  it('should handle pagination (multiple pages)', async () => {
    // First page: 2 results + nextPageToken
    const mockFirstPage = {
      ok: true,
      json: async () => ({
        places: [
          { id: 'place-1', displayName: { text: 'R1' } },
          { id: 'place-2', displayName: { text: 'R2' } }
        ],
        nextPageToken: 'token-123'
      })
    };

    // Second page: 2 more results
    const mockSecondPage = {
      ok: true,
      json: async () => ({
        places: [
          { id: 'place-3', displayName: { text: 'R3' } },
          { id: 'place-4', displayName: { text: 'R4' } }
        ]
      })
    };

    (fetchWithTimeout as any)
      .mockResolvedValueOnce(mockFirstPage)
      .mockResolvedValueOnce(mockSecondPage);

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      textQuery: 'restaurants',
      language: 'en',
      region: 'IL',
      bias: null,
      cityText: null
    };

    const ctx: Route2Context = {
      requestId: 'pagination-req',
      startTime: Date.now()
    };

    const result = await executeTextSearch(mapping, ctx);

    // Verify pagination: should fetch both pages
    expect(result.results).toHaveLength(4);
    expect(fetchWithTimeout).toHaveBeenCalledTimes(2);
  });

  it('should preserve exact log structure (spot check)', async () => {
    const loggerModule = await import('../../../../../../lib/logger/structured-logger.js');
    const logger = loggerModule.logger;

    const mockResponse = {
      ok: true,
      json: async () => ({ places: [] })
    };

    (fetchWithTimeout as any).mockResolvedValue(mockResponse);

    const mapping: Extract<RouteLLMMapping, { providerMethod: 'textSearch' }> = {
      providerMethod: 'textSearch',
      textQuery: 'test',
      language: 'en',
      region: 'IL',
      bias: null,
      cityText: null
    };

    const ctx: Route2Context = {
      requestId: 'log-check',
      startTime: Date.now()
    };

    await executeTextSearch(mapping, ctx);

    // Verify key log events are emitted
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'log-check',
        provider: 'google_places_new',
        method: 'searchText'
      }),
      expect.stringContaining('[GOOGLE] Calling Text Search API')
    );

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: 'log-check',
        provider: 'google_places_new',
        resultCount: 0,
        servedFrom: 'google_api'
      }),
      expect.stringContaining('[GOOGLE] Text Search completed')
    );
  });
});
