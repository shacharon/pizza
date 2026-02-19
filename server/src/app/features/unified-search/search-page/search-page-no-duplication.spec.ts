/**
 * UI/UX Regression Tests - No Duplicate Control Surfaces
 * Enforces single source of truth for sorting/filtering
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('SearchPageComponent - No Duplicate Control Surfaces', () => {
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

  describe('Single Source of Truth - Chips Row', () => {
    it('should render exactly ONE chips row on the page', () => {
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
          { id: 'budget', emoji: '💰', label: 'Budget', action: 'filter' }
        ],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found results', failureReason: 'NONE' }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      // Count all chip containers
      const chipContainers = fixture.nativeElement.querySelectorAll('.chips-mobile, .refinement-chips, .assistant-chips');
      expect(chipContainers.length).toBe(1);
      
      // Verify it's the chips-mobile (our single source of truth)
      expect(fixture.nativeElement.querySelector('.chips-mobile')).toBeTruthy();
    });

    it('should NOT render old AssistantStripComponent', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [{ id: 'test', emoji: '⭐', label: 'Test', action: 'filter' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const assistantStrip = fixture.nativeElement.querySelector('app-assistant-strip');
      expect(assistantStrip).toBeFalsy();
    });

    it('should NOT render duplicate refinement chips section', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [{ id: 'test', emoji: '⭐', label: 'Test', action: 'filter' }],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const refinementChips = fixture.nativeElement.querySelector('.refinement-chips');
      expect(refinementChips).toBeFalsy();
    });
  });

  describe('Single Results List', () => {
    it('should render exactly ONE results list', () => {
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
        chips: [],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const resultsLists = fixture.nativeElement.querySelectorAll('.results-list');
      expect(resultsLists.length).toBe(1);
    });

    it('should NOT render grouped sections (no EXACT/NEARBY splits)', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] },
          { kind: 'NEARBY', results: [{ id: '2', placeId: 'p2', name: 'R2', address: 'A2', location: { lat: 2, lng: 2 } }] }
        ],
        chips: [],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Test', failureReason: 'NONE' }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const resultGroups = fixture.nativeElement.querySelectorAll('.result-group');
      expect(resultGroups.length).toBe(0);
    });
  });

  describe('Conditional Assistant', () => {
    it('should NOT show assistant when results exist and confidence is high', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Found results', failureReason: 'NONE' },
        meta: { confidence: 0.85, tookMs: 500 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.showAssistant()).toBe(false);
      
      const desktopPanel = fixture.nativeElement.querySelector('app-assistant-desktop-panel');
      expect(desktopPanel).toBeFalsy();
    });

    it('should show assistant when no results', () => {
      const mockResponse: any = {
        groups: [],
        results: [],
        chips: [],
        assist: { type: 'recovery', mode: 'RECOVERY', message: 'No results found', failureReason: 'NO_RESULTS' },
        meta: { confidence: 0.9, tookMs: 500 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.showAssistant()).toBe(true);
    });

    it('should show assistant when confidence is low (<60%)', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [],
        assist: { type: 'guide', mode: 'NORMAL', message: 'Low confidence', failureReason: 'NONE' },
        meta: { confidence: 0.45, tookMs: 500 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.showAssistant()).toBe(true);
    });

    it('should show assistant in RECOVERY mode', () => {
      const mockResponse: any = {
        groups: [
          { kind: 'EXACT', results: [{ id: '1', placeId: 'p1', name: 'R1', address: 'A1', location: { lat: 1, lng: 1 } }] }
        ],
        chips: [],
        assist: { type: 'recovery', mode: 'RECOVERY', message: 'Trying alternatives', failureReason: 'NONE' },
        meta: { confidence: 0.9, tookMs: 500 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.showAssistant()).toBe(true);
    });

    it('should show assistant in CLARIFY mode', () => {
      const mockResponse: any = {
        groups: [],
        results: [],
        chips: [],
        assist: { type: 'guide', mode: 'CLARIFY', message: 'Need clarification', failureReason: 'AMBIGUOUS' },
        meta: { confidence: 0.9, tookMs: 500 }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      expect(component.showAssistant()).toBe(true);
    });
  });

  describe('Chip Click Behavior', () => {
    it('should call facade.onChipClick (not open bottom sheet)', () => {
      spyOn(facade, 'onChipClick');
      
      component.onChipClick('toprated');
      
      expect(facade.onChipClick).toHaveBeenCalledWith('toprated');
      expect(component.bottomSheetVisible()).toBe(false);
    });
  });

  describe('Desktop Panel - No Duplicate Chips', () => {
    it('should pass empty chips array to desktop panel (no duplication)', () => {
      const mockResponse: any = {
        groups: [],
        results: [],
        chips: [{ id: 'test', emoji: '⭐', label: 'Test', action: 'filter' }],
        assist: { type: 'recovery', mode: 'RECOVERY', message: 'Test', failureReason: 'NO_RESULTS' }
      };

      (facade as any)._searchStore.response.set(mockResponse);
      fixture.detectChanges();

      const desktopPanel = fixture.nativeElement.querySelector('app-assistant-desktop-panel');
      if (desktopPanel) {
        // Check that chips input is empty (ng-reflect-chips="")
        const chipsAttr = desktopPanel.getAttribute('ng-reflect-chips');
        expect(chipsAttr).toBe('');
      }
    });
  });
});

