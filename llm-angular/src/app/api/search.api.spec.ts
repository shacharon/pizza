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

    service.search(mockRequest).subscribe({
      next: (response) => {
        expect(response.sessionId).toBe('test-session');
        done();
      }
    });

    const req = httpMock.expectOne('/api/search');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(mockRequest);
    req.flush(mockResponse);
  });

  it('should handle error responses', (done) => {
    const mockRequest: SearchRequest = {
      query: 'test'
    };

    service.search(mockRequest).subscribe({
      error: (error) => {
        expect(error.message).toContain('Search failed');
        done();
      }
    });

    const req = httpMock.expectOne('/api/search');
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

    const req = httpMock.expectOne('/api/search/stats');
    expect(req.request.method).toBe('GET');
    req.flush(mockStats);
  });
});

