/**
 * WebSocket Types Module
 * Re-exports protocol types and defines internal types for WS modules
 */

// Re-export public protocol types
export type {
  WSClientMessage,
  WSServerMessage,
  ConnectionStatus,
  WSChannel,
  WSClientEnvelope,
  WSServerSubAck,
  WSServerSubNack
} from '../../models/ws-protocol.types';

export { isWSServerMessage } from '../../models/ws-protocol.types';
export { isHardCloseReason } from '../../models/ws-close-reasons';

// Import ConnectionStatus for use in interfaces below
import type { ConnectionStatus } from '../../models/ws-protocol.types';

/**
 * WebSocket connection configuration
 */
export interface WSConnectionConfig {
  wsBaseUrl: string;
  baseReconnectDelay: number;
  maxReconnectDelay: number;
}

/**
 * WebSocket connection callbacks
 */
export interface WSConnectionCallbacks {
  onOpen: () => void;
  onMessage: (event: MessageEvent) => void;
  onClose: (event: CloseEvent) => void;
  onError: (event: Event) => void;
  onStatusChange: (status: ConnectionStatus) => void;
}

/**
 * Ticket response from auth API
 */
export interface WSTicketResponse {
  ticket: string;
}

/**
 * Ticket provider interface (abstracts auth API)
 */
export interface WSTicketProvider {
  requestTicket(): Promise<WSTicketResponse>;
  ensureAuth(): Promise<void>;
}

/**
 * Subscribe/Unsubscribe parameters
 */
export interface WSSubscribeParams {
  requestId: string;
  channel: 'search' | 'assistant';
  sessionId?: string;
}
