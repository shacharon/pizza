/**
 * Action Domain Types
 * Human-in-the-Loop action lifecycle
 */

import type { Restaurant } from './search.types';

export type ActionLevel = 0 | 1 | 2;

export type ActionType =
  | 'VIEW_DETAILS'
  | 'GET_DIRECTIONS'
  | 'CALL_RESTAURANT'
  | 'SAVE_FAVORITE'
  | 'DELETE_FAVORITE'
  | 'SHARE'
  | 'VIEW_MENU'
  | 'REPORT_ISSUE';

export type ActionStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'EXECUTING'
  | 'EXECUTED'
  | 'FAILED'
  | 'EXPIRED'
  | 'REJECTED';

export interface ActionDefinition {
  id: string;
  type: ActionType;
  level: ActionLevel;
  label: string;
  icon: string;
  requiresSelection?: boolean;
  enabled?: boolean;
}

export interface ProposedActions {
  perResult: ActionDefinition[];
  selectedItem: ActionDefinition[];
}

export interface ActionProposal {
  id: string;
  type: ActionType;
  level: ActionLevel;
  restaurant: Restaurant;
  status: ActionStatus;
  createdAt: Date;
  expiresAt: Date;
  idempotencyKey: string;
  correlationId: string;
}

export interface ActionExecutionResult {
  success: boolean;
  message: string;
  error?: string;
}













