/**
 * Unified Search Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { UnifiedSearchService } from './unified-search.service';
import { SearchApiClient } from '../api/search.api';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { AnalyticsService } from './analytics.service';
import type { SearchResponse } from '../domain/types/search.types';

describe('UnifiedSearchService', () => {
  let service: UnifiedSearchService;
  let apiClient: jasmine.SpyObj<SearchApiClient>;
  let searchStore: SearchStore;
  let sessionStore: SessionStore;
  let analyticsService: jasmine.SpyObj<AnalyticsService>;

  beforeEach(() => {
    const apiSpy = jasmine.createSpyObj('SearchApiClient', ['search']);
    const analyticsSpy = jasmine.createSpyObj('AnalyticsService', ['track', 'trackTiming', 'trackError']);

    sessionStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        UnifiedSearchService,
        SearchStore,
        SessionStore,
        { provide: SearchApiClient, useValue: apiSpy },
        { provide: AnalyticsService, useValue: analyticsSpy }
      ]
    });

    service = TestBed.inject(UnifiedSearchService);
    apiClient = TestBed.inject(SearchApiClient) as jasmine.SpyObj<SearchApiClient>;
    searchStore = TestBed.inject(SearchStore);
    sessionStore = TestBed.inject(SessionStore);
    analyticsService = TestBed.inject(AnalyticsService) as jasmine.SpyObj<AnalyticsService>;
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should update store on search', (done) => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [
        {
          id: '1',
          placeId: 'place-1',
          name: 'Pizza Place',
          address: '123 Main St',
          location: { lat: 48.8566, lng: 2.3522 }
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

    apiClient.search.and.returnValue(of(mockResponse));

    expect(searchStore.loading()).toBe(false);

    service.search('pizza').subscribe({
      next: (response) => {
        expect(searchStore.query()).toBe('pizza');
        expect(searchStore.loading()).toBe(false);
        expect(searchStore.response()).toEqual(mockResponse);
        expect(searchStore.results().length).toBe(1);
        done();
      }
    });

    // Loading should be set immediately
    expect(searchStore.loading()).toBe(true);
  });

  it('should track analytics events on success', (done) => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    apiClient.search.and.returnValue(of(mockResponse));

    service.search('pizza').subscribe({
      next: () => {
        expect(analyticsService.track).toHaveBeenCalledWith('search_submitted', {
          query: 'pizza',
          filters: undefined
        });
        expect(analyticsService.track).toHaveBeenCalledWith('results_rendered', jasmine.objectContaining({
          count: 0,
          confidence: 0.9,
          mode: 'textsearch'
        }));
        expect(analyticsService.trackTiming).toHaveBeenCalledWith(
          'search_duration',
          jasmine.any(Number),
          jasmine.objectContaining({ query: 'pizza' })
        );
        done();
      }
    });
  });

  it('should handle errors and update store', (done) => {
    const error = new Error('Search failed');
    apiClient.search.and.returnValue(throwError(() => error));

    service.search('pizza').subscribe({
      error: () => {
        expect(searchStore.loading()).toBe(false);
        expect(searchStore.error()).toBe('Search failed');
        expect(analyticsService.track).toHaveBeenCalledWith('search_failed', jasmine.objectContaining({
          error: 'Search failed',
          query: 'pizza'
        }));
        expect(analyticsService.trackError).toHaveBeenCalledWith(error, jasmine.any(Object));
        done();
      }
    });
  });

  it('should add query to recent searches', (done) => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    apiClient.search.and.returnValue(of(mockResponse));

    expect(sessionStore.preferences().recentSearches).not.toContain('pizza');

    service.search('pizza').subscribe({
      next: () => {
        expect(sessionStore.preferences().recentSearches).toContain('pizza');
        done();
      }
    });
  });

  it('should include session data in request', (done) => {
    sessionStore.setLocale('fr');
    sessionStore.setRegion('FR');

    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'fr' },
      results: [],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    apiClient.search.and.returnValue(of(mockResponse));

    service.search('pizza').subscribe({
      next: () => {
        const request = apiClient.search.calls.mostRecent().args[0];
        expect(request.locale).toBe('fr');
        expect(request.region).toBe('FR');
        expect(request.sessionId).toBe(sessionStore.conversationId());
        done();
      }
    });
  });

  it('should retry last search', (done) => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    apiClient.search.and.returnValue(of(mockResponse));

    // First search
    service.search('pizza').subscribe(() => {
      // Retry
      const retry$ = service.retryLastSearch();
      expect(retry$).not.toBeNull();

      retry$!.subscribe({
        next: () => {
          expect(apiClient.search).toHaveBeenCalledTimes(2);
          done();
        }
      });
    });
  });

  it('should return null when retrying with no previous search', () => {
    const retry$ = service.retryLastSearch();
    expect(retry$).toBeNull();
  });
});

