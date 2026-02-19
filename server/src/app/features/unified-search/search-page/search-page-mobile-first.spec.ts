/**
 * Mobile-First UX Integration Tests
 * Tests for single ranked list, no duplicate lists, bottom sheet, desktop panel
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('SearchPageComponent - Mobile-First UX', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let facade: SearchFacade;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
    facade = component.facade;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should never render two competing result lists', () => {
    // Simulate search response with groups
    const mockResponse: any = {
      groups: [
        { 
          kind: 'EXACT',
          label: 'Closest Results',
          results: [
            { id: 'a', placeId: 'pa', name: 'Restaurant A', address: '1 A St', location: { lat: 1, lng: 1 } },
            { id: 'b', placeId: 'pb', name: 'Restaurant B', address: '2 B St', location: { lat: 2, lng: 2 } }
          ]
        },
        {
          kind: 'NEARBY',
          label: 'Nearby Options',
          results: [
            { id: 'c', placeId: 'pc', name: 'Restaurant C', address: '3 C St', location: { lat: 3, lng: 3 } }
          ]
        }
      ],
      chips: [],
      assist: { type: 'guide', mode: 'NORMAL', message: 'Test message', failureReason: 'NONE' }
    };

    // Mock facade response
    (facade as any)._searchStore.response.set(mockResponse);
    fixture.detectChanges();

    const resultLists = fixture.nativeElement.querySelectorAll('.results-list');
    const resultGroups = fixture.nativeElement.querySelectorAll('.result-group');

    // Assert: only one primary list exists
    expect(resultLists.length).toBe(1);
    expect(resultGroups.length).toBe(0);
  });

  it('should flatten grouped results preserving order', () => {
    const mockResponse: any = {
      groups: [
        {
          kind: 'EXACT',
          results: [
            { id: 'a', placeId: 'pa', name: 'A', address: '1', location: { lat: 1, lng: 1 } },
            { id: 'b', placeId: 'pb', name: 'B', address: '2', location: { lat: 2, lng: 2 } }
          ]
        },
        {
          kind: 'NEARBY',
          results: [
            { id: 'c', placeId: 'pc', name: 'C', address: '3', location: { lat: 3, lng: 3 } },
            { id: 'd', placeId: 'pd', name: 'D', address: '4', location: { lat: 4, lng: 4 } }
          ]
        }
      ],
      chips: [],
      assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
    };

    (facade as any)._searchStore.response.set(mockResponse);
    fixture.detectChanges();

    const flat = component.flatResults();
    expect(flat.map(r => r.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('should open bottom sheet on chip click (mobile)', () => {
    component.onChipClick('toprated');
    fixture.detectChanges();

    expect(component.bottomSheetVisible()).toBe(true);
  });

  it('should close bottom sheet when closeBottomSheet is called', () => {
    component.bottomSheetVisible.set(true);
    expect(component.bottomSheetVisible()).toBe(true);

    component.closeBottomSheet();
    expect(component.bottomSheetVisible()).toBe(false);
  });

  it('should generate highlighted results (max 3)', () => {
    const mockResponse: any = {
      groups: [
        {
          kind: 'EXACT',
          results: [
            { id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 }, rating: 4.0 },
            { id: '2', placeId: 'p2', name: 'R2', address: 'A2', location: { lat: 2, lng: 2 }, rating: 4.8, openNow: true },
            { id: '3', placeId: 'p3', name: 'R3', address: 'A3', location: { lat: 3, lng: 3 }, rating: 4.5 },
            { id: '4', placeId: 'p4', name: 'R4', address: 'A4', location: { lat: 4, lng: 4 }, rating: 4.2 },
            { id: '5', placeId: 'p5', name: 'R5', address: 'A5', location: { lat: 5, lng: 5 }, rating: 4.1 }
          ]
        }
      ],
      chips: [],
      assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
    };

    (facade as any)._searchStore.response.set(mockResponse);
    fixture.detectChanges();

    const highlighted = component.highlightedResults();
    
    // Should return max 3 unique results
    expect(highlighted.length).toBeLessThanOrEqual(3);
    expect(highlighted.length).toBeGreaterThan(0);
    
    // Should include top rated and/or open now
    const hasTopRated = highlighted.some(r => r.rating === 4.8);
    const hasOpenNow = highlighted.some(r => r.openNow === true);
    
    expect(hasTopRated || hasOpenNow).toBe(true);
  });

  it('should hide assistant strip in favor of bottom sheet/panel', () => {
    const mockResponse: any = {
      groups: [
        {
          kind: 'EXACT',
          results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }]
        }
      ],
      chips: [{ id: 'toprated', emoji: '⭐', label: 'Top Rated', action: 'filter' }],
      assist: { type: 'guide', mode: 'NORMAL', message: 'Found results', failureReason: 'NONE' }
    };

    (facade as any)._searchStore.response.set(mockResponse);
    fixture.detectChanges();

    // Old assistant strip should not exist (replaced by bottom sheet + desktop panel)
    const assistantStrip = fixture.nativeElement.querySelector('app-assistant-strip');
    expect(assistantStrip).toBeFalsy();
    
    // New components should exist
    const bottomSheet = fixture.nativeElement.querySelector('app-assistant-bottom-sheet');
    const desktopPanel = fixture.nativeElement.querySelector('app-assistant-desktop-panel');
    
    expect(bottomSheet || desktopPanel).toBeTruthy();
  });

  it('should render chips on mobile', () => {
    const mockResponse: any = {
      groups: [
        {
          kind: 'EXACT',
          results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }]
        }
      ],
      chips: [
        { id: 'chip1', emoji: '⭐', label: 'Top Rated', action: 'filter' },
        { id: 'chip2', emoji: '💰', label: 'Budget', action: 'filter' }
      ],
      assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
    };

    (facade as any)._searchStore.response.set(mockResponse);
    fixture.detectChanges();

    const chipsMobile = fixture.nativeElement.querySelector('.chips-mobile');
    expect(chipsMobile).toBeTruthy();
    
    const chips = chipsMobile.querySelectorAll('.chip');
    expect(chips.length).toBe(2);
  });
});

