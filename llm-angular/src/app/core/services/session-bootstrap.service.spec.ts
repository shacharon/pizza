/**
 * Session Bootstrap Service Tests
 * Validates bootstrap flow and error handling
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SessionBootstrapService } from './session-bootstrap.service';
import { environment } from '../../../environments/environment';

describe('SessionBootstrapService', () => {
  let service: SessionBootstrapService;
  let httpMock: HttpTestingController;
  const baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SessionBootstrapService]
    });

    service = TestBed.inject(SessionBootstrapService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should bootstrap successfully and log success', async () => {
    const consoleSpy = jest.spyOn(console, 'debug');
    
    const bootstrapPromise = service.bootstrap();

    const req = httpMock.expectOne(`${baseUrl}/auth/bootstrap`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true); // CRITICAL: check credentials

    req.flush({ ok: true, sessionId: 'sess_test_123' });

    await bootstrapPromise;

    expect(consoleSpy).toHaveBeenCalledWith(
      '[SessionBootstrap] bootstrap_triggered',
      expect.any(Object)
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SessionBootstrap] bootstrap_success',
      expect.any(Object)
    );

    consoleSpy.mockRestore();
  });

  it('should throw REDIS_UNAVAILABLE on 503', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');

    const bootstrapPromise = service.bootstrap();

    const req = httpMock.expectOne(`${baseUrl}/auth/bootstrap`);
    req.flush(
      { ok: false, error: 'REDIS_UNAVAILABLE', message: 'Redis connection failed' },
      { status: 503, statusText: 'Service Unavailable' }
    );

    await expect(bootstrapPromise).rejects.toThrow('REDIS_UNAVAILABLE');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SessionBootstrap] bootstrap_failed_redis_unavailable',
      expect.any(Object)
    );

    consoleErrorSpy.mockRestore();
  });

  it('should prevent concurrent bootstrap calls', async () => {
    const consoleSpy = jest.spyOn(console, 'debug');

    // Start two concurrent bootstraps
    const bootstrap1 = service.bootstrap();
    const bootstrap2 = service.bootstrap();

    // Only one HTTP request should be made
    const req = httpMock.expectOne(`${baseUrl}/auth/bootstrap`);
    req.flush({ ok: true, sessionId: 'sess_test_456' });

    await Promise.all([bootstrap1, bootstrap2]);

    // Check that second call detected ongoing bootstrap
    expect(consoleSpy).toHaveBeenCalledWith(
      '[SessionBootstrap] bootstrap_already_in_progress - waiting',
      expect.any(Object)
    );

    consoleSpy.mockRestore();
  });

  it('should log generic error on non-503 failure', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error');

    const bootstrapPromise = service.bootstrap();

    const req = httpMock.expectOne(`${baseUrl}/auth/bootstrap`);
    req.flush(
      { error: 'Internal Server Error' },
      { status: 500, statusText: 'Internal Server Error' }
    );

    await expect(bootstrapPromise).rejects.toBeTruthy();

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[SessionBootstrap] bootstrap_failed',
      expect.any(Object)
    );

    consoleErrorSpy.mockRestore();
  });
});
