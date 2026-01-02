/**
 * Search Facade State Management Tests
 * Tests sort/filter/view state tracking per UI/UX Contract
 */

import { TestBed } from '@angular/core/testing';
import { SearchFacade } from './search.facade';
import { UnifiedSearchService } from '../services/unified-search.service';
import { ActionService } from '../services/action.service';
import { InputStateMachine } from '../services/input-state-machine.service';
import { RecentSearchesService } from '../services/recent-searches.service';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { ActionsStore } from '../state/actions.store';
import { of } from 'rxjs';

describe('SearchFacade - State Management (UI/UX Contract)', () => {
  let facade: SearchFacade;
  let searchStore: jasmine.SpyObj<SearchStore>;
  let searchService: jasmine.SpyObj<UnifiedSearchService>;

  beforeEach(() => {
    const searchStoreSpy = jasmine.createSpyObj('SearchStore', ['reset'], {
      loading: jasmine.createSpy('loading').and.returnValue(false),
      error: jasmine.createSpy('error').and.returnValue(null),
      query: jasmine.createSpy('query').and.returnValue('pizza in tel aviv'),
      results: jasmine.createSpy('results').and.returnValue([]),
      chips: jasmine.createSpy('chips').and.returnValue([]),
      meta: jasmine.createSpy('meta').and.returnValue(null),
      assist: jasmine.createSpy('assist').and.returnValue(null),
      proposedActions: jasmine.createSpy('proposedActions').and.returnValue([]),
      hasResults: jasmine.createSpy('hasResults').and.returnValue(false),
      groups: jasmine.createSpy('groups').and.returnValue([]),
      hasGroups: jasmine.createSpy('hasGroups').and.returnValue(false),
      exactResults: jasmine.createSpy('exactResults').and.returnValue([]),
      nearbyResults: jasmine.createSpy('nearbyResults').and.returnValue([]),
      exactCount: jasmine.createSpy('exactCount').and.returnValue(0),
      nearbyCount: jasmine.createSpy('nearbyCount').and.returnValue(0),
      clarification: jasmine.createSpy('clarification').and.returnValue(null),
      requiresClarification: jasmine.createSpy('requiresClarification').and.returnValue(false)
    });

    const searchServiceSpy = jasmine.createSpyObj('UnifiedSearchService', ['search']);
    searchServiceSpy.search.and.returnValue(of(null));

    TestBed.configureTestingModule({
      providers: [
        SearchFacade,
        { provide: UnifiedSearchService, useValue: searchServiceSpy },
        { provide: ActionService, useValue: jasmine.createSpyObj('ActionService', ['proposeAction']) },
        { provide: InputStateMachine, useValue: jasmine.createSpyObj('InputStateMachine', ['input'], {
          state: jasmine.createSpy('state').and.returnValue('IDLE'),
          query: jasmine.createSpy('query').and.returnValue(''),
          showRecentSearches: jasmine.createSpy('showRecentSearches').and.returnValue(false),
          showClearButton: jasmine.createSpy('showClearButton').and.returnValue(false),
          canSubmit: jasmine.createSpy('canSubmit').and.returnValue(false),
          intentReset: jasmine.createSpy('intentReset').and.returnValue(false)
        }) },
        { provide: RecentSearchesService, useValue: jasmine.createSpyObj('RecentSearchesService', ['add'], {
          searches: jasmine.createSpy('searches').and.returnValue([]),
          hasSearches: jasmine.createSpy('hasSearches').and.returnValue(false)
        }) },
        { provide: SearchStore, useValue: searchStoreSpy },
        { provide: SessionStore, useValue: jasmine.createSpyObj('SessionStore', ['setLocale'], {
          selectedRestaurant: jasmine.createSpy('selectedRestaurant').and.returnValue(null),
          conversationId: jasmine.createSpy('conversationId').and.returnValue(''),
          locale: jasmine.createSpy('locale').and.returnValue('en'),
          preferences: jasmine.createSpy('preferences').and.returnValue({})
        }) },
        { provide: ActionsStore, useValue: jasmine.createSpyObj('ActionsStore', [], {
          pending: jasmine.createSpy('pending').and.returnValue([]),
          executed: jasmine.createSpy('executed').and.returnValue([])
        }) }
      ]
    });

    facade = TestBed.inject(SearchFacade);
    searchStore = TestBed.inject(SearchStore) as jasmine.SpyObj<SearchStore>;
    searchService = TestBed.inject(UnifiedSearchService) as jasmine.SpyObj<UnifiedSearchService>;
  });

  describe('Sort State (Single-Select)', () => {
    beforeEach(() => {
      (searchStore.chips as any).and.returnValue([
        { id: 'sort_best_match', emoji: '✨', label: 'Best match', action: 'sort', filter: 'best_match' },
        { id: 'sort_closest', emoji: '📍', label: 'Closest', action: 'sort', filter: 'distance' },
        { id: 'sort_rating', emoji: '⭐', label: 'Rating', action: 'sort', filter: 'rating' }
      ]);
    });

    it('should initialize with BEST_MATCH as default sort', () => {
      expect(facade.currentSort()).toBe('BEST_MATCH');
    });

    it('should activate RATING sort and deactivate BEST_MATCH (single-select)', () => {
      facade.onChipClick('sort_rating');
      expect(facade.currentSort()).toBe('RATING_DESC');
    });

    it('should activate CLOSEST sort and deactivate previous sort', () => {
      facade.onChipClick('sort_rating');
      expect(facade.currentSort()).toBe('RATING_DESC');

      facade.onChipClick('sort_closest');
      expect(facade.currentSort()).toBe('CLOSEST');
    });

    it('should only have ONE sort active at a time', () => {
      facade.onChipClick('sort_rating');
      const currentSort = facade.currentSort();
      
      // Only one sort should be active
      expect(currentSort).toBe('RATING_DESC');
      
      // Activate another sort
      facade.onChipClick('sort_price');
      const newSort = facade.currentSort();
      
      // Previous sort should be deactivated
      expect(newSort).toBe('PRICE_ASC');
      expect(newSort).not.toBe('RATING_DESC');
    });

    it('should map legacy chip IDs correctly (toprated → RATING_DESC)', () => {
      facade.onChipClick('toprated');
      expect(facade.currentSort()).toBe('RATING_DESC');
    });
  });

  describe('Filter State (Multi-Select)', () => {
    beforeEach(() => {
      (searchStore.chips as any).and.returnValue([
        { id: 'delivery', emoji: '🚗', label: 'Delivery', action: 'filter', filter: 'delivery' },
        { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter', filter: 'price<=2' },
        { id: 'opennow', emoji: '🟢', label: 'Open now', action: 'filter', filter: 'opennow' }
      ]);
    });

    it('should initialize with no active filters', () => {
      expect(facade.activeFilters().length).toBe(0);
    });

    it('should add delivery filter when clicked', () => {
      facade.onChipClick('delivery');
      expect(facade.activeFilters()).toContain('delivery');
    });

    it('should toggle filter off when clicked again', () => {
      facade.onChipClick('delivery');
      expect(facade.activeFilters()).toContain('delivery');

      facade.onChipClick('delivery');
      expect(facade.activeFilters()).not.toContain('delivery');
    });

    it('should allow multiple filters to be active simultaneously', () => {
      facade.onChipClick('delivery');
      facade.onChipClick('budget');
      facade.onChipClick('opennow');

      const activeFilters = facade.activeFilters();
      expect(activeFilters.length).toBe(3);
      expect(activeFilters).toContain('delivery');
      expect(activeFilters).toContain('budget');
      expect(activeFilters).toContain('opennow');
    });

    it('should not affect sort state when toggling filters', () => {
      const initialSort = facade.currentSort();

      facade.onChipClick('delivery');
      facade.onChipClick('budget');

      expect(facade.currentSort()).toBe(initialSort);
    });

    it('should trigger re-search with priceLevel filter when budget chip clicked', () => {
      // Click budget chip
      facade.onChipClick('budget');

      // Should call search service with parsed filter
      expect(searchService.search).toHaveBeenCalledWith(
        'pizza in tel aviv',
        jasmine.objectContaining({ priceLevel: 2 }),
        jasmine.any(Boolean)
      );
    });

    it('should trigger re-search without filter when budget chip removed', () => {
      // Activate budget
      facade.onChipClick('budget');
      searchService.search.calls.reset();

      // Deactivate budget
      facade.onChipClick('budget');

      // Should call search service with empty filters
      expect(searchService.search).toHaveBeenCalledWith(
        'pizza in tel aviv',
        {},
        jasmine.any(Boolean)
      );
    });

    it('should combine multiple filters when re-searching', () => {
      // Activate budget and open now
      facade.onChipClick('budget');
      facade.onChipClick('opennow');

      // Should call search service with both filters
      expect(searchService.search).toHaveBeenCalledWith(
        'pizza in tel aviv',
        jasmine.objectContaining({ 
          priceLevel: 2,
          openNow: true
        }),
        jasmine.any(Boolean)
      );
    });
  });

  describe('View State (Single-Select)', () => {
    beforeEach(() => {
      (searchStore.chips as any).and.returnValue([
        { id: 'map', emoji: '🗺️', label: 'Map', action: 'map' }
      ]);
    });

    it('should initialize with LIST as default view', () => {
      expect(facade.currentView()).toBe('LIST');
    });

    it('should switch to MAP view when map chip clicked', () => {
      facade.onChipClick('map');
      expect(facade.currentView()).toBe('MAP');
    });
  });

  describe('State Independence', () => {
    beforeEach(() => {
      (searchStore.chips as any).and.returnValue([
        { id: 'sort_rating', emoji: '⭐', label: 'Rating', action: 'sort', filter: 'rating' },
        { id: 'delivery', emoji: '🚗', label: 'Delivery', action: 'filter', filter: 'delivery' },
        { id: 'map', emoji: '🗺️', label: 'Map', action: 'map' }
      ]);
    });

    it('should not affect filter state when changing sort', () => {
      facade.onChipClick('delivery');
      expect(facade.activeFilters()).toContain('delivery');

      facade.onChipClick('sort_rating');
      expect(facade.activeFilters()).toContain('delivery');
    });

    it('should not affect sort state when changing view', () => {
      facade.onChipClick('sort_rating');
      expect(facade.currentSort()).toBe('RATING_DESC');

      facade.onChipClick('map');
      expect(facade.currentSort()).toBe('RATING_DESC');
    });

    it('should maintain all three states independently', () => {
      // Set sort
      facade.onChipClick('sort_rating');
      expect(facade.currentSort()).toBe('RATING_DESC');

      // Set filter
      facade.onChipClick('delivery');
      expect(facade.activeFilters()).toContain('delivery');

      // Set view
      facade.onChipClick('map');
      expect(facade.currentView()).toBe('MAP');

      // Verify all states are still correct
      expect(facade.currentSort()).toBe('RATING_DESC');
      expect(facade.activeFilters()).toContain('delivery');
      expect(facade.currentView()).toBe('MAP');
    });
  });
});
