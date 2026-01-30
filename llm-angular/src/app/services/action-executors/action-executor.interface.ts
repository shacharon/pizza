/**
 * Action Executor Interface
 * Strategy pattern interface for action execution
 * 
 * Each executor implements the execution logic for specific action types
 * All executors must:
 * - Be pure (no side effects in constructor)
 * - Return Observable<ActionExecutionResult>
 * - Handle errors gracefully
 */

import { Observable } from 'rxjs';
import type { ActionExecutionResult } from '../../domain/types/action.types';
import type { Restaurant } from '../../domain/types/search.types';

/**
 * Base interface for all action executors
 */
export interface ActionExecutor {
  /**
   * Execute the action for a given restaurant
   * 
   * @param restaurant - Restaurant to perform action on
   * @returns Observable with execution result
   */
  execute(restaurant: Restaurant): Observable<ActionExecutionResult>;
}
