/**
 * Feature Flags API Client Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FlagsApiClient } from './flags.api';

describe('FlagsApiClient', () => {
  let service: FlagsApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [FlagsApiClient]
    });

    service = TestBed.inject(FlagsApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should load flags from backend', (done) => {
    const mockFlags = {
      unifiedSearch: true,
      actionProposals: true,
      newFeature: false
    };

    service.loadFlags().subscribe({
      next: (flags) => {
        expect(flags.unifiedSearch).toBe(true);
        expect(flags.actionProposals).toBe(true);
        expect(flags.newFeature).toBe(false);
        done();
      }
    });

    const req = httpMock.expectOne('/api/flags');
    expect(req.request.method).toBe('GET');
    req.flush(mockFlags);
  });

  it('should fail gracefully with default flags', (done) => {
    service.loadFlags().subscribe({
      next: (flags) => {
        // Should return default flags on error
        expect(flags.unifiedSearch).toBe(false);
        expect(flags.actionProposals).toBe(false);
        done();
      }
    });

    const req = httpMock.expectOne('/api/flags');
    req.flush({ error: 'Not found' }, { status: 404, statusText: 'Not Found' });
  });

  it('should handle network errors gracefully', (done) => {
    service.loadFlags().subscribe({
      next: (flags) => {
        expect(flags).toBeDefined();
        expect(flags.unifiedSearch).toBe(false);
        done();
      }
    });

    const req = httpMock.expectOne('/api/flags');
    req.error(new ProgressEvent('error'));
  });
});











