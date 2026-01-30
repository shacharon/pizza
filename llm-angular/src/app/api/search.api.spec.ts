/**
 * Search API Client Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SearchApiClient } from './search.api';
import type { SearchRequest, SearchResponse } from '../domain/types/search.types';

describe('SearchApiClient', () => {
  let service: SearchApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SearchApiClient]
    });

    service = TestBed.inject(SearchApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send correct POST request', (done) => {
    const mockRequest: SearchRequest = {
      query: 'pizza in Paris'
    };

    const mockResponse: Partial<SearchResponse> = {
      requestId: 'req_123',
      sessionId: 'test-session',
      results: [],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch',
        appliedFilters: [],
        confidence: 0.9,
        source: 'google_places'
      }
    };

    service.searchAsync(mockRequest).subscribe({
      next: (response) => {
        if ('results' in response) {
          expect(response.sessionId).toBe('test-session');
        }
        done();
      }
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(mockRequest);
    req.flush(mockResponse, { status: 200, statusText: 'OK' });
  });

  it('should handle error responses', (done) => {
    const mockRequest: SearchRequest = {
      query: 'test'
    };

    service.searchAsync(mockRequest).subscribe({
      error: (error) => {
        expect(error.message).toBeDefined();
        done();
      }
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
    req.flush({ error: 'Search failed' }, { status: 500, statusText: 'Server Error' });
  });

  it('should get stats', (done) => {
    const mockStats = { totalSearches: 100 };

    service.getStats().subscribe({
      next: (stats) => {
        expect(stats).toEqual(mockStats);
        done();
      }
    });

    const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search/stats'));
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);
  });

  // Network Error Tests
  describe('Network Error Handling', () => {
    it('should handle network connection error (status=0) with user-friendly message', (done) => {
      const mockRequest: SearchRequest = {
        query: 'test query'
      };

      service.searchAsync(mockRequest).subscribe({
        error: (error) => {
          expect(error.status).toBe(0);
          expect(error.code).toBe('NETWORK_ERROR');
          expect(error.message).toBe('Unable to connect to server. Please check your internet connection.');
          done();
        }
      });

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
      expect(req.request.method).toBe('POST');

      // Simulate network error (ERR_CONNECTION_REFUSED)
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      // Handle retry attempt (interceptor retries once)
      setTimeout(() => {
        try {
          const retryReq = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
          retryReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
        } catch (e) {
          // Retry might have already been handled
        }
      }, 400);
    });

    it('CRITICAL: should never throw EmptyError on network failure', (done) => {
      const mockRequest: SearchRequest = {
        query: 'test query'
      };

      service.searchAsync(mockRequest).subscribe({
        next: () => fail('Should not succeed'),
        error: (error) => {
          // CRITICAL: Verify it's NOT an EmptyError
          expect(error.name).not.toBe('EmptyError');
          expect(error.constructor.name).not.toBe('EmptyError');
          expect(error.status).toBe(0);
          expect(error.code).toBe('NETWORK_ERROR');
          done();
        },
        complete: () => fail('Observable should not complete without emission')
      });

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });

      // Handle retry
      setTimeout(() => {
        try {
          const retryReq = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
          retryReq.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
        } catch (e) {
          // Retry handled
        }
      }, 400);
    });

    it('should handle network error during polling with user-friendly message', (done) => {
      const resultUrl = 'http://localhost:8080/api/v1/search/req_123/result';

      service.pollResult(resultUrl).subscribe({
        error: (error) => {
          expect(error.status).toBe(0);
          expect(error.code).toBe('NETWORK_ERROR');
          expect(error.message).toBe('Unable to connect to server. Please check your internet connection.');
          done();
        }
      });

      const req = httpMock.expectOne(resultUrl);
      expect(req.request.method).toBe('GET');

      // Simulate network error
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    });

    it('should handle 202 accepted response correctly', (done) => {
      const mockRequest: SearchRequest = {
        query: 'pizza'
      };

      const mockAccepted = {
        requestId: 'req_123',
        resultUrl: 'http://localhost:8080/api/v1/search/req_123/result'
      };

      service.searchAsync(mockRequest).subscribe({
        next: (response) => {
          expect('resultUrl' in response).toBe(true);
          if ('resultUrl' in response) {
            expect(response.requestId).toBe('req_123');
            expect(response.resultUrl).toContain('/search/req_123/result');
          }
          done();
        }
      });

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
      req.flush(mockAccepted, { status: 202, statusText: 'Accepted' });
    });

    it('should handle 200 sync response correctly', (done) => {
      const mockRequest: SearchRequest = {
        query: 'pizza'
      };

      const mockResponse: Partial<SearchResponse> = {
        requestId: 'req_456',
        sessionId: 'sess_123',
        results: [],
        chips: [],
        meta: {
          tookMs: 100,
          mode: 'textsearch',
          appliedFilters: [],
          confidence: 0.9,
          source: 'google_places'
        }
      };

      service.searchAsync(mockRequest).subscribe({
        next: (response) => {
          expect('results' in response).toBe(true);
          if ('results' in response) {
            expect(response.requestId).toBe('req_456');
          }
          done();
        }
      });

      const req = httpMock.expectOne((r) => r.url.includes('/api/v1/search'));
      req.flush(mockResponse, { status: 200, statusText: 'OK' });
    });
  });
});













