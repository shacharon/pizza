import type { WsSearchEvent } from '../../contracts/search.contracts.js';
import { wsManager } from '../../server.js';
import { logger } from '../../lib/logger/structured-logger.js';

/**
 * Publish a search event via WebSocket
 * GUARDRAIL: Never throws - WS publish failures are non-fatal for background search
 */
export function publishSearchEvent(requestId: string, event: WsSearchEvent): void {
  try {
    // Publish to search channel using the existing publishToChannel method
    wsManager.publishToChannel('search', requestId, undefined, event as any);
  } catch (err) {
    // GUARDRAIL: WS publish failures must not crash background search
    logger.warn({
      requestId,
      eventType: event.type,
      error: err instanceof Error ? err.message : 'unknown',
      operation: 'publishSearchEvent'
    }, '[P1 Reliability] WebSocket publish failed (non-fatal) - search continues');
  }
}
