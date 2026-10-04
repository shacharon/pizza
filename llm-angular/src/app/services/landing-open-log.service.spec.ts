import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { LandingOpenLogService } from './landing-open-log.service';

describe('LandingOpenLogService', () => {
  let service: LandingOpenLogService;
  let http: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(LandingOpenLogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts landing_open with the entry', () => {
    service.track('p:cv');
    const req = http.expectOne((r) => r.url.endsWith('/analytics/events'));
    expect(req.request.body).toEqual({ event: 'landing_open', data: { entry: 'p:cv' } });
    req.flush({});
  });

  it('sends each entry only once per tab', () => {
    service.track('qr');
    http.expectOne((r) => r.url.endsWith('/analytics/events')).flush({});
    service.track('qr');
    http.expectNone((r) => r.url.endsWith('/analytics/events'));
    service.track('p:cv');
    http.expectOne((r) => r.url.endsWith('/analytics/events')).flush({});
  });
});
