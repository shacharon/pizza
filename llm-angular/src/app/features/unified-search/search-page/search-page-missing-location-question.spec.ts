import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { SearchPageComponent, missingLocationCopy } from './search-page.component';
import { SearchFacade } from '../../../facades/search.facade';
import { SearchStateHandler } from '../../../facades/search-state.facade';
import { InputStateMachine } from '../../../services/input-state-machine.service';
import { LocationService } from '../../../services/location.service';
import { PwaInstallService } from '../../../services/pwa-install.service';
import { I18nService } from '../../../core/services/i18n.service';
import type { AssistPayload, Restaurant, SearchResponse } from '../../../domain/types/search.types';

const he = missingLocationCopy('פיצה');
const en = missingLocationCopy('pizza');

const place = { id: '1', name: 'Pizza Place' } as Restaurant;

function searchResponse(assist: AssistPayload, results: Restaurant[]): SearchResponse {
  return {
    requestId: 'req-1',
    query: { original: 'פיצה', parsed: null, language: 'he' },
    results,
    chips: [],
    assist,
    meta: {
      tookMs: 1,
      mode: 'textsearch',
      appliedFilters: [],
      confidence: 0.9,
      source: 'route2',
      failureReason: 'NONE'
    }
  } as SearchResponse;
}

const missingLocation = searchResponse({
  type: 'clarify',
  reason: 'MISSING_LOCATION',
  suggestedAction: 'ASK_LOCATION',
  message: he.message,
  question: he.question
}, [place]);

describe('SearchPageComponent missing location question', () => {
  let locationState: 'OFF' | 'ON';
  let response: SearchResponse | null;
  let query: string;

  function create() {
    const facade = {
      requestId: () => 'req-1',
      response: () => response,
      results: () => response?.results ?? [],
      hasResults: () => (response?.results?.length ?? 0) > 0,
      hasGroups: () => false,
      loading: () => false,
      meta: () => response?.meta ?? null,
      query: () => query,
      error: () => null,
      assistantState: () => 'idle',
      assistantError: () => null,
      assistantNarration: () => '',
      assistantLineMessages: () => [],
      assistantCardMessages: () => [],
      assistantMessages: () => [],
      assistantMessageRequestId: () => null,
      isLocationRequiredClarify: () => false,
      showRecentSearches: () => false,
      hasRecentSearches: () => false,
      requiresClarification: () => false,
      clarification: () => null,
      selectedRestaurant: () => null,
      pendingActions: () => [],
      cleanupExpiredActions: jest.fn(),
      restoreStateFromParams: jest.fn()
    };

    TestBed.overrideComponent(SearchPageComponent, {
      set: {
        providers: [
          { provide: SearchFacade, useValue: facade },
          { provide: SearchStateHandler, useValue: { setSort: jest.fn(), setActiveFilterIds: jest.fn() } }
        ]
      }
    });

    TestBed.configureTestingModule({
      imports: [SearchPageComponent],
      providers: [
        { provide: Router, useValue: { navigate: jest.fn() } },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: { subscribe: () => ({ unsubscribe() {} }) } }
        },
        { provide: InputStateMachine, useValue: {} },
        {
          provide: LocationService,
          useValue: { state: () => locationState, location: () => null, blockedRetries: () => 0 }
        },
        { provide: PwaInstallService, useValue: {} },
        { provide: I18nService, useValue: { t: (key: string) => key } }
      ]
    });

    const fixture = TestBed.createComponent(SearchPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    locationState = 'OFF';
    response = missingLocation;
    query = 'פיצה';
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the location row under the search box when location is off', () => {
    const fixture = create();
    const prompt = fixture.nativeElement.querySelector('.search-dock .missing-location-question') as HTMLElement;
    const text = prompt.textContent as string;
    expect(fixture.componentInstance.showMissingLocationQuestion()).toBe(true);
    expect(fixture.componentInstance.shouldShowResults()).toBe(true);
    expect(fixture.nativeElement.querySelector('.results-grid .missing-location-question')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Enable location for better results');
    expect(prompt.getAttribute('dir')).toBe('rtl');
    expect(text).toContain(he.message);
    expect(text).toContain(he.question);
    expect(prompt.querySelector('button')?.textContent).toContain(he.button);
  });

  it('uses English when the search is in English', () => {
    query = 'pizza';
    const fixture = create();
    const prompt = fixture.nativeElement.querySelector('.search-dock .missing-location-question') as HTMLElement;
    expect(prompt.getAttribute('dir')).toBe('ltr');
    expect(prompt.textContent).toContain(en.message);
    expect(prompt.textContent).toContain(en.button);
  });

  it('hides the question for a guide assist', () => {
    response = searchResponse({ type: 'guide', message: '' }, [place]);
    const fixture = create();
    expect(fixture.componentInstance.showMissingLocationQuestion()).toBe(false);
    expect(fixture.componentInstance.shouldShowResults()).toBe(true);
    expect(fixture.nativeElement.textContent as string).not.toContain(he.question);
  });

  it('hides the question when GPS is on', () => {
    locationState = 'ON';
    const fixture = create();
    expect(fixture.componentInstance.showMissingLocationQuestion()).toBe(false);
    expect(fixture.nativeElement.textContent as string).not.toContain(he.question);
  });

  it('hides the question and the list when there are no places', () => {
    response = searchResponse(missingLocation.assist, []);
    const fixture = create();
    expect(fixture.componentInstance.showMissingLocationQuestion()).toBe(false);
    expect(fixture.componentInstance.shouldShowResults()).toBe(false);
  });
});
