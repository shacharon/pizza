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
});


