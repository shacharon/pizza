/**
 * Search Store Tests
 */

import { TestBed } from '@angular/core/testing';
import { SearchStore } from './search.store';
import type { SearchResponse } from '../domain/types/search.types';

describe('SearchStore', () => {
  let store: SearchStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SearchStore]
    });
    store = TestBed.inject(SearchStore);
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should have initial state', () => {
    expect(store.query()).toBe('');
    expect(store.loading()).toBe(false);
    expect(store.error()).toBe(null);
    expect(store.response()).toBe(null);
    expect(store.results()).toEqual([]);
    expect(store.hasResults()).toBe(false);
  });

  it('should set query', () => {
    store.setQuery('pizza');
    expect(store.query()).toBe('pizza');
  });

  it('should set loading state', () => {
    store.setLoading(true);
    expect(store.loading()).toBe(true);

    store.setLoading(false);
    expect(store.loading()).toBe(false);
  });

  it('should set error', () => {
    store.setError('Search failed');
    expect(store.error()).toBe('Search failed');

    store.setError(null);
    expect(store.error()).toBe(null);
  });

  it('should set response and compute results', () => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: {
        original: 'pizza',
        parsed: {},
        language: 'en'
      },
      results: [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Pizza Place',
          address: '123 Main St',
          location: { lat: 48.8566, lng: 2.3522 },
          rating: 4.5
        }
      ],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    store.setResponse(mockResponse);

    expect(store.response()).toEqual(mockResponse);
    expect(store.results().length).toBe(1);
    expect(store.results()[0].name).toBe('Pizza Place');
    expect(store.hasResults()).toBe(true);
    expect(store.error()).toBe(null); // Error should be cleared
  });

  it('should compute chips from response', () => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: {
        original: 'pizza',
        parsed: {},
        language: 'en'
      },
      results: [],
      chips: [
        { id: '1', emoji: '💰', label: 'Budget', action: 'filter', filter: 'price<=2' }
      ],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    store.setResponse(mockResponse);

    expect(store.chips().length).toBe(1);
    expect(store.chips()[0].label).toBe('Budget');
  });

  it('should reset store', () => {
    store.setQuery('pizza');
    store.setLoading(true);
    store.setError('error');

    store.reset();

    expect(store.query()).toBe('');
    expect(store.loading()).toBe(false);
    expect(store.error()).toBe(null);
    expect(store.response()).toBe(null);
  });

  describe('Groups Support (Phase B)', () => {
    it('should have undefined groups initially', () => {
      expect(store.groups()).toBeUndefined();
      expect(store.hasGroups()).toBe(false);
    });

    it('should compute groups from response', () => {
      const mockResponse: SearchResponse = {
        sessionId: 'test-session',
        query: {
          original: 'איטלקית ברחוב אלנבי',
          parsed: {},
          language: 'he'
        },
        results: [
          { id: '1', placeId: 'place-1', name: 'Restaurant A', address: 'Allenby St', location: { lat: 32.0, lng: 34.0 } },
          { id: '2', placeId: 'place-2', name: 'Restaurant B', address: 'Near Allenby', location: { lat: 32.0, lng: 34.0 } }
        ],
        groups: [
          {
            kind: 'EXACT',
            label: 'אלנבי',
            results: [
              { id: '1', placeId: 'place-1', name: 'Restaurant A', address: 'Allenby St', location: { lat: 32.0, lng: 34.0 } }
            ],
            radiusMeters: 200
          },
          {
            kind: 'NEARBY',
            label: 'באיזור',
            results: [
              { id: '2', placeId: 'place-2', name: 'Restaurant B', address: 'Near Allenby', location: { lat: 32.0, lng: 34.0 } }
            ],
            radiusMeters: 400
          }
        ],
        chips: [],
        meta: {
          tookMs: 1500,
          mode: 'textsearch',
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places',
          streetGrouping: {
            enabled: true,
            streetName: 'אלנבי',
            detectionMethod: 'LLM',
            exactCount: 1,
            nearbyCount: 1,
            exactRadius: 200,
            nearbyRadius: 400
          }
        }
      };

      store.setResponse(mockResponse);

      expect(store.hasGroups()).toBe(true);
      expect(store.groups()?.length).toBe(2);
    });

    it('should compute exactResults', () => {
      const mockResponse: SearchResponse = {
        sessionId: 'test-session',
        query: {
          original: 'איטלקית ברחוב אלנבי',
          parsed: {},
          language: 'he'
        },
        results: [],
        groups: [
          {
            kind: 'EXACT',
            label: 'אלנבי',
            results: [
              { id: '1', placeId: 'place-1', name: 'Restaurant A', address: 'Allenby St', location: { lat: 32.0, lng: 34.0 } },
              { id: '2', placeId: 'place-2', name: 'Restaurant B', address: 'Allenby St', location: { lat: 32.0, lng: 34.0 } }
            ],
            radiusMeters: 200
          }
        ],
        chips: [],
        meta: {
          tookMs: 1500,
          mode: 'textsearch',
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places'
        }
      };

      store.setResponse(mockResponse);

      expect(store.exactResults().length).toBe(2);
      expect(store.exactCount()).toBe(2);
      expect(store.exactResults()[0].name).toBe('Restaurant A');
    });

    it('should compute nearbyResults', () => {
      const mockResponse: SearchResponse = {
        sessionId: 'test-session',
        query: {
          original: 'איטלקית ברחוב אלנבי',
          parsed: {},
          language: 'he'
        },
        results: [],
        groups: [
          {
            kind: 'NEARBY',
            label: 'באיזור',
            results: [
              { id: '3', placeId: 'place-3', name: 'Restaurant C', address: 'Near Allenby', location: { lat: 32.0, lng: 34.0 } }
            ],
            radiusMeters: 400
          }
        ],
        chips: [],
        meta: {
          tookMs: 1500,
          mode: 'textsearch',
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places'
        }
      };

      store.setResponse(mockResponse);

      expect(store.nearbyResults().length).toBe(1);
      expect(store.nearbyCount()).toBe(1);
      expect(store.nearbyResults()[0].name).toBe('Restaurant C');
    });

    it('should return empty arrays when no groups', () => {
      const mockResponse: SearchResponse = {
        sessionId: 'test-session',
        query: {
          original: 'pizza in tel aviv',
          parsed: {},
          language: 'en'
        },
        results: [
          { id: '1', placeId: 'place-1', name: 'Pizza Place', address: '123 Main St', location: { lat: 32.0, lng: 34.0 } }
        ],
        chips: [],
        meta: {
          tookMs: 1500,
          mode: 'textsearch',
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places'
        }
      };

      store.setResponse(mockResponse);

      expect(store.hasGroups()).toBe(false);
      expect(store.exactResults()).toEqual([]);
      expect(store.nearbyResults()).toEqual([]);
      expect(store.exactCount()).toBe(0);
      expect(store.nearbyCount()).toBe(0);
    });

    it('should handle response with only EXACT group', () => {
      const mockResponse: SearchResponse = {
        sessionId: 'test-session',
        query: {
          original: 'איטלקית ברחוב אלנבי',
          parsed: {},
          language: 'he'
        },
        results: [],
        groups: [
          {
            kind: 'EXACT',
            label: 'אלנבי',
            results: [
              { id: '1', placeId: 'place-1', name: 'Restaurant A', address: 'Allenby St', location: { lat: 32.0, lng: 34.0 } }
            ],
            radiusMeters: 200
          }
        ],
        chips: [],
        meta: {
          tookMs: 1500,
          mode: 'textsearch',
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places'
        }
      };

      store.setResponse(mockResponse);

      expect(store.hasGroups()).toBe(true);
      expect(store.exactCount()).toBe(1);
      expect(store.nearbyCount()).toBe(0);
    });
  });
});


