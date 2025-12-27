/**
 * Unified Search Integration Tests
 * Tests full flow from search to action execution
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { SearchStore } from '../state/search.store';
import { ActionsStore } from '../state/actions.store';
import { SessionStore } from '../state/session.store';
import { UnifiedSearchService } from '../services/unified-search.service';
import { ActionService } from '../services/action.service';
import { AnalyticsService } from '../services/analytics.service';
import type { SearchResponse, Restaurant } from '../domain/types/search.types';

describe('Unified Search Integration', () => {
  let searchService: UnifiedSearchService;
  let actionService: ActionService;
  let searchStore: SearchStore;
  let actionsStore: ActionsStore;
  let sessionStore: SessionStore;
  let httpMock: HttpTestingController;

  const mockRestaurant: Restaurant = {
    id: 'restaurant-1',
    placeId: 'place-1',
    name: 'Test Pizza Place',
    address: '123 Main St, Paris',
    location: { lat: 48.8566, lng: 2.3522 },
    rating: 4.5,
    userRatingsTotal: 250,
    phoneNumber: '+33123456789',
    website: 'https://example.com'
  };

  const mockSearchResponse: SearchResponse = {
    sessionId: 'test-session',
    query: {
      original: 'pizza in Paris',
      parsed: {},
      language: 'en'
    },
    results: [mockRestaurant],
    chips: [
      { id: 'chip-1', emoji: '💰', label: 'Budget', action: 'filter', filter: 'price<=2' }
    ],
    proposedActions: {
      perResult: [
        { id: 'directions', type: 'GET_DIRECTIONS', level: 0, label: 'Directions', icon: '📍', enabled: true },
        { id: 'save', type: 'SAVE_FAVORITE', level: 1, label: 'Save', icon: '❤️', enabled: true }
      ],
      selectedItem: []
    },
    meta: {
      tookMs: 150,
      mode: 'textsearch',
      appliedFilters: ['opennow'],
      confidence: 0.95,
      source: 'google_places'
    }
  };

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        UnifiedSearchService,
        ActionService,
        AnalyticsService,
        SearchStore,
        ActionsStore,
        SessionStore
      ]
    });

    searchService = TestBed.inject(UnifiedSearchService);
    actionService = TestBed.inject(ActionService);
    searchStore = TestBed.inject(SearchStore);
    actionsStore = TestBed.inject(ActionsStore);
    sessionStore = TestBed.inject(SessionStore);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('should complete full search flow', (done) => {
    // 1. User performs search
    searchService.search('pizza in Paris').subscribe({
      next: (response) => {
        // 2. Verify search results
        expect(response.results.length).toBe(1);
        expect(response.results[0].name).toBe('Test Pizza Place');

        // 3. Verify store is updated
        expect(searchStore.query()).toBe('pizza in Paris');
        expect(searchStore.results().length).toBe(1);
        expect(searchStore.loading()).toBe(false);
        expect(searchStore.hasResults()).toBe(true);

        // 4. Verify session updated with recent search
        expect(sessionStore.preferences().recentSearches).toContain('pizza in Paris');

        done();
      }
    });

    // Mock API response
    const req = httpMock.expectOne('/api/search');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.query).toBe('pizza in Paris');
    req.flush(mockSearchResponse);

    // Mock analytics requests (fire and forget)
    httpMock.match('/api/analytics/events');
  });

  it('should complete L0 action flow (immediate execution)', (done) => {
    // 1. Propose L0 action (GET_DIRECTIONS)
    actionService.proposeAction('GET_DIRECTIONS', 0, mockRestaurant).subscribe({
      next: (proposal) => {
        // 2. Verify action executed immediately
        expect(proposal.status).toBe('EXECUTED');
        expect(proposal.level).toBe(0);

        // 3. Verify it moved to executed list
        expect(actionsStore.executed().length).toBe(1);
        expect(actionsStore.executed()[0].type).toBe('GET_DIRECTIONS');

        done();
      }
    });

    // Mock analytics requests
    httpMock.match('/api/analytics/events');
  });

  it('should complete L1 action flow (requires approval)', (done) => {
    let proposalId: string;

    // 1. Propose L1 action (SAVE_FAVORITE)
    actionService.proposeAction('SAVE_FAVORITE', 1, mockRestaurant).subscribe({
      next: (proposal) => {
        // 2. Verify action is pending
        expect(proposal.status).toBe('PENDING');
        expect(proposal.level).toBe(1);
        proposalId = proposal.id;

        // 3. Verify it's in pending list
        expect(actionsStore.pending().length).toBe(1);
        expect(actionsStore.pending()[0].type).toBe('SAVE_FAVORITE');

        // 4. User approves the action
        actionService.approveAction(proposalId).subscribe({
          next: (result) => {
            // 5. Verify execution was successful
            expect(result.success).toBe(true);

            // 6. Verify action moved to executed
            expect(actionsStore.pending().length).toBe(0);
            expect(actionsStore.executed().length).toBe(1);

            // 7. Verify favorite was saved
            expect(sessionStore.preferences().savedFavorites).toContain(mockRestaurant.id);

            done();
          }
        });
      }
    });

    // Mock analytics requests
    httpMock.match('/api/analytics/events');
  });

  it('should handle search error gracefully', (done) => {
    searchService.search('invalid query').subscribe({
      error: (error) => {
        // Verify error is set in store
        expect(searchStore.error()).toBeTruthy();
        expect(searchStore.loading()).toBe(false);
        done();
      }
    });

    // Mock error response
    const req = httpMock.expectOne('/api/search');
    req.flush({ error: 'Search failed' }, { status: 500, statusText: 'Server Error' });

    // Mock analytics requests
    httpMock.match('/api/analytics/events');
  });

  it('should maintain session state across searches', (done) => {
    const sessionId = sessionStore.conversationId();

    // First search
    searchService.search('pizza').subscribe(() => {
      // Second search
      searchService.search('sushi').subscribe(() => {
        // Session ID should remain the same
        expect(sessionStore.conversationId()).toBe(sessionId);

        // Recent searches should contain both
        const recentSearches = sessionStore.preferences().recentSearches;
        expect(recentSearches).toContain('pizza');
        expect(recentSearches).toContain('sushi');

        done();
      });

      const req2 = httpMock.expectOne('/api/search');
      req2.flush({
        ...mockSearchResponse,
        query: { original: 'sushi', parsed: {}, language: 'en' }
      });
    });

    const req1 = httpMock.expectOne('/api/search');
    req1.flush(mockSearchResponse);

    // Mock analytics requests
    httpMock.match('/api/analytics/events');
  });

  it('should handle proposed actions from backend response', (done) => {
    searchService.search('pizza').subscribe((response) => {
      // Verify proposed actions are returned
      expect(response.proposedActions).toBeDefined();
      expect(response.proposedActions?.perResult.length).toBeGreaterThan(0);
      expect(response.proposedActions?.perResult[0].type).toBe('GET_DIRECTIONS');

      // Verify store contains proposed actions
      expect(searchStore.proposedActions()).toBeDefined();

      done();
    });

    const req = httpMock.expectOne('/api/search');
    req.flush(mockSearchResponse);

    // Mock analytics requests
    httpMock.match('/api/analytics/events');
  });
});








