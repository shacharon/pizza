/**
 * Test: Results Rendering is Non-Blocking
 * Proves that UI renders search results immediately without waiting for assistant
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from '../search-page.component';
import { SearchFacade } from '../../../../facades/search.facade';
import type { SearchResponse } from '../../../../domain/types/search.types';

describe('SearchPage: Non-Blocking Results Rendering', () => {
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
      results: jasmine.createSpy('results').and.returnValue([
        { id: '1', placeId: 'p1', name: 'Pizza Place 1', address: '123 Main', location: { lat: 32, lng: 34 }, openNow: true },
        { id: '2', placeId: 'p2', name: 'Pizza Place 2', address: '456 Elm', location: { lat: 32, lng: 34 }, openNow: true }
      ]),
      hasResults: jasmine.createSpy('hasResults').and.returnValue(true),
      hasGroups: jasmine.createSpy('hasGroups').and.returnValue(false),
      response: jasmine.createSpy('response').and.returnValue({
        requestId: 'req-123',
        sessionId: 'sess-456',
        query: { original: 'pizza', parsed: {}, language: 'en' },
        results: [
          { id: '1', placeId: 'p1', name: 'Pizza Place 1', address: '123 Main', location: { lat: 32, lng: 34 }, openNow: true },
          { id: '2', placeId: 'p2', name: 'Pizza Place 2', address: '456 Elm', location: { lat: 32, lng: 34 }, openNow: true }
        ],
        chips: [],
        meta: { tookMs: 500, mode: 'route2', appliedFilters: [] }
      }),
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

  it('should render results immediately when loading=false, even if assistant is still idle', () => {
    // Scenario: Search results arrived (loading=false), but assistant hasn't responded yet (idle)
    (facade.loading as jasmine.Spy).and.returnValue(false);
    (facade.assistantState as jasmine.Spy).and.returnValue('idle');
    (facade.hasResults as jasmine.Spy).and.returnValue(true);
    
    fixture.detectChanges();

    // Verify: Results are rendered
    expect(component.shouldShowResults()).toBe(true);
    expect(component.filteredResults().length).toBe(2);
    
    // Verify: Not showing loading spinner
    expect(facade.loading()).toBe(false);
  });

  it('should render results immediately when loading=false, even if assistant is loading', () => {
    // Scenario: Search results arrived (loading=false), assistant is still loading
    (facade.loading as jasmine.Spy).and.returnValue(false);
    (facade.assistantState as jasmine.Spy).and.returnValue('loading');
    (facade.hasResults as jasmine.Spy).and.returnValue(true);
    
    fixture.detectChanges();

    // Verify: Results are rendered (not blocked by assistant)
    expect(component.shouldShowResults()).toBe(true);
    expect(component.filteredResults().length).toBe(2);
  });

  it('should render results immediately when loading=false, even if assistant failed', () => {
    // Scenario: Search results arrived (loading=false), assistant failed
    (facade.loading as jasmine.Spy).and.returnValue(false);
    (facade.assistantState as jasmine.Spy).and.returnValue('failed');
    (facade.assistantError as jasmine.Spy).and.returnValue('Assistant timeout');
    (facade.hasResults as jasmine.Spy).and.returnValue(true);
    
    fixture.detectChanges();

    // Verify: Results are still rendered (assistant failure doesn't block results)
    expect(component.shouldShowResults()).toBe(true);
    expect(component.filteredResults().length).toBe(2);
  });

  it('should NOT show loading spinner when results are ready, even if assistant is pending', () => {
    // Scenario: Results ready, assistant still pending
    (facade.loading as jasmine.Spy).and.returnValue(false);
    (facade.assistantState as jasmine.Spy).and.returnValue('loading');
    
    fixture.detectChanges();

    // Verify: Loading spinner hidden
    const loadingElement = fixture.nativeElement.querySelector('.loading-state');
    expect(loadingElement).toBeFalsy();
  });

  it('should show results when results arrived, regardless of assistant state', () => {
    // Test all possible assistant states
    const assistantStates = ['idle', 'loading', 'completed', 'failed'];
    
    assistantStates.forEach(state => {
      (facade.loading as jasmine.Spy).and.returnValue(false);
      (facade.assistantState as jasmine.Spy).and.returnValue(state);
      (facade.hasResults as jasmine.Spy).and.returnValue(true);
      
      fixture.detectChanges();

      // Results should always be shown when loading=false and hasResults=true
      expect(component.shouldShowResults()).toBe(true, `Results should show when assistant is ${state}`);
    });
  });

  it('should handle scenario: results arrive first, assistant arrives later', () => {
    // Step 1: Results arrive (loading=false), assistant still pending
    (facade.loading as jasmine.Spy).and.returnValue(false);
    (facade.assistantState as jasmine.Spy).and.returnValue('loading');
    (facade.hasResults as jasmine.Spy).and.returnValue(true);
    
    fixture.detectChanges();

    // Verify: Results displayed immediately
    expect(component.shouldShowResults()).toBe(true);
    expect(component.filteredResults().length).toBe(2);

    // Step 2: Assistant completes later
    (facade.assistantState as jasmine.Spy).and.returnValue('completed');
    fixture.detectChanges();

    // Verify: Results still displayed (not re-hidden)
    expect(component.shouldShowResults()).toBe(true);
    expect(component.filteredResults().length).toBe(2);
  });

  it('should handle scenario: assistant arrives first (SUMMARY), results arrive later', () => {
    // Step 1: Assistant arrives first with SUMMARY (non-blocking)
    (facade.loading as jasmine.Spy).and.returnValue(true); // Still loading results
    (facade.assistantState as jasmine.Spy).and.returnValue('completed');
    (facade.hasResults as jasmine.Spy).and.returnValue(false);
    
    fixture.detectChanges();

    // Verify: Loading spinner still shown (waiting for results)
    const loadingElement1 = fixture.nativeElement.querySelector('.loading-state');
    expect(loadingElement1).toBeTruthy();

    // Step 2: Results arrive
    (facade.loading as jasmine.Spy).and.returnValue(false);
    (facade.hasResults as jasmine.Spy).and.returnValue(true);
    fixture.detectChanges();

    // Verify: Results displayed, loading hidden
    expect(component.shouldShowResults()).toBe(true);
    const loadingElement2 = fixture.nativeElement.querySelector('.loading-state');
    expect(loadingElement2).toBeFalsy();
  });
});
