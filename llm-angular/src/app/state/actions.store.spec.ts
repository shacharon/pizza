/**
 * Actions Store Tests
 */

import { TestBed } from '@angular/core/testing';
import { ActionsStore } from './actions.store';
import type { ActionProposal } from '../domain/types/action.types';

describe('ActionsStore', () => {
  let store: ActionsStore;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ActionsStore]
    });
    store = TestBed.inject(ActionsStore);
  });

  afterEach(() => {
    store.clearAll();
  });

  it('should be created', () => {
    expect(store).toBeTruthy();
  });

  it('should have empty initial state', () => {
    expect(store.pending()).toEqual([]);
    expect(store.executed()).toEqual([]);
  });

  it('should add pending action', () => {
    const mockAction: ActionProposal = {
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: {} as any,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    };

    store.addPending(mockAction);

    expect(store.pending().length).toBe(1);
    expect(store.pending()[0].id).toBe('action-1');
    expect(store.pending()[0].status).toBe('PENDING');
  });

  it('should update action status', () => {
    const mockAction: ActionProposal = {
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: {} as any,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    };

    store.addPending(mockAction);
    store.updateStatus('action-1', 'APPROVED');

    expect(store.pending()[0].status).toBe('APPROVED');
  });

  it('should move action to executed', () => {
    const mockAction: ActionProposal = {
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: {} as any,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    };

    store.addPending(mockAction);
    store.updateStatus('action-1', 'EXECUTED');
    store.moveToExecuted('action-1');

    expect(store.pending().length).toBe(0);
    expect(store.executed().length).toBe(1);
    expect(store.executed()[0].id).toBe('action-1');
  });

  it('should remove pending action', () => {
    const mockAction: ActionProposal = {
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: {} as any,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    };

    store.addPending(mockAction);
    expect(store.pending().length).toBe(1);

    store.removePending('action-1');
    expect(store.pending().length).toBe(0);
  });

  it('should filter only PENDING and APPROVED actions', () => {
    const action1: ActionProposal = {
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: {} as any,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    };

    const action2: ActionProposal = {
      id: 'action-2',
      type: 'GET_DIRECTIONS',
      level: 0,
      restaurant: {} as any,
      status: 'REJECTED',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-2',
      correlationId: 'corr-2'
    };

    store.addPending(action1);
    store.addPending(action2);

    // Only PENDING should be in pending() computed
    expect(store.pending().length).toBe(1);
    expect(store.pending()[0].id).toBe('action-1');

    // Both should be in allPending()
    expect(store.allPending().length).toBe(2);
  });

  it('should clear all actions', () => {
    const mockAction: ActionProposal = {
      id: 'action-1',
      type: 'SAVE_FAVORITE',
      level: 1,
      restaurant: {} as any,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(),
      idempotencyKey: 'idem-1',
      correlationId: 'corr-1'
    };

    store.addPending(mockAction);
    store.moveToExecuted('action-1');

    expect(store.executed().length).toBe(1);

    store.clearAll();

    expect(store.pending().length).toBe(0);
    expect(store.executed().length).toBe(0);
  });
});

