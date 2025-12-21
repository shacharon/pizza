/**
 * Actions API Client Tests
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ActionsApiClient } from './actions.api';
import type { ActionExecutionResult } from '../domain/types/action.types';

describe('ActionsApiClient', () => {
  let service: ActionsApiClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ActionsApiClient]
    });

    service = TestBed.inject(ActionsApiClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call approve action endpoint', (done) => {
    const actionId = 'action-123';
    const mockResult: ActionExecutionResult = {
      success: true,
      message: 'Action approved'
    };

    service.approveAction(actionId).subscribe({
      next: (result) => {
        expect(result.success).toBe(true);
        expect(result.message).toBe('Action approved');
        done();
      }
    });

    const req = httpMock.expectOne(`/api/actions/${actionId}/approve`);
    expect(req.request.method).toBe('POST');
    req.flush(mockResult);
  });

  it('should handle approval error', (done) => {
    const actionId = 'action-123';

    service.approveAction(actionId).subscribe({
      error: (error) => {
        expect(error.message).toContain('Action request failed');
        done();
      }
    });

    const req = httpMock.expectOne(`/api/actions/${actionId}/approve`);
    req.flush({ error: 'Approval failed' }, { status: 500, statusText: 'Server Error' });
  });

  it('should get action status', (done) => {
    const actionId = 'action-123';
    const mockStatus = {
      id: actionId,
      type: 'SAVE_FAVORITE' as const,
      level: 1 as const,
      restaurant: {} as any,
      status: 'EXECUTED' as const,
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-123',
      correlationId: 'corr-123'
    };

    service.getActionStatus(actionId).subscribe({
      next: (status) => {
        expect(status.id).toBe(actionId);
        expect(status.status).toBe('EXECUTED');
        done();
      }
    });

    const req = httpMock.expectOne(`/api/actions/${actionId}`);
    expect(req.request.method).toBe('GET');
    req.flush(mockStatus);
  });
});

