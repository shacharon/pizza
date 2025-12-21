/**
 * Analytics Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AnalyticsService } from './analytics.service';
import { SessionStore } from '../state/session.store';

describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let httpMock: HttpTestingController;
  let sessionStore: SessionStore;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [AnalyticsService, SessionStore]
    });

    service = TestBed.inject(AnalyticsService);
    httpMock = TestBed.inject(HttpTestingController);
    sessionStore = TestBed.inject(SessionStore);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send event to backend', () => {
    service.track('test_event', { foo: 'bar' });

    const req = httpMock.expectOne('/api/analytics/events');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.event).toBe('test_event');
    expect(req.request.body.data.foo).toBe('bar');
    expect(req.request.body.data.sessionId).toBeTruthy();
    expect(req.request.body.data.timestamp).toBeTruthy();

    req.flush({});
  });

  it('should enrich event with metadata', () => {
    sessionStore.setLocale('fr');
    sessionStore.setRegion('FR');

    service.track('test_event');

    const req = httpMock.expectOne('/api/analytics/events');
    const body = req.request.body;

    expect(body.data.sessionId).toBe(sessionStore.conversationId());
    expect(body.data.locale).toBe('fr');
    expect(body.data.region).toBe('FR');
    expect(body.data.userAgent).toBeTruthy();
    expect(body.data.timestamp).toBeTruthy();

    req.flush({});
  });

  it('should handle send failures gracefully', (done) => {
    spyOn(console, 'warn');

    service.track('test_event');

    const req = httpMock.expectOne('/api/analytics/events');
    req.error(new ProgressEvent('error'));

    // Should not throw, just warn
    setTimeout(() => {
      expect(console.warn).toHaveBeenCalled();
      done();
    }, 100);
  });

  it('should track errors with context', () => {
    const testError = new Error('Test error');

    service.trackError(testError, { context: 'test' });

    const req = httpMock.expectOne('/api/analytics/events');
    expect(req.request.body.event).toBe('error');
    expect(req.request.body.data.message).toBe('Test error');
    expect(req.request.body.data.context).toBe('test');

    req.flush({});
  });

  it('should track timing', () => {
    service.trackTiming('search_duration', 250, { query: 'pizza' });

    const req = httpMock.expectOne('/api/analytics/events');
    expect(req.request.body.event).toBe('timing');
    expect(req.request.body.data.label).toBe('search_duration');
    expect(req.request.body.data.durationMs).toBe(250);
    expect(req.request.body.data.query).toBe('pizza');

    req.flush({});
  });
});

