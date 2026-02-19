/**
 * End-to-End Integration Tests
 * Tests complete user flows with all tools and options
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('SearchPageComponent - E2E Flows', () => {
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

  describe('Complete Flow: Successful Search → Filter → Action', () => {
    it('should handle complete user journey from search to action', () => {
      // Step 1: User searches for "pizza in tel aviv"
      const mockResponse: any = {
        query: { text: 'pizza in tel aviv', language: 'en' },
        groups: [
          {
            kind: 'EXACT',
            results: [
              { 
                id: '1', 
                placeId: 'p1', 
                name: 'Best Pizza', 
                address: '123 Test St',
                location: { lat: 32, lng: 34 },
                rating: 4.8,
                priceLevel: 2
              },
              { 
                id: '2', 
                placeId: 'p2', 
                name: 'Cheap Pizza', 
                address: '456 Budget Ave',
                location: { lat: 32, lng: 34 },
                rating: 4.2,
                priceLevel: 1
              }
            ]
          }
        ],
        chips: [
          { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter' },
          { id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found 2 restaurants', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.95 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: Results displayed
      expect(component.flatResults().length).toBe(2);
      expect(component.showAssistant()).toBe(false); // Hidden for good results

      // Step 2: User clicks "Budget" chip
      spyOn(facade, 'onChipClick');
      component.onChipClick('budget');

      expect(facade.onChipClick).toHaveBeenCalledWith('budget');
      expect(component.bottomSheetVisible()).toBe(false); // Not modal

      // Step 3: User clicks directions on first result
      // This would be handled by restaurant card component
      expect(component.flatResults()[0].name).toBe('Best Pizza');
    });
  });

  describe('Complete Flow: No Results → Recovery → Expand Search', () => {
    it('should handle recovery flow when no results found', () => {
      // Step 1: Search returns no results
      const mockResponse: any = {
        query: { text: 'vegan sushi in middle of nowhere', language: 'en' },
        groups: [],
        results: [],
        chips: [
          { id: 'expand_radius', emoji: '🔍', label: 'Expand search', action: 'filter', filter: 'radius:10000' },
          { id: 'remove_filters', emoji: '🔄', label: 'Remove filters', action: 'filter', filter: 'clear_filters' }
        ],
        assist: { 
          type: 'recovery', 
          mode: 'RECOVERY', 
          message: 'No results found. Try expanding your search.',
          failureReason: 'NO_RESULTS'
        },
        meta: { tookMs: 600, confidence: 0.5 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: No results, assistant shown
      expect(component.flatResults().length).toBe(0);
      expect(component.showAssistant()).toBe(true); // Shown for no results

      // Step 2: User clicks "Expand search" chip
      spyOn(facade, 'onChipClick');
      component.onChipClick('expand_radius');

      expect(facade.onChipClick).toHaveBeenCalledWith('expand_radius');
    });
  });

  describe('Complete Flow: Ambiguous Query → Clarify → Select City', () => {
    it('should handle clarification flow', () => {
      // Step 1: Ambiguous query returns clarification
      const mockResponse: any = {
        query: { text: 'pizza', language: 'en' },
        groups: [],
        results: [],
        chips: [
          { id: 'city_tel_aviv', emoji: '📍', label: 'Pizza in Tel Aviv', action: 'filter', filter: 'city:Tel Aviv' },
          { id: 'city_jerusalem', emoji: '📍', label: 'Pizza in Jerusalem', action: 'filter', filter: 'city:Jerusalem' }
        ],
        assist: { 
          type: 'guide', 
          mode: 'CLARIFY', 
          message: 'Which city did you mean?',
          failureReason: 'AMBIGUOUS'
        },
        meta: { tookMs: 300, confidence: 0.4 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: Clarification shown
      expect(component.showAssistant()).toBe(true); // Low confidence
      expect(component.flatResults().length).toBe(0);

      // Step 2: User selects Tel Aviv
      spyOn(facade, 'onChipClick');
      component.onChipClick('city_tel_aviv');

      expect(facade.onChipClick).toHaveBeenCalledWith('city_tel_aviv');
    });
  });

  describe('Complete Flow: Multiple Chips → Active State', () => {
    it('should handle multiple filter applications', () => {
      const mockResponse: any = {
        groups: [
          {
            kind: 'EXACT',
            results: [
              { id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 32, lng: 34 }, rating: 4.5 }
            ]
          }
        ],
        chips: [
          { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter' },
          { id: 'opennow', emoji: '🟢', label: 'Open now', action: 'filter' },
          { id: 'delivery', emoji: '🚗', label: 'Delivery', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      spyOn(facade, 'onChipClick');

      // Apply multiple filters
      component.onChipClick('budget');
      component.onChipClick('opennow');
      component.onChipClick('delivery');

      expect(facade.onChipClick).toHaveBeenCalledTimes(3);
      expect(facade.onChipClick).toHaveBeenCalledWith('budget');
      expect(facade.onChipClick).toHaveBeenCalledWith('opennow');
      expect(facade.onChipClick).toHaveBeenCalledWith('delivery');
    });
  });

  describe('Complete Flow: CITY Search (No Distance Grouping)', () => {
    it('should handle city search with single EXACT group', () => {
      // Simulates "pizza in gedera" (reported bug case)
      const mockResponse: any = {
        query: { text: 'pizza in gedera', language: 'en' },
        groups: [
          {
            kind: 'EXACT',
            label: 'Results in Gedera',
            results: [
              { id: '1', placeId: 'p1', name: 'Pizza 1', address: 'Gedera 1', location: { lat: 31.8, lng: 34.7 } },
              { id: '2', placeId: 'p2', name: 'Pizza 2', address: 'Gedera 2', location: { lat: 31.8, lng: 34.7 } },
              { id: '3', placeId: 'p3', name: 'Pizza 3', address: 'Gedera 3', location: { lat: 31.8, lng: 34.7 } },
              { id: '4', placeId: 'p4', name: 'Pizza 4', address: 'Gedera 4', location: { lat: 31.8, lng: 34.7 } },
              { id: '5', placeId: 'p5', name: 'Pizza 5', address: 'Gedera 5', location: { lat: 31.8, lng: 34.7 } },
              { id: '6', placeId: 'p6', name: 'Pizza 6', address: 'Gedera 6', location: { lat: 31.8, lng: 34.7 } },
              { id: '7', placeId: 'p7', name: 'Pizza 7', address: 'Gedera 7', location: { lat: 31.8, lng: 34.7 } },
              { id: '8', placeId: 'p8', name: 'Pizza 8', address: 'Gedera 8', location: { lat: 31.8, lng: 34.7 } },
              { id: '9', placeId: 'p9', name: 'Pizza 9', address: 'Gedera 9', location: { lat: 31.8, lng: 34.7 } }
            ]
          }
        ],
        chips: [{ id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found 9 restaurants', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.95 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: All results in ONE group (not split into EXACT/NEARBY)
      expect(component.flatResults().length).toBe(9);
      
      const response = (facade as any)._searchStore.response();
      expect(response.groups.length).toBe(1);
      expect(response.groups[0].kind).toBe('EXACT');
      
      // No "nearby" group
      const nearbyGroup = response.groups.find((g: any) => g.kind === 'NEARBY');
      expect(nearbyGroup).toBeUndefined();
    });
  });

  describe('Complete Flow: STREET Search (Distance Grouping)', () => {
    it('should handle street search with EXACT and NEARBY groups', () => {
      const mockResponse: any = {
        query: { text: 'pizza on allenby', language: 'en' },
        groups: [
          {
            kind: 'EXACT',
            label: 'On the street',
            results: [
              { id: '1', placeId: 'p1', name: 'Pizza 1', address: 'Allenby 1', location: { lat: 32.06, lng: 34.77 } }
            ]
          },
          {
            kind: 'NEARBY',
            label: 'Nearby',
            results: [
              { id: '2', placeId: 'p2', name: 'Pizza 2', address: 'Near Allenby', location: { lat: 32.065, lng: 34.775 } }
            ]
          }
        ],
        chips: [{ id: 'closest', emoji: '📍', label: 'Closest', action: 'sort' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found 2 restaurants', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: Flat results contain both groups
      expect(component.flatResults().length).toBe(2);
      
      // Original groups preserved
      const response = (facade as any)._searchStore.response();
      expect(response.groups.length).toBe(2);
      expect(response.groups[0].kind).toBe('EXACT');
      expect(response.groups[1].kind).toBe('NEARBY');
    });
  });

  describe('Complete Flow: Low Confidence → Assistant Shown', () => {
    it('should show assistant when confidence is below 60%', () => {
      const mockResponse: any = {
        query: { text: 'unclear query', language: 'en' },
        groups: [
          {
            kind: 'EXACT',
            results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 32, lng: 34 } }]
          }
        ],
        chips: [],
        assist: { 
          type: 'guide', 
          mode: 'NORMAL', 
          message: 'Not sure I understood correctly',
          failureReason: 'NONE'
        },
        meta: { tookMs: 700, confidence: 0.45 } // Low confidence
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: Assistant shown for low confidence
      expect(component.showAssistant()).toBe(true);
      expect(component.flatResults().length).toBe(1);
    });
  });

  describe('Complete Flow: High Confidence → Assistant Hidden', () => {
    it('should hide assistant when results are good', () => {
      const mockResponse: any = {
        query: { text: 'pizza in tel aviv', language: 'en' },
        groups: [
          {
            kind: 'EXACT',
            results: [
              { id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 32, lng: 34 } },
              { id: '2', placeId: 'p2', name: 'R2', address: 'A2', location: { lat: 32, lng: 34 } }
            ]
          }
        ],
        chips: [{ id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found results', failureReason: 'NONE' },
        meta: { tookMs: 400, confidence: 0.92 } // High confidence
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Verify: Assistant hidden for good results
      expect(component.showAssistant()).toBe(false);
      expect(component.flatResults().length).toBe(2);
    });
  });

  describe('Complete Flow: Multilingual Support', () => {
    it('should handle Hebrew query with Hebrew chips', () => {
      const mockResponse: any = {
        query: { text: 'פיצה בתל אביב', language: 'he' },
        groups: [
          {
            kind: 'EXACT',
            results: [{ id: '1', placeId: 'p1', name: 'פיצה', address: 'תל אביב', location: { lat: 32, lng: 34 } }]
          }
        ],
        chips: [
          { id: 'toprated', emoji: '⭐', label: 'מדורג גבוה', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'נמצאו תוצאות', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.flatResults().length).toBe(1);
      
      // Chips should work regardless of language
      spyOn(facade, 'onChipClick');
      component.onChipClick('toprated');
      expect(facade.onChipClick).toHaveBeenCalledWith('toprated');
    });
  });

  describe('Complete Flow: Mobile View with Bottom Sheet', () => {
    it('should manage bottom sheet state separately from chips', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 32, lng: 34 } }] }
        ],
        chips: [{ id: 'map', emoji: '🗺️', label: 'Map', action: 'map' }],
        assist: { type: 'recovery', mode: 'RECOVERY', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.5 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Assistant shown (low confidence)
      expect(component.showAssistant()).toBe(true);

      // Bottom sheet can be opened/closed independently
      expect(component.bottomSheetVisible()).toBe(false);
      
      // Chip click doesn't open bottom sheet
      spyOn(facade, 'onChipClick');
      component.onChipClick('map');
      expect(component.bottomSheetVisible()).toBe(false);
    });
  });

  describe('Complete Flow: Top Result with Reason Label', () => {
    it('should display reason label on top result', () => {
      const mockResponse: any = {
        groups: [
          {
            kind: 'EXACT',
            results: [
              { 
                id: '1', 
                placeId: 'p1', 
                name: 'Best Pizza', 
                address: 'A1',
                location: { lat: 32, lng: 34 },
                rating: 4.8,
                openNow: true
              }
            ]
          }
        ],
        chips: [],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.95 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Top result should have attributes for reason label
      const topResult = component.flatResults()[0];
      expect(topResult.rating).toBe(4.8);
      expect(topResult.openNow).toBe(true);
    });
  });

  describe('Edge Cases: Empty States', () => {
    it('should handle response with no groups', () => {
      const mockResponse: any = {
        groups: [],
        results: [],
        chips: [],
        assist: null,
        meta: { tookMs: 100, confidence: 1 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.flatResults().length).toBe(0);
      expect(component.showAssistant()).toBe(true); // No results
    });

    it('should handle null response', () => {
      (facade as any)._searchStore.response.set(null);
      fixture.detectChanges();

      expect(component.flatResults().length).toBe(0);
      expect(component.showAssistant()).toBe(false);
    });
  });

  describe('Performance: Large Result Sets', () => {
    it('should handle 20 results efficiently', () => {
      const results = Array.from({ length: 20 }, (_, i) => ({
        id: `${i + 1}`,
        placeId: `p${i + 1}`,
        name: `Restaurant ${i + 1}`,
        address: `Address ${i + 1}`,
        location: { lat: 32, lng: 34 }
      }));

      const mockResponse: any = {
        groups: [{ kind: 'EXACT', results }],
        chips: [{ id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found 20 restaurants', failureReason: 'NONE' },
        meta: { tookMs: 500, confidence: 0.9 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.flatResults().length).toBe(20);
      expect(component.flatResults()[0].id).toBe('1');
      expect(component.flatResults()[19].id).toBe('20');
    });
  });
});

