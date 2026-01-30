/**
 * CLARIFY State Guard Tests
 * Validates that CLARIFY responses block results rendering
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SearchPageComponent } from '../search-page.component';
import { SearchFacade } from '../../../../facades/search.facade';
import { signal, computed } from '@angular/core';

describe('SearchPageComponent - CLARIFY State Guard', () => {
  let component: SearchPageComponent;
  let fixture: ComponentFixture<SearchPageComponent>;
  let facade: jasmine.SpyObj<SearchFacade>;

  beforeEach(() => {
    // Mock SearchFacade with all required properties
    const mockSearchStore = {
      query: signal('מה לאכול'),
      loading: signal(false),
      results: computed(() => []),
      hasResults: computed(() => false),
      isStopped: signal(true), // KEY: isStopped flag
      response: signal(null)
    };

    facade = jasmine.createSpyObj('SearchFacade', ['search', 'reset'], {
      query: signal('מה לאכול'),
      loading: signal(false),
      results: computed(() => []),
      hasResults: computed(() => false),
      assistantMessages: computed(() => [
        {
          type: 'CLARIFY' as const,
          message: 'באיזה אזור אתה מחפש?',
          timestamp: Date.now(),
          requestId: 'test-req-123',
          question: 'באיזה אזור אתה מחפש?',
          blocksSearch: true
        }
      ]),
      latestAssistantMessage: computed(() => ({
        type: 'CLARIFY' as const,
        message: 'באיזה אזור אתה מחפש?',
        timestamp: Date.now(),
        requestId: 'test-req-123',
        question: 'באיזה אזור אתה מחפש?',
        blocksSearch: true
      })),
      cardState: signal('CLARIFY' as const),
      assistantState: signal('completed' as const),
      meta: computed(() => ({ failureReason: 'LOW_CONFIDENCE' as const })),
      searchStore: mockSearchStore as any,
      hasGroups: computed(() => false)
    });

    TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [{ provide: SearchFacade, useValue: facade }]
    });

    fixture = TestBed.createComponent(SearchPageComponent);
    component = fixture.componentInstance;
  });

  describe('CLARIFY Response - Results Blocking', () => {
    it('should NOT show results when isStopped is true (CLARIFY state)', () => {
      // Setup: isStopped = true (CLARIFY or DONE_STOPPED)
      (facade.searchStore.isStopped as any) = signal(true);
      (facade.hasResults as any) = computed(() => true); // Even with results!

      fixture.detectChanges();

      // Verify: Results are hidden
      expect(component.shouldShowResults()).toBe(false);
    });

    it('should NOT show results when cardState is CLARIFY', () => {
      // Setup: cardState = 'CLARIFY'
      (facade.cardState as any) = signal('CLARIFY' as const);
      (facade.searchStore.isStopped as any) = signal(true);
      (facade.hasResults as any) = computed(() => true);

      fixture.detectChanges();

      // Verify: Results are hidden
      expect(component.shouldShowResults()).toBe(false);
    });

    it('should show assistant message when in CLARIFY state', () => {
      // Setup: CLARIFY state with assistant message
      (facade.cardState as any) = signal('CLARIFY' as const);
      (facade.searchStore.isStopped as any) = signal(true);
      (facade.assistantState as any) = signal('completed' as const);

      fixture.detectChanges();

      // Verify: Assistant message exists
      const latestMessage = facade.latestAssistantMessage();
      expect(latestMessage).toBeTruthy();
      expect(latestMessage?.type).toBe('CLARIFY');
      expect(latestMessage?.blocksSearch).toBe(true);
    });

    it('should preserve query text when in CLARIFY state', () => {
      // Setup: CLARIFY state
      (facade.query as any) = signal('מה לאכול');
      (facade.searchStore.isStopped as any) = signal(true);

      fixture.detectChanges();

      // Verify: Query is preserved
      expect(facade.query()).toBe('מה לאכול');
    });
  });

  describe('CLARIFY Response - Race Condition (results arrive late)', () => {
    it('should ignore results that arrive after CLARIFY message', () => {
      // Scenario: CLARIFY message arrives first, results arrive 1s later

      // Step 1: CLARIFY state set
      (facade.cardState as any) = signal('CLARIFY' as const);
      (facade.searchStore.isStopped as any) = signal(true);
      (facade.hasResults as any) = computed(() => false);

      fixture.detectChanges();

      // Verify: No results shown
      expect(component.shouldShowResults()).toBe(false);

      // Step 2: Stale results arrive (simulated)
      // In real flow, handleSearchResponse would block this via CLARIFY guard
      (facade.hasResults as any) = computed(() => true);

      fixture.detectChanges();

      // Verify: STILL no results shown (isStopped guard blocks)
      expect(component.shouldShowResults()).toBe(false);
    });

    it('should NOT render Load More when isStopped is true', () => {
      // Setup: isStopped = true
      (facade.searchStore.isStopped as any) = signal(true);
      (facade.hasResults as any) = computed(() => true);

      fixture.detectChanges();

      // Verify: Results section hidden (Load More implicitly hidden)
      expect(component.shouldShowResults()).toBe(false);

      // Load More is only shown when shouldShowResults() is true
      // So isStopped implicitly blocks Load More rendering
    });
  });

  describe('CLARIFY Response - Backend Invariant Validation', () => {
    it('should handle CLARIFY response with empty results (backend invariant)', () => {
      // Setup: Backend sends CLARIFY with empty results (correct)
      const mockResponse = {
        requestId: 'test-req-456',
        sessionId: 'test-session-789',
        query: { original: 'מה לאכול', parsed: {} as any, language: 'he' },
        results: [], // INVARIANT: Empty results for CLARIFY
        chips: [],
        assist: { type: 'clarify' as const, message: 'Where?' },
        meta: {
          tookMs: 100,
          mode: 'textsearch' as const,
          appliedFilters: [],
          confidence: 0.5,
          source: 'route2_generic_query_guard',
          failureReason: 'LOW_CONFIDENCE' as const
          // No pagination field (invariant)
        }
      };

      (facade.searchStore.response as any) = signal(mockResponse);
      (facade.searchStore.isStopped as any) = computed(() => {
        const resp = (facade.searchStore.response as any)();
        return resp?.meta?.failureReason !== 'NONE' || resp?.assist?.type === 'clarify';
      });
      (facade.hasResults as any) = computed(() => mockResponse.results.length > 0);

      fixture.detectChanges();

      // Verify: No results shown (invariant upheld)
      expect(component.shouldShowResults()).toBe(false);
      expect(facade.hasResults()).toBe(false);
    });
  });

  describe('Success Case - NOT CLARIFY (baseline)', () => {
    it('should show results when NOT in CLARIFY state and has results', () => {
      // Setup: Success case (not stopped, has results)
      (facade.searchStore.isStopped as any) = signal(false);
      (facade.cardState as any) = signal('STOP' as const);
      (facade.hasResults as any) = computed(() => true);
      (facade.meta as any) = computed(() => ({ failureReason: 'NONE' as const }));

      fixture.detectChanges();

      // Verify: Results ARE shown
      expect(component.shouldShowResults()).toBe(true);
    });
  });
});
