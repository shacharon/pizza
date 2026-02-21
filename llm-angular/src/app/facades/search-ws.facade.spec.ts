/**
 * SearchWsHandler – activeRequestId guard
 * Proves that events for a non-active requestId are dropped and do not update UI.
 */

import { TestBed } from '@angular/core/testing';
import { SearchWsHandler, SearchEventHandlers } from './search-ws.facade';
import { WsClientService } from '../core/services/ws-client.service';
import { AuthService } from '../core/auth/auth.service';
import { AssistantSseService } from '../core/services/assistant-sse.service';
import { ActiveRequestIdService } from '../state/active-request-id.service';
import { CONTRACTS_VERSION } from '../contracts/search.contracts';
import type { SearchResponse } from '../domain/types/search.types';

describe('SearchWsHandler - activeRequestId guard', () => {
  let handler: SearchWsHandler;
  let onSearchResponseSpy: jasmine.Spy;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SearchWsHandler,
        { provide: WsClientService, useValue: jasmine.createSpyObj('WsClientService', ['connect', 'subscribe', 'ensureWsAuthed'], { messages$: { subscribe: () => ({ unsubscribe: () => {} }) }, connectionStatus: jasmine.createSpy().and.returnValue('connected') }) },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['getSessionId'], { getSessionId: () => 'session-1' }) },
        { provide: AssistantSseService, useValue: jasmine.createSpyObj('AssistantSseService', ['connect']) },
        ActiveRequestIdService
      ]
    });
    handler = TestBed.inject(SearchWsHandler);
    onSearchResponseSpy = jasmine.createSpy('onSearchResponse');
  });

  it('drops search event when event.requestId !== activeRequestId (onSearchResponse not called)', () => {
    const activeRequestId = 'req-B';
    const event = {
      channel: 'search' as const,
      contractsVersion: CONTRACTS_VERSION,
      type: 'ready' as const,
      requestId: 'req-A',
      ts: new Date().toISOString(),
      stage: 'done' as const,
      ready: 'results' as const,
      decision: 'CONTINUE' as const
    };
    const handlers: SearchEventHandlers = {
      onSearchResponse: onSearchResponseSpy,
      onError: jasmine.createSpy('onError'),
      onProgress: jasmine.createSpy('onProgress')
    };
    const fetchResult = jasmine.createSpy('fetchResult').and.returnValue(Promise.resolve({ requestId: 'req-A', results: [], groups: [], chips: [], meta: {} } as SearchResponse));

    handler.handleSearchEvent(
      event,
      activeRequestId,
      handlers,
      fetchResult,
      () => {},
      () => {},
      'pizza'
    );

    expect(onSearchResponseSpy).not.toHaveBeenCalled();
    expect(fetchResult).not.toHaveBeenCalled();
  });
});
