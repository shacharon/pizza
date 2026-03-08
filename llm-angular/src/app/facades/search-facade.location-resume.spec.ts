/**
 * Search Facade – Missing-location auto-resume tests
 * Covers: permission requested, grant→resume, deny→fallback, no duplicate search,
 * no auto-prompt when location not required, pending cleared after flow.
 */

import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { SearchFacade } from './search.facade';
import { SearchApiHandler } from './search-api.facade';
import { LocationService } from '../services/location.service';
import { SearchStore } from '../state/search.store';
import { SessionStore } from '../state/session.store';
import { ActionsStore } from '../state/actions.store';
import { ActiveRequestIdService } from '../state/active-request-id.service';
import { InputStateMachine } from '../services/input-state-machine.service';
import { RecentSearchesService } from '../services/recent-searches.service';
import { SearchWsHandler } from './search-ws.facade';
import { SearchAssistantHandler } from './search-assistant.facade';
import { SearchStateHandler } from './search-state.facade';
import { I18nService } from '../core/services/i18n.service';
import { ActionService } from '../services/action.service';
import type { SearchResponse } from '../domain/types/search.types';

function locationRequiredResponse(requestId: string, query: string): SearchResponse {
  return {
    requestId,
    sessionId: 'sess-1',
    query: {
      original: query,
      parsed: {} as any,
      language: 'he'
    },
    results: [],
    chips: [],
    assist: { type: 'clarify', message: 'Need location' },
    meta: {
      tookMs: 10,
      mode: 'textsearch',
      appliedFilters: [],
      confidence: 0.9,
      source: 'route2_textsearch_location_clarify',
      failureReason: 'LOCATION_REQUIRED',
      locationRequired: true,
      locationResume: { query }
    }
  };
}

function successResponse(requestId: string, query: string): SearchResponse {
  return {
    requestId,
    sessionId: 'sess-1',
    query: { original: query, parsed: {} as any, language: 'he' },
    results: [{ id: '1', placeId: 'p1', name: 'Pizza Place', address: '', location: { lat: 32, lng: 34 } } as any],
    chips: [],
    assist: { type: 'guide', message: 'Found results' },
    meta: {
      tookMs: 100,
      mode: 'textsearch',
      appliedFilters: [],
      confidence: 1,
      source: 'route2',
      failureReason: 'NONE'
    }
  };
}

describe('SearchFacade – Missing-location auto-resume', () => {
  let facade: SearchFacade;
  let apiHandler: jasmine.SpyObj<SearchApiHandler>;
  let locationService: jasmine.SpyObj<LocationService>;
  let searchStore: SearchStore;

  let resolveLocationPromise: () => void;
  let locationState: 'OFF' | 'REQUESTING' | 'ON' | 'DENIED' | 'ERROR';

  beforeEach(() => {
    locationState = 'OFF';
    const locationPromise = new Promise<void>((resolve) => {
      resolveLocationPromise = () => {
        locationState = 'ON';
        resolve();
      };
    });

    const apiHandlerSpy = jasmine.createSpyObj<SearchApiHandler>('SearchApiHandler', [
      'executeSearch',
      'cancelPolling',
      'startPolling',
      'cancelPollingStart',
      'fetchResult'
    ]);

    apiHandlerSpy.executeSearch.and.returnValue(
      Promise.resolve(locationRequiredResponse('req-loc-1', 'pizza'))
    );
    apiHandlerSpy.cancelPolling.and.stub();
    apiHandlerSpy.startPolling.and.stub();
    apiHandlerSpy.cancelPollingStart.and.stub();
    apiHandlerSpy.fetchResult.and.returnValue(Promise.resolve(null));

    const locationServiceSpy = jasmine.createSpyObj(
      'LocationService',
      ['requestLocation', 'disableLocation']
    );
    locationServiceSpy.requestLocation.and.returnValue(locationPromise);
    locationServiceSpy.location = jasmine.createSpy().and.returnValue({ lat: 32.08, lng: 34.78 });
    Object.defineProperty(locationServiceSpy, 'state', {
      get: () => () => locationState,
      configurable: true
    });
    locationService = locationServiceSpy;

    TestBed.configureTestingModule({
      providers: [
        SearchFacade,
        SearchStore,
        { provide: SearchApiHandler, useValue: apiHandlerSpy },
        { provide: LocationService, useValue: locationServiceSpy },
        {
          provide: SearchWsHandler,
          useValue: jasmine.createSpyObj('SearchWsHandler', [
            'connect',
            'subscribeToMessages',
            'clearAllSubscriptions',
            'subscribeToRequest',
            'handleMessage',
            'handleSearchEvent'
          ], { connectionStatus: jasmine.createSpy().and.returnValue('connected') })
        },
        {
          provide: SearchAssistantHandler,
          useValue: jasmine.createSpyObj('SearchAssistantHandler', [
            'reset',
            'setStatus',
            'setError',
            'routeMessage',
            'handleLegacyMessage'
          ], {
            messages: jasmine.createSpy().and.returnValue([]),
            lineMessages: jasmine.createSpy().and.returnValue([]),
            cardMessages: jasmine.createSpy().and.returnValue([]),
            narration: jasmine.createSpy().and.returnValue(''),
            status: jasmine.createSpy().and.returnValue('idle'),
            error: jasmine.createSpy().and.returnValue(null),
            requestId: jasmine.createSpy().and.returnValue(null),
            blocksSearch: jasmine.createSpy().and.returnValue(false),
            recommendations: jasmine.createSpy().and.returnValue([])
          })
        },
        {
          provide: SearchStateHandler,
          useValue: jasmine.createSpyObj('SearchStateHandler', ['handleChipClick'], {
            currentSort: jasmine.createSpy().and.returnValue('BEST_MATCH'),
            activeFilters: jasmine.createSpy().and.returnValue([]),
            currentView: jasmine.createSpy().and.returnValue('LIST')
          })
        },
        {
          provide: InputStateMachine,
          useValue: jasmine.createSpyObj('InputStateMachine', ['input', 'submit', 'searchComplete', 'searchFailed', 'intentReset'], {
            state: jasmine.createSpy().and.returnValue('IDLE'),
            query: jasmine.createSpy().and.returnValue('pizza'),
            showRecentSearches: jasmine.createSpy().and.returnValue(false),
            showClearButton: jasmine.createSpy().and.returnValue(false),
            canSubmit: jasmine.createSpy().and.returnValue(true)
          })
        },
        {
          provide: SessionStore,
          useValue: jasmine.createSpyObj('SessionStore', ['setLocale', 'setRegion'], {
            selectedRestaurant: jasmine.createSpy().and.returnValue(null),
            conversationId: jasmine.createSpy().and.returnValue('sess-1'),
            locale: jasmine.createSpy().and.returnValue('en'),
            preferences: jasmine.createSpy().and.returnValue({})
          })
        },
        {
          provide: ActionsStore,
          useValue: jasmine.createSpyObj('ActionsStore', [], {
            pending: jasmine.createSpy().and.returnValue([]),
            executed: jasmine.createSpy().and.returnValue([])
          })
        },
        { provide: ActiveRequestIdService, useValue: jasmine.createSpyObj('ActiveRequestIdService', ['set']) },
        {
          provide: RecentSearchesService,
          useValue: jasmine.createSpyObj('RecentSearchesService', ['add', 'clear'], {
            searches: jasmine.createSpy().and.returnValue([]),
            hasSearches: jasmine.createSpy().and.returnValue(false)
          })
        },
        {
          provide: I18nService,
          useValue: jasmine.createSpyObj('I18nService', ['setLanguage'], {
            currentLang: jasmine.createSpy().and.returnValue('en')
          })
        },
        { provide: ActionService, useValue: jasmine.createSpyObj('ActionService', ['proposeAction', 'approveAction']) }
      ]
    });

    facade = TestBed.inject(SearchFacade);
    apiHandler = TestBed.inject(SearchApiHandler) as jasmine.SpyObj<SearchApiHandler>;
  });

  it('query with no location -> permission requested', fakeAsync(() => {
    facade.search('pizza');
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledWith(
      jasmine.objectContaining({
        query: 'pizza',
        userLocation: undefined
      })
    );
    expect(locationService.requestLocation).toHaveBeenCalled();
  }));

  it('permission granted -> original query resumes automatically', fakeAsync(() => {
    facade.search('pizza');
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(1);
    resolveLocationPromise();
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(2);
    const secondCall = (apiHandler.executeSearch as jasmine.Spy).calls.argsFor(1)[0];
    expect(secondCall.query).toBe('pizza');
    expect(secondCall.userLocation).toEqual({ lat: 32.08, lng: 34.78 });
  }));

  it('permission denied -> fallback asks for city/area', fakeAsync(() => {
    locationState = 'DENIED';
    locationService.requestLocation.and.returnValue(Promise.resolve());

    facade.search('pizza');
    tick(0);
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(1);
    expect(facade.isLocationRequiredClarify()).toBe(true);
    expect(facade.isWaitingForClarification()).toBe(true);
  }));

  it('no duplicate search after resume', fakeAsync(() => {
    (apiHandler.executeSearch as jasmine.Spy).calls.reset();
    apiHandler.executeSearch.and.returnValues(
      Promise.resolve(locationRequiredResponse('req-1', 'pizza')),
      Promise.resolve(successResponse('req-2', 'pizza'))
    );

    facade.search('pizza');
    tick(0);
    resolveLocationPromise();
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(2);
    tick(100);
    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(2);
  }));

  it('no auto-prompt when location is not required', fakeAsync(() => {
    apiHandler.executeSearch.and.returnValue(
      Promise.resolve(successResponse('req-ok', 'pizza in tel aviv'))
    );

    facade.search('pizza in tel aviv');
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(1);
    expect(locationService.requestLocation).not.toHaveBeenCalled();
    expect(facade.isLocationRequiredClarify()).toBe(false);
  }));

  it('pending query cleared after flow completes (success path)', fakeAsync(() => {
    apiHandler.executeSearch.and.returnValues(
      Promise.resolve(locationRequiredResponse('req-a', 'pizza')),
      Promise.resolve(successResponse('req-b', 'pizza'))
    );

    facade.search('pizza');
    tick(0);
    resolveLocationPromise();
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(2);

    (apiHandler.executeSearch as jasmine.Spy).calls.reset();
    apiHandler.executeSearch.and.returnValue(
      Promise.resolve(successResponse('req-c', 'burger'))
    );
    facade.search('burger');
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(1);
    expect(apiHandler.executeSearch.calls.mostRecent().args[0].query).toBe('burger');
  }));

  it('pending query cleared after flow completes (denial path)', fakeAsync(() => {
    locationState = 'DENIED';
    locationService.requestLocation.and.returnValue(Promise.resolve());

    facade.search('pizza');
    tick(0);
    tick(0);

    (apiHandler.executeSearch as jasmine.Spy).calls.reset();
    apiHandler.executeSearch.and.returnValue(
      Promise.resolve(successResponse('req-next', 'burger'))
    );
    facade.search('burger');
    tick(0);

    expect(apiHandler.executeSearch).toHaveBeenCalledTimes(1);
    expect(apiHandler.executeSearch.calls.mostRecent().args[0].query).toBe('burger');
  }));

  it('guard against duplicate resume when same response delivered twice', fakeAsync(() => {
    const sameResponse = locationRequiredResponse('req-dup', 'pizza');
    apiHandler.executeSearch.and.returnValue(Promise.resolve(sameResponse));

    facade.search('pizza');
    tick(0);

    const handleResponse = (facade as any).handleSearchResponse.bind(facade);
    handleResponse(sameResponse, 'pizza');
    tick(0);

    expect(locationService.requestLocation).toHaveBeenCalledTimes(1);
  }));
});
