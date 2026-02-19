/**
 * Chip Interaction Tests
 * Tests all chip click behaviors and filtering
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('SearchPageComponent - Chip Interactions', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let facade: SearchFacade;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
    facade = component.facade;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Filter Chips - Click Behavior', () => {
    it('should call facade.onChipClick when delivery chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('delivery');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('delivery');
      expect(facade.onChipClick).toHaveBeenCalledTimes(1);
    });

    it('should call facade.onChipClick when budget chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('budget');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('budget');
    });

    it('should call facade.onChipClick when toprated chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('toprated');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('toprated');
    });

    it('should call facade.onChipClick when opennow chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('opennow');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('opennow');
    });

    it('should call facade.onChipClick when takeout chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('takeout');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('takeout');
    });
  });

  describe('Sort Chips - Click Behavior', () => {
    it('should call facade.onChipClick when closest chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('closest');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('closest');
    });

    it('should call facade.onChipClick when sort_rating chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('sort_rating');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('sort_rating');
    });

    it('should call facade.onChipClick when sort_price chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('sort_price');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('sort_price');
    });
  });

  describe('View Chips - Click Behavior', () => {
    it('should call facade.onChipClick when map chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('map');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('map');
    });
  });

  describe('Recovery Chips - Click Behavior', () => {
    it('should call facade.onChipClick when expand_radius chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('expand_radius');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('expand_radius');
    });

    it('should call facade.onChipClick when remove_filters chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('remove_filters');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('remove_filters');
    });

    it('should call facade.onChipClick when try_nearby chip clicked', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('try_nearby');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('try_nearby');
    });
  });

  describe('Chip Click Behavior Validation', () => {
    it('should NOT open bottom sheet on chip click', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('toprated');
      
      expect(component.bottomSheetVisible()).toBe(false);
    });

    it('should trigger actual filtering, not modal', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('budget');
      
      // Verify it calls facade, not opens modal
      expect(facade.onChipClick).toHaveBeenCalled();
      expect(component.bottomSheetVisible()).toBe(false);
    });

    it('should NOT change bottomSheetVisible state', () => {
      spyOn(facade, 'onChipClick');
      const initialState = component.bottomSheetVisible();
      
      component.onChipClick('opennow');
      
      expect(component.bottomSheetVisible()).toBe(initialState);
    });
  });

  describe('Multiple Chip Clicks', () => {
    it('should handle multiple consecutive chip clicks', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('delivery');
      component.onChipClick('budget');
      component.onChipClick('toprated');
      
      expect(facade.onChipClick).toHaveBeenCalledTimes(3);
      expect(facade.onChipClick).toHaveBeenCalledWith('delivery');
      expect(facade.onChipClick).toHaveBeenCalledWith('budget');
      expect(facade.onChipClick).toHaveBeenCalledWith('toprated');
    });

    it('should handle clicking the same chip multiple times', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('opennow');
      component.onChipClick('opennow');
      component.onChipClick('opennow');
      
      expect(facade.onChipClick).toHaveBeenCalledTimes(3);
      expect(facade.onChipClick).toHaveBeenCalledWith('opennow');
    });
  });

  describe('Chip Rendering', () => {
    it('should render chips when results exist', () => {
      const mockResponse: any = {
        groups: [
          {
            kind: 'EXACT',
            results: [
              { id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }
            ]
          }
        ],
        chips: [
          { id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' },
          { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter' },
          { id: 'map', emoji: '🗺️', label: 'Map', action: 'map' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found results', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const chipsContainer = fixture.nativeElement.querySelector('.chips-mobile');
      expect(chipsContainer).toBeTruthy();
      
      const chipButtons = chipsContainer.querySelectorAll('.chip');
      expect(chipButtons.length).toBe(3);
    });

    it('should render chip emoji and label', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [
          { id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('.chip');
      expect(chip.textContent).toContain('⭐');
      expect(chip.textContent).toContain('Top Rated');
    });

    it('should handle click event on rendered chip', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [
          { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      spyOn(facade, 'onChipClick');
      
      const chip = fixture.nativeElement.querySelector('.chip');
      chip.click();
      
      expect(facade.onChipClick).toHaveBeenCalledWith('budget');
    });
  });

  describe('No Chips Scenario', () => {
    it('should NOT render chips container when no chips', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const chipsContainer = fixture.nativeElement.querySelector('.chips-mobile');
      expect(chipsContainer).toBeFalsy();
    });
  });

  describe('Chip Click Integration with Results', () => {
    it('should maintain results after chip click', () => {
      const mockResponse: any = {
        groups: [
          {
            kind: 'EXACT',
            results: [
              { id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } },
              { id: '2', placeId: 'p2', name: 'R2', address: 'A2', location: { lat: 2, lng: 2 } }
            ]
          }
        ],
        chips: [{ id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const resultsBefore = component.flatResults().length;
      expect(resultsBefore).toBe(2);

      spyOn(facade, 'onChipClick');
      component.onChipClick('toprated');

      // Results should still be accessible after chip click
      expect(component.flatResults().length).toBe(2);
    });
  });

  describe('Chip Accessibility', () => {
    it('should render chips as buttons', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [
          { id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('.chip');
      expect(chip.tagName.toLowerCase()).toBe('button');
    });

    it('should have clickable chip buttons', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [
          { id: 'map', emoji: '🗺️', label: 'Map', action: 'map' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('.chip');
      expect(chip.disabled).toBe(false);
    });
  });

  describe('Clarification Chips', () => {
    it('should call facade.onChipClick for city clarification chips', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('city_tel_aviv');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('city_tel_aviv');
    });

    it('should call facade.onChipClick for multiple city options', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('city_tel_aviv');
      component.onChipClick('city_jerusalem');
      component.onChipClick('city_haifa');
      
      expect(facade.onChipClick).toHaveBeenCalledTimes(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle clicking with empty chip id gracefully', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('');
    });

    it('should handle clicking with unknown chip id', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('unknown_chip_id');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('unknown_chip_id');
    });

    it('should handle rapid successive clicks', () => {
      spyOn(facade, 'onChipClick');
      
      // Simulate rapid clicking
      for (let i = 0; i < 10; i++) {
        component.onChipClick('budget');
      }
      
      expect(facade.onChipClick).toHaveBeenCalledTimes(10);
    });
  });
});

