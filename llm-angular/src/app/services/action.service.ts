/**
 * Action Service (REFACTORED with Strategy Pattern)
 * Manages Human-in-the-Loop action lifecycle (L0, L1, L2)
 * 
 * Architecture:
 * - Orchestration: propose/approve/reject/cleanup (in this service)
 * - Execution: Delegated to ExecutorRegistry + strategy executors
 * 
 * Executors organized by domain:
 * - Navigation: DirectionsExecutor, CallExecutor, WebsiteExecutor
 * - Social: ShareExecutor, FavoriteExecutor
 */

import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError, delay, map } from 'rxjs/operators';
import { ActionsStore } from '../state/actions.store';
import { AnalyticsService } from './analytics.service';
import { ExecutorRegistry } from './action-executors/executor.registry';
import type {
  ActionType,
  ActionLevel,
  ActionProposal,
  ActionExecutionResult
} from '../domain/types/action.types';
import type { Restaurant } from '../domain/types/search.types';

@Injectable({ providedIn: 'root' })
export class ActionService {
  private readonly actionsStore = inject(ActionsStore);
  private readonly analyticsService = inject(AnalyticsService);
  private readonly executorRegistry = inject(ExecutorRegistry);

  proposeAction(
    type: ActionType,
    level: ActionLevel,
    restaurant: Restaurant
  ): Observable<ActionProposal> {
    const proposal: ActionProposal = {
      id: this.generateId(),
      type,
      level,
      restaurant,
      status: 'PENDING',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      idempotencyKey: this.generateIdempotencyKey(),
      correlationId: this.generateCorrelationId()
    };

    // Track proposal
    this.analyticsService.track('action_proposed', {
      type,
      level,
      restaurantId: restaurant.id,
      restaurantName: restaurant.name
    });

    if (level === 0) {
      // L0: Execute immediately (read-only, safe actions)
      this.analyticsService.track('action_l0_auto_execute', {
        actionId: proposal.id,
        type
      });

      // Execute and return the updated proposal
      return this.executeAction(proposal).pipe(
        tap(() => {
          // Execution successful, update proposal status
          proposal.status = 'EXECUTED';
        }),
        map(() => proposal) // Return the proposal, not the execution result
      );
    }

    // L1/L2: Add to pending, require user approval
    this.actionsStore.addPending(proposal);
    this.analyticsService.track('action_pending_approval', {
      actionId: proposal.id,
      level,
      type
    });

    return of(proposal);
  }

  approveAction(actionId: string): Observable<ActionExecutionResult> {
    const action = this.actionsStore.pending().find(a => a.id === actionId);

    if (!action) {
      this.analyticsService.track('action_approve_failed', {
        actionId,
        reason: 'not_found'
      });
      return throwError(() => new Error('Action not found'));
    }

    // Check expiration
    if (new Date() > action.expiresAt) {
      this.actionsStore.updateStatus(actionId, 'EXPIRED');
      this.analyticsService.track('action_expired', { actionId });
      setTimeout(() => this.actionsStore.removePending(actionId), 1000);
      return throwError(() => new Error('Action expired'));
    }

    this.actionsStore.updateStatus(actionId, 'APPROVED');
    this.analyticsService.track('action_approved', {
      actionId,
      level: action.level,
      type: action.type
    });

    return this.executeAction(action);
  }

  rejectAction(actionId: string): void {
    const action = this.actionsStore.allPending().find(a => a.id === actionId);

    if (action) {
      this.actionsStore.updateStatus(actionId, 'REJECTED');
      this.analyticsService.track('action_rejected', {
        actionId,
        level: action.level,
        type: action.type
      });

      // Remove from pending after brief delay
      setTimeout(() => this.actionsStore.removePending(actionId), 1000);
    }
  }

  cleanupExpired(): void {
    const now = new Date();
    const expired = this.actionsStore.allPending().filter(a => a.expiresAt < now);

    expired.forEach(action => {
      this.actionsStore.updateStatus(action.id, 'EXPIRED');
      this.analyticsService.track('action_expired_cleanup', { actionId: action.id });
      setTimeout(() => this.actionsStore.removePending(action.id), 1000);
    });
  }

  private executeAction(action: ActionProposal): Observable<ActionExecutionResult> {
    this.actionsStore.updateStatus(action.id, 'EXECUTING');
    this.analyticsService.track('action_executing', {
      actionId: action.id,
      type: action.type,
      level: action.level
    });

    return this.performExecution(action).pipe(
      tap(result => {
        if (result.success) {
          this.actionsStore.updateStatus(action.id, 'EXECUTED');
          this.actionsStore.moveToExecuted(action.id);
          this.analyticsService.track('action_executed', {
            actionId: action.id,
            type: action.type,
            level: action.level
          });
        } else {
          this.actionsStore.updateStatus(action.id, 'FAILED');
          this.analyticsService.track('action_failed', {
            actionId: action.id,
            type: action.type,
            error: result.error
          });
        }
      }),
      catchError(error => {
        this.actionsStore.updateStatus(action.id, 'FAILED');
        this.analyticsService.track('action_failed', {
          actionId: action.id,
          type: action.type,
          error: error.message
        });
        return of({ success: false, message: 'Failed', error: error.message });
      }),
      delay(100) // Small delay for UI feedback
    );
  }

  /**
   * Perform action execution via strategy pattern
   * Delegates to ExecutorRegistry to get appropriate executor
   * 
   * @param action - Action proposal to execute
   * @returns Observable with execution result
   */
  private performExecution(action: ActionProposal): Observable<ActionExecutionResult> {
    // Get executor from registry
    const executor = this.executorRegistry.get(action.type);

    if (!executor) {
      // Unknown action type - return error
      return of({
        success: false,
        message: 'Unknown action',
        error: `No executor registered for action type: ${action.type}`
      });
    }

    // Delegate execution to strategy
    return executor.execute(action.restaurant);
  }

  private generateId(): string {
    return `action-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateIdempotencyKey(): string {
    return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private generateCorrelationId(): string {
    return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }
}

