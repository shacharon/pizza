/**
 * Session API Client Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SessionApiClient } from './session.api';
import type { SessionState } from '../domain/types/session.types';

describe('SessionApiClient', () => {
  let service: SessionApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SessionApiClient]
    });

    service = TestBed.inject(SessionApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should create session', (done) => {
    const mockResponse = { sessionId: 'session-123' };

    service.createSession().subscribe({
      next: (response) => {
        expect(response.sessionId).toBe('session-123');
        done();
      }
    });

    const req = httpMock.expectOne('/api/session');
    expect(req.request.method).toBe('POST');
    req.flush(mockResponse);
  });

  it('should get session', (done) => {
    const sessionId = 'session-123';
    const mockSession: SessionState = {
      conversationId: sessionId,
      locale: 'en',
      region: 'US',
      selectedRestaurant: null,
      preferences: {
        savedFavorites: [],
        recentSearches: []
      }
    };

    service.getSession(sessionId).subscribe({
      next: (session) => {
        expect(session.conversationId).toBe(sessionId);
        expect(session.locale).toBe('en');
        done();
      }
    });

    const req = httpMock.expectOne(`/api/session/${sessionId}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockSession);
  });

  it('should handle errors', (done) => {
    service.createSession().subscribe({
      error: (error) => {
        expect(error.message).toContain('Session request failed');
        done();
      }
    });

    const req = httpMock.expectOne('/api/session');
    req.flush({ error: 'Failed' }, { status: 500, statusText: 'Server Error' });
  });
});


