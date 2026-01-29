/**
 * Auth API Service Tests
 * Focus: WS ticket request with JWT hardening
 */

import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthApiService, WSTicketResponse } from './auth-api.service';
import { AuthService } from '../auth/auth.service';
import { environment } from '../../../environments/environment';

describe('AuthApiService - WS Ticket with JWT Hardening', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;
  let mockAuthService: Partial<AuthService>;
  let getTokenSpy: jest.Mock;
  let clearTokenSpy: jest.Mock;

  const mockToken = 'mock.jwt.token';
  const mockSessionId = 'sess_12345678-1234-1234-1234-123456789012';
  const ticketUrl = `${environment.apiUrl}${environment.apiBasePath}/auth/ws-ticket`;

  beforeEach(() => {
    // Create mock AuthService with Jest spies
    getTokenSpy = jest.fn().mockResolvedValue(mockToken);
    clearTokenSpy = jest.fn();

    mockAuthService = {
      getToken: getTokenSpy,
      clearToken: clearTokenSpy
    };

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthApiService,
        { provide: AuthService, useValue: mockAuthService }
      ]
    });

    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);

    // Mock localStorage for session ID
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(mockSessionId);
  });

  afterEach(() => {
    httpMock.verify(); // Verify no outstanding HTTP requests
    jest.restoreAllMocks();
  });

  it('should include Authorization Bearer header in ticket request', fakeAsync(() => {
    const mockResponse: WSTicketResponse = {
      ticket: 'test-ticket-123',
      expiresInSeconds: 60,
      traceId: 'trace-123'
    };

    let receivedResponse: WSTicketResponse | undefined;

    service.requestWSTicket().subscribe({
      next: (response) => {
        receivedResponse = response;
      },
      error: (err) => {
        fail(`Should not have failed: ${err}`);
      }
    });

    // Wait for async token fetch
    tick();

    // Verify the HTTP request
    const req = httpMock.expectOne(ticketUrl);
    expect(req.request.method).toBe('POST');

    // Assert Authorization header is present
    expect(req.request.headers.has('Authorization')).toBe(true);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${mockToken}`);

    // Assert X-Session-Id header is present
    expect(req.request.headers.has('X-Session-Id')).toBe(true);
    expect(req.request.headers.get('X-Session-Id')).toBe(mockSessionId);

    req.flush(mockResponse);
    tick();

    expect(receivedResponse).toEqual(mockResponse);
    expect(getTokenSpy).toHaveBeenCalledTimes(1);
  }));

  it('should include X-Session-Id header in ticket request', fakeAsync(() => {
    const mockResponse: WSTicketResponse = {
      ticket: 'test-ticket-456',
      expiresInSeconds: 60,
      traceId: 'trace-456'
    };

    service.requestWSTicket().subscribe({
      error: () => fail('Should not have failed')
    });

    tick(); // Wait for async token fetch

    const req = httpMock.expectOne(ticketUrl);
    expect(req.request.headers.get('X-Session-Id')).toBe(mockSessionId);
    req.flush(mockResponse);
    tick();
  }));

  it('should clear token and retry once on 401 response', fakeAsync(() => {
    const freshToken = 'fresh.jwt.token';
    const mockResponse: WSTicketResponse = {
      ticket: 'test-ticket-retry',
      expiresInSeconds: 60,
      traceId: 'trace-retry'
    };

    // First call returns original token, second call returns fresh token
    getTokenSpy
      .mockResolvedValueOnce(mockToken)
      .mockResolvedValueOnce(freshToken);

    let receivedResponse: WSTicketResponse | undefined;

    service.requestWSTicket().subscribe({
      next: (response) => {
        receivedResponse = response;
      },
      error: (err) => {
        fail(`Should not have failed after retry: ${err}`);
      }
    });

    tick(); // Wait for first token fetch

    // First request with stale token - return 401
    const firstReq = httpMock.expectOne(ticketUrl);
    expect(firstReq.request.headers.get('Authorization')).toBe(`Bearer ${mockToken}`);
    firstReq.flush(
      { error: 'NOT_AUTHORIZED', code: 'INVALID_TOKEN', message: 'Token expired' },
      { status: 401, statusText: 'Unauthorized' }
    );

    tick(); // Wait for retry token fetch

    // Second request with fresh token - succeed
    const secondReq = httpMock.expectOne(ticketUrl);
    expect(secondReq.request.headers.get('Authorization')).toBe(`Bearer ${freshToken}`);
    secondReq.flush(mockResponse);

    tick(); // Complete the observable

    expect(receivedResponse).toEqual(mockResponse);
    expect(clearTokenSpy).toHaveBeenCalledTimes(1);
    expect(getTokenSpy).toHaveBeenCalledTimes(2);
  }));

  it('should fail after retry if 401 persists', fakeAsync(() => {
    getTokenSpy.mockResolvedValue(mockToken);

    let errorReceived: any;

    service.requestWSTicket().subscribe({
      next: () => {
        fail('Should have failed after retry');
      },
      error: (err) => {
        errorReceived = err;
      }
    });

    tick(); // Wait for first token fetch

    // First request - 401
    const firstReq = httpMock.expectOne(ticketUrl);
    firstReq.flush(
      { error: 'NOT_AUTHORIZED', code: 'INVALID_TOKEN' },
      { status: 401, statusText: 'Unauthorized' }
    );

    tick(); // Wait for retry token fetch

    // Second request (retry) - 401 again
    const secondReq = httpMock.expectOne(ticketUrl);
    secondReq.flush(
      { error: 'NOT_AUTHORIZED', code: 'INVALID_TOKEN' },
      { status: 401, statusText: 'Unauthorized' }
    );

    tick(); // Complete error handling

    expect(errorReceived.status).toBe(401);
    expect(clearTokenSpy).toHaveBeenCalledTimes(1);
    expect(getTokenSpy).toHaveBeenCalledTimes(2); // Original + retry
  }));

  it('should not retry on non-401 errors', fakeAsync(() => {
    let errorReceived: any;

    service.requestWSTicket().subscribe({
      next: () => {
        fail('Should have failed');
      },
      error: (err) => {
        errorReceived = err;
      }
    });

    tick(); // Wait for token fetch

    const req = httpMock.expectOne(ticketUrl);
    req.flush(
      { error: 'SERVICE_UNAVAILABLE', message: 'Redis down' },
      { status: 503, statusText: 'Service Unavailable' }
    );

    tick(); // Complete error handling

    expect(errorReceived.status).toBe(503);
    expect(clearTokenSpy).not.toHaveBeenCalled();
    expect(getTokenSpy).toHaveBeenCalledTimes(1); // Only initial call
  }));

  it('should await JWT token before making request', (done) => {
    let tokenResolved = false;

    // Make getToken async
    getTokenSpy.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => {
          tokenResolved = true;
          resolve(mockToken);
        }, 10);
      })
    );

    const mockResponse: WSTicketResponse = {
      ticket: 'test-ticket-async',
      expiresInSeconds: 60,
      traceId: 'trace-async'
    };

    service.requestWSTicket().subscribe({
      next: () => {
        expect(tokenResolved).toBe(true);
        done();
      },
      error: () => fail('Should not have failed')
    });

    // Wait for async token resolution
    setTimeout(() => {
      const req = httpMock.expectOne(ticketUrl);
      req.flush(mockResponse);
    }, 50);
  });

  it('should handle missing session ID gracefully', fakeAsync(() => {
    jest.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);

    const mockResponse: WSTicketResponse = {
      ticket: 'test-ticket-no-session',
      expiresInSeconds: 60,
      traceId: 'trace-no-session'
    };

    service.requestWSTicket().subscribe({
      error: () => fail('Should not have failed')
    });

    tick(); // Wait for token fetch

    const req = httpMock.expectOne(ticketUrl);
    // Should still make request, just with empty session ID
    expect(req.request.headers.get('X-Session-Id')).toBe('');
    req.flush(mockResponse);
    tick();
  }));
});
