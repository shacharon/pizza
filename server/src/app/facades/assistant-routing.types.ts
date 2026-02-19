/**
 * Assistant Message Routing Types
 * Defines canonical routing rules for assistant messages
 * 
 * ROUTING RULES (חד-חד-ערכית):
 * - app-assistant-line: ONLY system/connection/progress (NO cards)
 * - app-assistant-summary: ONLY cards (SUMMARY, CLARIFY, GATE_FAIL)
 */

/**
 * Assistant message types from backend
 */
export type AssistantMessageType =
  | 'PRESENCE'      // System presence indicator
  | 'WS_STATUS'     // WebSocket connection status
  | 'PROGRESS'      // Search progress updates
  | 'SUMMARY'       // Assistant summary card
  | 'CLARIFY'       // Clarification request card
  | 'GATE_FAIL';    // Gate failure card

/**
 * Routing channels
 */
export type AssistantChannel = 'line' | 'card';

/**
 * Canonical routing map: which types go to which channel
 */
export const ASSISTANT_ROUTING: Record<AssistantMessageType, AssistantChannel> = {
  // Line channel: System/connection/progress only
  'PRESENCE': 'line',
  'WS_STATUS': 'line',
  'PROGRESS': 'line',

  // Card channel: User-facing cards only
  'SUMMARY': 'card',
  'CLARIFY': 'card',
  'GATE_FAIL': 'card'
};

/**
 * Get allowed message types for a channel
 */
export function getAllowedTypesForChannel(channel: AssistantChannel): AssistantMessageType[] {
  return Object.entries(ASSISTANT_ROUTING)
    .filter(([_, ch]) => ch === channel)
    .map(([type]) => type as AssistantMessageType);
}

/**
 * Check if message type is allowed on channel
 */
export function isTypeAllowedOnChannel(
  type: AssistantMessageType,
  channel: AssistantChannel
): boolean {
  return ASSISTANT_ROUTING[type] === channel;
}

/**
 * Message payload for assistant line
 */
export interface AssistantLineMessage {
  id: string;
  type: 'PRESENCE' | 'WS_STATUS' | 'PROGRESS';
  message: string;
  requestId?: string;
  timestamp: number;
}

/**
 * Message payload for assistant card
 */
export interface AssistantCardMessage {
  id: string;
  type: 'SUMMARY' | 'CLARIFY' | 'GATE_FAIL';
  message: string;
  question: string | null;
  blocksSearch: boolean;
  language?: 'he' | 'en' | 'ru' | 'ar' | 'fr' | 'es' | 'de' | 'it' | 'am'; // Language for directionality
  requestId: string;
  timestamp: number;
}

/**
 * Routing decision with instrumentation
 */
export interface RoutingDecision {
  messageId: string;
  type: AssistantMessageType;
  channel: AssistantChannel;
  requestId?: string;
  dedupDropped: boolean;
  routedTo: 'line' | 'card' | 'dropped';
}
