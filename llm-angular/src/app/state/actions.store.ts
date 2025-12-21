/**
 * Actions Store
 * Reactive state management for action lifecycle using Angular signals
 */

import { Injectable, signal, computed } from '@angular/core';
import type { ActionProposal, ActionStatus } from '../domain/types/action.types';

@Injectable({ providedIn: 'root' })
export class ActionsStore {
  // Private state signals
  private readonly _pendingActions = signal<Map<string, ActionProposal>>(new Map());
  private readonly _executedActions = signal<Map<string, ActionProposal>>(new Map());

  // Computed signals for filtered lists
  readonly pending = computed(() =>
    Array.from(this._pendingActions().values())
      .filter(a => a.status === 'PENDING' || a.status === 'APPROVED')
  );

  readonly executed = computed(() =>
    Array.from(this._executedActions().values())
  );

  readonly allPending = computed(() =>
    Array.from(this._pendingActions().values())
  );

  // Mutations
  addPending(action: ActionProposal): void {
    this._pendingActions.update(map => {
      const newMap = new Map(map);
      newMap.set(action.id, action);
      return newMap;
    });
  }

  updateStatus(actionId: string, status: ActionStatus): void {
    this._pendingActions.update(map => {
      const action = map.get(actionId);
      if (action) {
        const newMap = new Map(map);
        newMap.set(actionId, { ...action, status });
        return newMap;
      }
      return map;
    });
  }

  moveToExecuted(actionId: string): void {
    const action = this._pendingActions().get(actionId);
    if (action) {
      // Add to executed
      this._executedActions.update(map => {
        const newMap = new Map(map);
        newMap.set(actionId, action);
        return newMap;
      });
      // Remove from pending
      this._pendingActions.update(map => {
        const newMap = new Map(map);
        newMap.delete(actionId);
        return newMap;
      });
    }
  }

  removePending(actionId: string): void {
    this._pendingActions.update(map => {
      const newMap = new Map(map);
      newMap.delete(actionId);
      return newMap;
    });
  }

  clearAll(): void {
    this._pendingActions.set(new Map());
    this._executedActions.set(new Map());
  }
}

