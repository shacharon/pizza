/**
 * Action Service
 * Manages Human-in-the-Loop action lifecycle (L0, L1, L2)
 */

import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { tap, catchError, delay, map } from 'rxjs/operators';
import { ActionsStore } from '../state/actions.store';
import { SessionStore } from '../state/session.store';
import { AnalyticsService } from './analytics.service';
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
  private readonly sessionStore = inject(SessionStore);
  private readonly analyticsService = inject(AnalyticsService);

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

  private performExecution(action: ActionProposal): Observable<ActionExecutionResult> {
    switch (action.type) {
      case 'GET_DIRECTIONS':
        return this.openMaps(action.restaurant);
      case 'CALL_RESTAURANT':
        return this.openDialer(action.restaurant);
      case 'SAVE_FAVORITE':
        return this.saveFavorite(action.restaurant);
      case 'SHARE':
        return this.share(action.restaurant);
      case 'VIEW_MENU':
      case 'VIEW_DETAILS':
        return this.openWebsite(action.restaurant);
      default:
        return of({ 
          success: false, 
          message: 'Unknown action', 
          error: `Invalid action type: ${action.type}` 
        });
    }
  }

  private openMaps(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      const url = `https://www.google.com/maps/search/?api=1&query=${restaurant.location.lat},${restaurant.location.lng}&query_place_id=${restaurant.placeId}`;
      window.open(url, '_blank');
      return of({ success: true, message: 'Opened Google Maps' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to open maps', error: error.message });
    }
  }

  private openDialer(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      if (restaurant.phoneNumber) {
        window.location.href = `tel:${restaurant.phoneNumber}`;
        return of({ success: true, message: 'Opened phone dialer' });
      }
      return of({ success: false, message: 'No phone number', error: 'Phone number not available' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to open dialer', error: error.message });
    }
  }

  private saveFavorite(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      this.sessionStore.addToFavorites(restaurant.id);
      
      // Also save to localStorage as backup
      const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
      if (!favorites.includes(restaurant.id)) {
        favorites.push(restaurant.id);
        localStorage.setItem('favorites', JSON.stringify(favorites));
      }

      return of({ success: true, message: 'Saved to favorites' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to save favorite', error: error.message });
    }
  }

  private share(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      const shareData = {
        title: restaurant.name,
        text: `Check out ${restaurant.name} at ${restaurant.address}`,
        url: restaurant.website || window.location.href
      };

      if (navigator.share) {
        navigator.share(shareData).catch((error) => {
          console.warn('Share failed:', error);
        });
        return of({ success: true, message: 'Shared successfully' });
      } else {
        // Fallback: copy to clipboard
        const text = `${shareData.title} - ${shareData.text}`;
        navigator.clipboard?.writeText(text);
        return of({ success: true, message: 'Copied to clipboard' });
      }
    } catch (error: any) {
      return of({ success: false, message: 'Failed to share', error: error.message });
    }
  }

  private openWebsite(restaurant: Restaurant): Observable<ActionExecutionResult> {
    try {
      if (restaurant.website) {
        window.open(restaurant.website, '_blank');
        return of({ success: true, message: 'Opened website' });
      }
      // Fallback: Google search
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(restaurant.name)}`;
      window.open(searchUrl, '_blank');
      return of({ success: true, message: 'Opened search results' });
    } catch (error: any) {
      return of({ success: false, message: 'Failed to open website', error: error.message });
    }
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

