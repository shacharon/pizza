/**
 * Action Executor Registry
 * Maps ActionType to concrete executor implementations
 * 
 * Strategy Pattern: Central registry for action execution strategies
 * Provides type-safe lookup and extensibility
 */

import { Injectable, inject } from '@angular/core';
import type { ActionType } from '../../domain/types/action.types';
import type { ActionExecutor } from './action-executor.interface';
import { DirectionsExecutor, CallExecutor, WebsiteExecutor } from './navigation.executor';
import { ShareExecutor, FavoriteExecutor } from './social.executor';

/**
 * Registry mapping ActionType to executor instance
 * Singleton service managing all action executors
 */
@Injectable({ providedIn: 'root' })
export class ExecutorRegistry {
  // Inject all executors
  private readonly directionsExecutor = inject(DirectionsExecutor);
  private readonly callExecutor = inject(CallExecutor);
  private readonly websiteExecutor = inject(WebsiteExecutor);
  private readonly shareExecutor = inject(ShareExecutor);
  private readonly favoriteExecutor = inject(FavoriteExecutor);

  // Type-safe registry map
  private readonly registry = new Map<ActionType, ActionExecutor>([
    // Navigation executors
    ['GET_DIRECTIONS', this.directionsExecutor],
    ['CALL_RESTAURANT', this.callExecutor],
    ['VIEW_MENU', this.websiteExecutor],
    ['VIEW_DETAILS', this.websiteExecutor],

    // Social executors
    ['SHARE', this.shareExecutor],
    ['SAVE_FAVORITE', this.favoriteExecutor]
  ]);

  /**
   * Get executor for given action type
   * 
   * @param type - Action type to execute
   * @returns Executor instance or null if not found
   * 
   * @example
   * const executor = registry.get('GET_DIRECTIONS');
   * executor.execute(restaurant).subscribe(result => { ... });
   */
  get(type: ActionType): ActionExecutor | null {
    return this.registry.get(type) || null;
  }

  /**
   * Check if action type has registered executor
   * 
   * @param type - Action type to check
   * @returns true if executor exists
   */
  has(type: ActionType): boolean {
    return this.registry.has(type);
  }

  /**
   * Get all registered action types
   * Useful for validation and debugging
   * 
   * @returns Array of registered action types
   */
  getSupportedTypes(): ActionType[] {
    return Array.from(this.registry.keys());
  }
}
