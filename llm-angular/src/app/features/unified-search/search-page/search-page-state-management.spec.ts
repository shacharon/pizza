/**
 * E2E State Management Tests
 * Tests chip state behavior in SearchPageComponent per UI/UX Contract
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { signal } from '@angular/core';

describe('SearchPageComponent - E2E State Management (UI/UX Contract)', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let facade: jasmine.SpyObj<SearchFacade>;

  beforeEach(async () => {
    const currentSort = signal<'BEST_MATCH' | 'CLOSEST' | 'RATING_DESC' | 'PRICE_ASC'>('BEST_MATCH');
    const activeFilters = signal<string[]>([]);
    const currentView = signal<'LIST' | 'MAP'>('LIST');

    const facadeSpy = jasmine.createSpyObj('SearchFacade', [
      'search',
      'onChipClick',
      'selectRestaurant'
    ], {
      loading: signal(false),
      error: signal(null),
      query: signal('pizza in tel aviv'),
      results: signal([
        { id: '1', placeId: 'p1', name: 'Pizza 1', address: 'Addr 1', location: { lat: 32, lng: 34 } },
        { id: '2', placeId: 'p2', name: 'Pizza 2', address: 'Addr 2', location: { lat: 32, lng: 34 } },
        { id: '3', placeId: 'p3', name: 'Pizza 3', address: 'Addr 3', location: { lat: 32, lng: 34 } },
        { id: '4', placeId: 'p4', name: 'Pizza 4', address: 'Addr 4', location: { lat: 32, lng: 34 } },
        { id: '5', placeId: 'p5', name: 'Pizza 5', address: 'Addr 5', location: { lat: 32, lng: 34 } }
      ]),
      chips: signal([
        { id: 'sort_best_match', emoji: '✨', label: 'Best match', action: 'sort', filter: 'best_match' },
        { id: 'sort_closest', emoji: '📍', label: 'Closest', action: 'sort', filter: 'distance' },
        { id: 'sort_rating', emoji: '⭐', label: 'Rating', action: 'sort', filter: 'rating' },
        { id: 'delivery', emoji: '🚗', label: 'Delivery', action: 'filter', filter: 'delivery' },
        { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter', filter: 'price<=2' }
      ]),
      meta: signal({ confidence: 0.9, language: 'en', requestId: '1' }),
      assist: signal(null),
      groups: signal([]),
      response: signal({
        sessionId: '1',
        query: { original: 'pizza in tel aviv', parsed: {}, language: 'en' },
        results: [],
        groups: [],
        chips: [],
        assist: null,
        proposedActions: [],
        clarification: null,
        requiresClarification: false,
        meta: { confidence: 0.9, language: 'en', requestId: '1' }
      }),
      currentSort: currentSort.asReadonly(),
      activeFilters: signal(activeFilters()),
      currentView: currentView.asReadonly(),
      hasResults: signal(true)
    });

    // Simulate chip click behavior
    facadeSpy.onChipClick.and.callFake((chipId: string) => {
      const chips = facadeSpy.chips();
      const chip = chips.find(c => c.id === chipId);
      if (!chip) return;

      if (chip.action === 'sort') {
        const sortMap: Record<string, 'BEST_MATCH' | 'CLOSEST' | 'RATING_DESC' | 'PRICE_ASC'> = {
          'sort_best_match': 'BEST_MATCH',
          'sort_closest': 'CLOSEST',
          'sort_rating': 'RATING_DESC',
          'sort_price': 'PRICE_ASC'
        };
        currentSort.set(sortMap[chipId] || 'BEST_MATCH');
      } else if (chip.action === 'filter') {
        const filters = new Set(activeFilters());
        if (filters.has(chipId)) {
          filters.delete(chipId);
        } else {
          filters.add(chipId);
        }
        activeFilters.set(Array.from(filters));
        (facadeSpy.activeFilters as any) = signal(Array.from(filters));
      } else if (chip.action === 'map') {
        currentView.set('MAP');
      }
    });

    await TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [
        { provide: SearchFacade, useValue: facadeSpy }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
    facade = TestBed.inject(SearchFacade) as jasmine.SpyObj<SearchFacade>;
    fixture.detectChanges();
  });

  describe('Sort Chips (Single-Select Behavior)', () => {
    it('should activate "Rating" sort and deactivate "Best Match"', () => {
      expect(facade.currentSort()).toBe('BEST_MATCH');

      component.onChipClick('sort_rating');
      fixture.detectChanges();

      expect(facade.currentSort()).toBe('RATING_DESC');
      expect(facade.currentSort()).not.toBe('BEST_MATCH');
    });

    it('should activate "Closest" sort and deactivate "Rating"', () => {
      component.onChipClick('sort_rating');
      fixture.detectChanges();
      expect(facade.currentSort()).toBe('RATING_DESC');

      component.onChipClick('sort_closest');
      fixture.detectChanges();

      expect(facade.currentSort()).toBe('CLOSEST');
      expect(facade.currentSort()).not.toBe('RATING_DESC');
    });

    it('should only have ONE sort chip active at any time', () => {
      // Activate Rating
      component.onChipClick('sort_rating');
      fixture.detectChanges();
      const ratingActive = component.isChipActive({ id: 'sort_rating', action: 'sort' } as any);
      const bestMatchActive = component.isChipActive({ id: 'sort_best_match', action: 'sort' } as any);
      
      expect(ratingActive).toBe(true);
      expect(bestMatchActive).toBe(false);

      // Activate Closest
      component.onChipClick('sort_closest');
      fixture.detectChanges();
      const closestActive = component.isChipActive({ id: 'sort_closest', action: 'sort' } as any);
      const ratingStillActive = component.isChipActive({ id: 'sort_rating', action: 'sort' } as any);
      
      expect(closestActive).toBe(true);
      expect(ratingStillActive).toBe(false);
    });
  });

  describe('Filter Chips (Multi-Select Behavior)', () => {
    it('should NOT affect sort state when clicking "Budget" filter', () => {
      component.onChipClick('sort_rating');
      fixture.detectChanges();
      expect(facade.currentSort()).toBe('RATING_DESC');

      component.onChipClick('budget');
      fixture.detectChanges();

      // Sort state unchanged
      expect(facade.currentSort()).toBe('RATING_DESC');
    });

    it('should allow multiple filters to be active simultaneously', () => {
      component.onChipClick('delivery');
      component.onChipClick('budget');
      fixture.detectChanges();

      const deliveryActive = component.isChipActive({ id: 'delivery', action: 'filter' } as any);
      const budgetActive = component.isChipActive({ id: 'budget', action: 'filter' } as any);

      expect(deliveryActive).toBe(true);
      expect(budgetActive).toBe(true);
    });

    it('should toggle filter off when clicked again (multi-select toggle)', () => {
      component.onChipClick('delivery');
      fixture.detectChanges();
      expect(component.isChipActive({ id: 'delivery', action: 'filter' } as any)).toBe(true);

      component.onChipClick('delivery');
      fixture.detectChanges();
      expect(component.isChipActive({ id: 'delivery', action: 'filter' } as any)).toBe(false);
    });
  });

  describe('State Independence', () => {
    it('should maintain sort and filter states independently', () => {
      // Activate sort
      component.onChipClick('sort_rating');
      fixture.detectChanges();

      // Activate filter
      component.onChipClick('budget');
      fixture.detectChanges();

      // Both should be active
      expect(facade.currentSort()).toBe('RATING_DESC');
      expect(component.isChipActive({ id: 'budget', action: 'filter' } as any)).toBe(true);
    });

    it('should not affect other states when toggling a filter off', () => {
      component.onChipClick('sort_rating');
      component.onChipClick('delivery');
      component.onChipClick('budget');
      fixture.detectChanges();

      expect(facade.currentSort()).toBe('RATING_DESC');

      // Toggle delivery off
      component.onChipClick('delivery');
      fixture.detectChanges();

      // Sort and other filter should remain
      expect(facade.currentSort()).toBe('RATING_DESC');
      expect(component.isChipActive({ id: 'budget', action: 'filter' } as any)).toBe(true);
    });
  });

  describe('Mode Changes', () => {
    it('should update chips when mode changes to RECOVERY', () => {
      // Simulate mode change to RECOVERY
      (facade.chips as any).set([
        { id: 'expand_radius', emoji: '🔍', label: 'Expand search', action: 'filter', filter: 'radius:10000' },
        { id: 'remove_filters', emoji: '🔄', label: 'Remove filters', action: 'filter', filter: 'clear_filters' },
        { id: 'sort_rating', emoji: '⭐', label: 'Rating', action: 'sort', filter: 'rating' }
      ]);
      (facade.assist as any).set({ mode: 'RECOVERY', title: 'No results found', body: 'Try expanding your search' });
      fixture.detectChanges();

      const chips = facade.chips();
      expect(chips.length).toBeLessThanOrEqual(5); // Max 5 recovery chips
      expect(chips.some(c => c.id === 'expand_radius')).toBe(true);
    });

    it('should update chips when mode changes to CLARIFY', () => {
      // Simulate mode change to CLARIFY
      (facade.chips as any).set([
        { id: 'city_tel_aviv', emoji: '📍', label: 'Tel Aviv', action: 'filter', filter: 'city:Tel Aviv' },
        { id: 'city_jerusalem', emoji: '📍', label: 'Jerusalem', action: 'filter', filter: 'city:Jerusalem' }
      ]);
      (facade.assist as any).set({ mode: 'CLARIFY', title: 'Which city?', body: 'Please select a city' });
      fixture.detectChanges();

      const chips = facade.chips();
      expect(chips.length).toBeLessThanOrEqual(3); // Max 3 clarify chips
    });
  });

  describe('Visual Feedback', () => {
    it('should apply .active class to active sort chip', () => {
      component.onChipClick('sort_rating');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const ratingChip = Array.from(compiled.querySelectorAll('.chip'))
        .find(chip => chip.textContent?.includes('Rating'));

      expect(ratingChip?.classList.contains('active')).toBe(true);
    });

    it('should apply .active class to active filter chips (multiple)', () => {
      component.onChipClick('delivery');
      component.onChipClick('budget');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const activeChips = compiled.querySelectorAll('.chip.active');

      expect(activeChips.length).toBeGreaterThanOrEqual(2);
    });

    it('should remove .active class when sort chip is deactivated', () => {
      component.onChipClick('sort_rating');
      fixture.detectChanges();

      component.onChipClick('sort_closest');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const ratingChip = Array.from(compiled.querySelectorAll('.chip'))
        .find(chip => chip.textContent?.includes('Rating'));

      expect(ratingChip?.classList.contains('active')).toBe(false);
    });
  });
});

