/**
 * Search Facade Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { of, throwError } from 'rxjs';
import { SearchFacade } from './search.facade';
import { UnifiedSearchService } from '../services/unified-search.service';
import { ActionService } from '../services/action.service';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { ActionsStore } from '../state/actions.store';
import type { SearchResponse, Restaurant } from '../domain/types/search.types';

describe('SearchFacade', () => {
  let facade: SearchFacade;
  let searchService: jasmine.SpyObj<UnifiedSearchService>;
  let actionService: jasmine.SpyObj<ActionService>;
  let searchStore: SearchStore;
  let sessionStore: SessionStore;

  const mockRestaurant: Restaurant = {
    id: '1',
    placeId: 'place-1',
    name: 'Test Restaurant',
    address: '123 Main St',
    location: { lat: 48.8566, lng: 2.3522 }
  };

  beforeEach(() => {
    const searchServiceSpy = jasmine.createSpyObj('UnifiedSearchService', ['search', 'retryLastSearch']);
    const actionServiceSpy = jasmine.createSpyObj('ActionService', ['proposeAction', 'approveAction', 'rejectAction', 'cleanupExpired']);

    sessionStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        SearchFacade,
        SearchStore,
        SessionStore,
        ActionsStore,
        { provide: UnifiedSearchService, useValue: searchServiceSpy },
        { provide: ActionService, useValue: actionServiceSpy }
      ]
    });

    facade = TestBed.inject(SearchFacade);
    searchService = TestBed.inject(UnifiedSearchService) as jasmine.SpyObj<UnifiedSearchService>;
    actionService = TestBed.inject(ActionService) as jasmine.SpyObj<ActionService>;
    searchStore = TestBed.inject(SearchStore);
    sessionStore = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(facade).toBeTruthy();
  });

  it('should expose store signals', () => {
    expect(facade.loading).toBeDefined();
    expect(facade.error).toBeDefined();
    expect(facade.results).toBeDefined();
    expect(facade.chips).toBeDefined();
    expect(facade.selectedRestaurant).toBeDefined();
    expect(facade.pendingActions).toBeDefined();
  });

  it('should delegate search to service', () => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [mockRestaurant],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    searchService.search.and.returnValue(of(mockResponse));

    facade.search('pizza');

    expect(searchService.search).toHaveBeenCalledWith('pizza', undefined);
  });

  it('should handle search errors gracefully', () => {
    spyOn(console, 'error');
    searchService.search.and.returnValue(throwError(() => new Error('Search failed')));

    facade.search('pizza');

    expect(console.error).toHaveBeenCalled();
  });

  it('should retry last search', () => {
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

    searchService.retryLastSearch.and.returnValue(of(mockResponse));

    facade.retry();

    expect(searchService.retryLastSearch).toHaveBeenCalled();
  });

  it('should handle retry when no previous search', () => {
    searchService.retryLastSearch.and.returnValue(null);

    facade.retry();

    expect(searchService.retryLastSearch).toHaveBeenCalled();
  });

  it('should select restaurant', () => {
    facade.selectRestaurant(mockRestaurant);

    expect(facade.selectedRestaurant()).toEqual(mockRestaurant);
  });

  it('should propose action', () => {
    actionService.proposeAction.and.returnValue(of({
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: mockRestaurant,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    }));

    facade.proposeAction('SAVE_FAVORITE', 1, mockRestaurant);

    expect(actionService.proposeAction).toHaveBeenCalledWith('SAVE_FAVORITE', 1, mockRestaurant);
  });

  it('should approve action', () => {
    actionService.approveAction.and.returnValue(of({
      success: true,
      message: 'Approved'
    }));

    facade.approveAction('action-1');

    expect(actionService.approveAction).toHaveBeenCalledWith('action-1');
  });

  it('should reject action', () => {
    facade.rejectAction('action-1');

    expect(actionService.rejectAction).toHaveBeenCalledWith('action-1');
  });

  it('should reset search store', () => {
    searchStore.setQuery('pizza');
    searchStore.setLoading(true);

    facade.reset();

    expect(searchStore.query()).toBe('');
    expect(searchStore.loading()).toBe(false);
  });

  it('should set locale', () => {
    facade.setLocale('fr');

    expect(sessionStore.locale()).toBe('fr');
  });

  it('should set region', () => {
    facade.setRegion('FR');

    expect(sessionStore.region()).toBe('FR');
  });

  it('should cleanup expired actions', () => {
    facade.cleanupExpiredActions();

    expect(actionService.cleanupExpired).toHaveBeenCalled();
  });

  it('should handle chip click', () => {
    spyOn(console, 'log');

    searchStore.setResponse({
      sessionId: 'test-session',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [],
      chips: [
        { id: 'chip-1', emoji: '💰', label: 'Budget', action: 'filter', filter: 'price<=2' }
      ],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    });

    facade.onChipClick('chip-1');

    expect(console.log).toHaveBeenCalled();
  });

  it('should search on assist action click', () => {
    const mockResponse: SearchResponse = {
      sessionId: 'test-session',
      query: { original: 'italian', parsed: {}, language: 'en' },
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

    searchService.search.and.returnValue(of(mockResponse));

    facade.onAssistActionClick('italian restaurant');

    expect(searchService.search).toHaveBeenCalledWith('italian restaurant', undefined);
  });
});









