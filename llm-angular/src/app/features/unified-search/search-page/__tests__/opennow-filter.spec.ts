/**
 * Test: OpenNow Filter Correctly Filters Results
 * Proves that "Open now" filter actually removes closed places from display
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from '../search-page.component';
import { SearchFacade } from '../../../../facades/search.facade';
import type { SearchResponse, Restaurant } from '../../../../domain/types/search.types';

describe('SearchPage: OpenNow Filter', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let facade: jasmine.SpyObj<SearchFacade>;

  beforeEach(() => {
    // Create spy facade
    facade = jasmine.createSpyObj('SearchFacade', [
      'search',
      'onClear',
      'onInput',
      'onChipClick',
      'retry'
    ], {
      loading: jasmine.createSpy('loading').and.returnValue(false),
      error: jasmine.createSpy('error').and.returnValue(null),
      query: jasmine.createSpy('query').and.returnValue('pizza'),
      results: jasmine.createSpy('results').and.returnValue([]),
      hasResults: jasmine.createSpy('hasResults').and.returnValue(true),
      hasGroups: jasmine.createSpy('hasGroups').and.returnValue(false),
      response: jasmine.createSpy('response').and.returnValue(null),
      assistantState: jasmine.createSpy('assistantState').and.returnValue('idle'),
      assistantError: jasmine.createSpy('assistantError').and.returnValue(null),
      locale: jasmine.createSpy('locale').and.returnValue('en'),
      selectedRestaurant: jasmine.createSpy('selectedRestaurant').and.returnValue(null),
      pendingActions: jasmine.createSpy('pendingActions').and.returnValue([]),
      showRecentSearches: jasmine.createSpy('showRecentSearches').and.returnValue(false),
      hasRecentSearches: jasmine.createSpy('hasRecentSearches').and.returnValue(false),
      recentSearchesList: jasmine.createSpy('recentSearchesList').and.returnValue([])
    });

    TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [
        { provide: SearchFacade, useValue: facade }
      ]
    });

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
  });

  it('should filter out closed places when open_now is in appliedFilters', () => {
    // Mock response with mixed open/closed places
    const mockResults: Restaurant[] = [
      { id: '1', placeId: 'p1', name: 'Open Place 1', address: '123', location: { lat: 32, lng: 34 }, openNow: true },
      { id: '2', placeId: 'p2', name: 'Closed Place 1', address: '456', location: { lat: 32, lng: 34 }, openNow: false },
      { id: '3', placeId: 'p3', name: 'Open Place 2', address: '789', location: { lat: 32, lng: 34 }, openNow: true },
      { id: '4', placeId: 'p4', name: 'Unknown Place', address: '101', location: { lat: 32, lng: 34 }, openNow: 'UNKNOWN' },
      { id: '5', placeId: 'p5', name: 'Closed Place 2', address: '112', location: { lat: 32, lng: 34 }, openNow: false }
    ];

    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza open now', parsed: {}, language: 'en' },
      results: mockResults,
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: ['open_now'] // OpenNow filter is active
      }
    };

    (facade.results as jasmine.Spy).and.returnValue(mockResults);
    (facade.response as jasmine.Spy).and.returnValue(mockResponse);

    fixture.detectChanges();

    // Verify: Only open places are shown
    const filtered = component.filteredResults();
    expect(filtered.length).toBe(2, 'Should only show 2 open places');
    expect(filtered.every(r => r.openNow === true)).toBe(true, 'All displayed places should be open');
    expect(filtered.map(r => r.name)).toEqual(['Open Place 1', 'Open Place 2']);
  });

  it('should NOT filter places when open_now is NOT in appliedFilters', () => {
    // Mock response with mixed open/closed places, but NO filter applied
    const mockResults: Restaurant[] = [
      { id: '1', placeId: 'p1', name: 'Open Place', address: '123', location: { lat: 32, lng: 34 }, openNow: true },
      { id: '2', placeId: 'p2', name: 'Closed Place', address: '456', location: { lat: 32, lng: 34 }, openNow: false }
    ];

    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: mockResults,
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: [] // NO filter applied
      }
    };

    (facade.results as jasmine.Spy).and.returnValue(mockResults);
    (facade.response as jasmine.Spy).and.returnValue(mockResponse);

    fixture.detectChanges();

    // Verify: All places are shown (no filtering)
    const filtered = component.filteredResults();
    expect(filtered.length).toBe(2, 'Should show all 2 places');
    expect(filtered.map(r => r.name)).toEqual(['Open Place', 'Closed Place']);
  });

  it('should filter flatResults (grouped view) when open_now is active', () => {
    // Mock response with groups containing mixed open/closed places
    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza open now', parsed: {}, language: 'en' },
      results: [],
      groups: [
        {
          kind: 'EXACT',
          title: 'Exact Matches',
          results: [
            { id: '1', placeId: 'p1', name: 'Open 1', address: '123', location: { lat: 32, lng: 34 }, openNow: true },
            { id: '2', placeId: 'p2', name: 'Closed 1', address: '456', location: { lat: 32, lng: 34 }, openNow: false }
          ]
        },
        {
          kind: 'NEARBY',
          title: 'Nearby',
          results: [
            { id: '3', placeId: 'p3', name: 'Open 2', address: '789', location: { lat: 32, lng: 34 }, openNow: true },
            { id: '4', placeId: 'p4', name: 'Closed 2', address: '101', location: { lat: 32, lng: 34 }, openNow: false }
          ]
        }
      ],
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: ['open_now']
      }
    };

    (facade.response as jasmine.Spy).and.returnValue(mockResponse);
    (facade.hasGroups as jasmine.Spy).and.returnValue(true);

    fixture.detectChanges();

    // Verify: Only open places from both groups are shown
    const flat = component.flatResults();
    expect(flat.length).toBe(2, 'Should only show 2 open places from both groups');
    expect(flat.every(r => r.openNow === true)).toBe(true, 'All displayed places should be open');
    expect(flat.map(r => r.name)).toEqual(['Open 1', 'Open 2']);
  });

  it('should show visual indicator when openNow filter is active', () => {
    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza open now', parsed: {}, language: 'en' },
      results: [
        { id: '1', placeId: 'p1', name: 'Open Place', address: '123', location: { lat: 32, lng: 34 }, openNow: true }
      ],
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: ['open_now']
      }
    };

    (facade.results as jasmine.Spy).and.returnValue(mockResponse.results);
    (facade.response as jasmine.Spy).and.returnValue(mockResponse);

    fixture.detectChanges();

    // Verify: Visual indicator is shown
    expect(component.closedFilterActive()).toBe('open');
    
    // Check if filter chip is rendered in template
    const filterChip = fixture.nativeElement.querySelector('.filter-chip.open-now');
    expect(filterChip).toBeTruthy('Open now filter chip should be visible');
  });

  it('should NOT show visual indicator when openNow filter is NOT active', () => {
    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza', parsed: {}, language: 'en' },
      results: [
        { id: '1', placeId: 'p1', name: 'Some Place', address: '123', location: { lat: 32, lng: 34 }, openNow: true }
      ],
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: [] // NO filter
      }
    };

    (facade.results as jasmine.Spy).and.returnValue(mockResponse.results);
    (facade.response as jasmine.Spy).and.returnValue(mockResponse);

    fixture.detectChanges();

    // Verify: No visual indicator
    expect(component.closedFilterActive()).toBe(null);
    
    // Check if filter chip is NOT rendered
    const filterChip = fixture.nativeElement.querySelector('.filter-chip.open-now');
    expect(filterChip).toBeFalsy('Open now filter chip should NOT be visible');
  });

  it('should handle edge case: all places are closed when filter is active', () => {
    const mockResults: Restaurant[] = [
      { id: '1', placeId: 'p1', name: 'Closed 1', address: '123', location: { lat: 32, lng: 34 }, openNow: false },
      { id: '2', placeId: 'p2', name: 'Closed 2', address: '456', location: { lat: 32, lng: 34 }, openNow: false }
    ];

    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza open now', parsed: {}, language: 'en' },
      results: mockResults,
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: ['open_now']
      }
    };

    (facade.results as jasmine.Spy).and.returnValue(mockResults);
    (facade.response as jasmine.Spy).and.returnValue(mockResponse);

    fixture.detectChanges();

    // Verify: Empty results (all filtered out)
    const filtered = component.filteredResults();
    expect(filtered.length).toBe(0, 'Should show no places when all are closed');
  });

  it('should handle places with openNow=UNKNOWN correctly', () => {
    const mockResults: Restaurant[] = [
      { id: '1', placeId: 'p1', name: 'Open', address: '123', location: { lat: 32, lng: 34 }, openNow: true },
      { id: '2', placeId: 'p2', name: 'Unknown', address: '456', location: { lat: 32, lng: 34 }, openNow: 'UNKNOWN' },
      { id: '3', placeId: 'p3', name: 'Closed', address: '789', location: { lat: 32, lng: 34 }, openNow: false }
    ];

    const mockResponse: SearchResponse = {
      requestId: 'req-123',
      sessionId: 'sess-456',
      query: { original: 'pizza open now', parsed: {}, language: 'en' },
      results: mockResults,
      chips: [],
      meta: {
        tookMs: 500,
        mode: 'route2',
        appliedFilters: ['open_now']
      }
    };

    (facade.results as jasmine.Spy).and.returnValue(mockResults);
    (facade.response as jasmine.Spy).and.returnValue(mockResponse);

    fixture.detectChanges();

    // Verify: Only places with openNow=true are shown (UNKNOWN is filtered out)
    const filtered = component.filteredResults();
    expect(filtered.length).toBe(1, 'Should only show places with openNow=true');
    expect(filtered[0].name).toBe('Open');
  });
});
