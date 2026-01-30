/**
 * Client-Side Pagination Tests
 * Tests for "Show 5 more" button and visible results logic
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from '../search-page.component';
import { SearchFacade } from '../../../../facades/search.facade';
import { LocationService } from '../../../../services/location.service';
import type { SearchResponse, Restaurant } from '../../../../domain/types/search.types';

describe('SearchPage - Client-Side Pagination', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let mockFacade: jasmine.SpyObj<SearchFacade>;

  beforeEach(async () => {
    // Create mock facade
    mockFacade = jasmine.createSpyObj('SearchFacade', [
      'search',
      'onClear',
      'onInput',
      'onSelectRecent',
      'clearRecentSearches',
      'selectRestaurant',
      'proposeAction',
      'onChipClick',
      'cleanupExpiredActions',
      'approveAction',
      'rejectAction',
      'retry',
      'onClarificationChoice',
      'onAssistActionClick'
    ], {
      // Signals
      loading: jasmine.createSpy('loading').and.returnValue(false),
      error: jasmine.createSpy('error').and.returnValue(null),
      currentQuery: jasmine.createSpy('currentQuery').and.returnValue(''),
      results: jasmine.createSpy('results').and.returnValue([]),
      chips: jasmine.createSpy('chips').and.returnValue([]),
      meta: jasmine.createSpy('meta').and.returnValue(null),
      hasResults: jasmine.createSpy('hasResults').and.returnValue(false),
      isStopped: jasmine.createSpy('isStopped').and.returnValue(false),
      assistantState: jasmine.createSpy('assistantState').and.returnValue('idle'),
      assistantError: jasmine.createSpy('assistantError').and.returnValue(null),
      assistantNarration: jasmine.createSpy('assistantNarration').and.returnValue(''),
      assistantMessages: jasmine.createSpy('assistantMessages').and.returnValue([]),
      assistantCardMessages: jasmine.createSpy('assistantCardMessages').and.returnValue([]),
      assistantMessageRequestId: jasmine.createSpy('assistantMessageRequestId').and.returnValue(null),
      recommendations: jasmine.createSpy('recommendations').and.returnValue([]),
      requestId: jasmine.createSpy('requestId').and.returnValue(null),
      selectedRestaurant: jasmine.createSpy('selectedRestaurant').and.returnValue(null),
      pendingActions: jasmine.createSpy('pendingActions').and.returnValue([]),
      executedActions: jasmine.createSpy('executedActions').and.returnValue([]),
      conversationId: jasmine.createSpy('conversationId').and.returnValue('conv-123'),
      locale: jasmine.createSpy('locale').and.returnValue('en'),
      groups: jasmine.createSpy('groups').and.returnValue(undefined),
      hasGroups: jasmine.createSpy('hasGroups').and.returnValue(false),
      currentSort: jasmine.createSpy('currentSort').and.returnValue('rank'),
      activeFilters: jasmine.createSpy('activeFilters').and.returnValue([]),
      currentView: jasmine.createSpy('currentView').and.returnValue('LIST'),
      cardState: jasmine.createSpy('cardState').and.returnValue('IDLE'),
      clarification: jasmine.createSpy('clarification').and.returnValue(null),
      requiresClarification: jasmine.createSpy('requiresClarification').and.returnValue(false),
      showRecentSearches: jasmine.createSpy('showRecentSearches').and.returnValue(false),
      hasRecentSearches: jasmine.createSpy('hasRecentSearches').and.returnValue(false),
      recentSearchesList: jasmine.createSpy('recentSearchesList').and.returnValue([])
    });

    const mockLocationService = jasmine.createSpyObj('LocationService', ['requestLocation', 'disableLocation'], {
      state: jasmine.createSpy('state').and.returnValue('OFF'),
      location: jasmine.createSpy('location').and.returnValue(null)
    });

    await TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [
        { provide: SearchFacade, useValue: mockFacade },
        { provide: LocationService, useValue: mockLocationService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
  });

  // Helper: Generate mock restaurants
  const generateMockRestaurants = (count: number): Restaurant[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `rest-${i + 1}`,
      placeId: `place-${i + 1}`,
      name: `Restaurant ${i + 1}`,
      address: `Address ${i + 1}`,
      location: { lat: 32.0, lng: 34.0 },
      rating: 4.0,
      userRatingsTotal: 100,
      priceLevel: 2,
      openNow: true,
      rank: i + 1
    }));
  };

  describe('Initial Display Limit', () => {
    it('should show 12 results initially when 20 results are returned', () => {
      // Arrange: 20 results from backend
      const mockResults = generateMockRestaurants(20);
      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults);

      // Create response signal for component
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // Assert: Only 12 visible initially
      expect(component.visibleResults().length).toBe(12);
      expect(component.fetchedCount()).toBe(20);
      expect(component.canShowMore()).toBe(true);
    });

    it('should show all results if less than 12 are returned', () => {
      // Arrange: 8 results from backend
      const mockResults = generateMockRestaurants(8);
      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // Assert: All 8 visible, no "Show more" button
      expect(component.visibleResults().length).toBe(8);
      expect(component.fetchedCount()).toBe(8);
      expect(component.canShowMore()).toBe(false);
    });
  });

  describe('Show 5 More Functionality', () => {
    it('should increase visible count by 5 when loadMore is called', () => {
      // Arrange: 20 results
      const mockResults = generateMockRestaurants(20);
      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // Initial state: 12 visible
      expect(component.visibleResults().length).toBe(12);

      // Act: Click "Show 5 more"
      component.loadMore();
      fixture.detectChanges();

      // Assert: Now 17 visible
      expect(component.visibleResults().length).toBe(17);
      expect(component.canShowMore()).toBe(true);
    });

    it('should show all remaining results when clicking "Show 5 more" near the end', () => {
      // Arrange: 15 results (12 initial + 3 remaining)
      const mockResults = generateMockRestaurants(15);
      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // Initial: 12 visible
      expect(component.visibleResults().length).toBe(12);

      // Act: Click "Show 5 more" (but only 3 remain)
      component.loadMore();
      fixture.detectChanges();

      // Assert: All 15 visible, no more to show
      expect(component.visibleResults().length).toBe(15);
      expect(component.canShowMore()).toBe(false);
    });

    it('should preserve backend ordering when paginating', () => {
      // Arrange: 20 results with specific order
      const mockResults = generateMockRestaurants(20);
      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // Initial: First 12 in order
      const initial = component.visibleResults();
      expect(initial[0].id).toBe('rest-1');
      expect(initial[11].id).toBe('rest-12');

      // Act: Show more
      component.loadMore();
      fixture.detectChanges();

      // Assert: Next 5 in order
      const afterMore = component.visibleResults();
      expect(afterMore[12].id).toBe('rest-13');
      expect(afterMore[16].id).toBe('rest-17');
    });
  });

  describe('Reset on New Search', () => {
    it('should reset display limit to 12 on new search', () => {
      // Arrange: Initial search with 20 results
      const mockResults1 = generateMockRestaurants(20);
      const mockResponse1: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults1,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults1);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse1);

      fixture.detectChanges();

      // User clicks "Show 5 more" twice
      component.loadMore();
      component.loadMore();
      fixture.detectChanges();

      // Now showing 22 (would be more than fetched, so capped at 20)
      expect(component.visibleResults().length).toBe(20);

      // Act: New search
      component.onSearch('burger');

      // Assert: Display limit reset to 12
      // (Actual results would change via facade, but limit resets)
      const mockResults2 = generateMockRestaurants(15);
      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults2);
      const mockResponse2 = { ...mockResponse1, results: mockResults2 };
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse2);

      fixture.detectChanges();

      expect(component.visibleResults().length).toBe(12);
    });

    it('should reset display limit to 12 when chip is clicked', () => {
      // Arrange: Search with pagination
      const mockResults = generateMockRestaurants(20);
      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: mockResults,
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue(mockResults);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // User expands to 17
      component.loadMore();
      expect(component.visibleResults().length).toBe(17);

      // Act: Click filter chip
      component.onChipClick('open_now');
      fixture.detectChanges();

      // Assert: Reset to 12 (new filter pool)
      expect(component.visibleResults().length).toBe(12);
    });
  });

  describe('Grouped Results Pagination', () => {
    it('should flatten groups and paginate correctly', () => {
      // Arrange: Results in groups
      const exactResults = generateMockRestaurants(8);
      const nearbyResults = generateMockRestaurants(15).map((r, i) => ({
        ...r,
        id: `nearby-${i + 1}`,
        name: `Nearby ${i + 1}`,
        groupKind: 'NEARBY' as const
      }));

      const mockResponse: SearchResponse = {
        requestId: 'req-123',
        sessionId: 'sess-123',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: [],
        groups: [
          {
            kind: 'EXACT',
            label: 'Exact matches',
            results: exactResults
          },
          {
            kind: 'NEARBY',
            label: 'Nearby',
            results: nearbyResults
          }
        ],
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'search',
          appliedFilters: [],
          confidence: 0.9,
          source: 'places_api'
        }
      };

      (mockFacade.results as jasmine.Spy).and.returnValue([]);
      (mockFacade.groups as jasmine.Spy).and.returnValue(mockResponse.groups);
      (mockFacade.hasGroups as jasmine.Spy).and.returnValue(true);
      (component as any).response = jasmine.createSpy('response').and.returnValue(mockResponse);

      fixture.detectChanges();

      // Assert: Flattened and showing first 12
      expect(component.fetchedCount()).toBe(23); // 8 exact + 15 nearby
      expect(component.visibleResults().length).toBe(12);

      // First 8 should be exact matches
      expect(component.visibleResults()[0].id).toBe('rest-1');
      expect(component.visibleResults()[7].id).toBe('rest-8');

      // Next 4 should be nearby
      expect(component.visibleResults()[8].id).toBe('nearby-1');
      expect(component.visibleResults()[11].id).toBe('nearby-4');
    });
  });
});
