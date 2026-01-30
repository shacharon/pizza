/**
 * Load More Handler Registry
 * 
 * Global registry for load_more event handlers.
 * Allows WebSocket manager (infrastructure) to trigger domain logic without tight coupling.
 */

import type { LLMProvider } from '../../../../llm/types.js';
import type { WebSocketManager } from '../../../../infra/websocket/websocket-manager.js';
import { logger } from '../../../../lib/logger/structured-logger.js';
import { handleLoadMoreEvent } from './load-more-handler.js';

type LoadMoreHandler = (
  requestId: string,
  sessionId: string | undefined,
  newOffset: number,
  totalShown: number,
  userId?: string
) => Promise<void>;

class LoadMoreHandlerRegistry {
  private handler: LoadMoreHandler | null = null;

  /**
   * Register load_more handler
   * Should be called during application initialization
   */
  register(llmProvider: LLMProvider, wsManager: WebSocketManager): void {
    if (this.handler) {
      logger.warn(
        { event: 'load_more_handler_already_registered' },
        '[LOAD_MORE_REGISTRY] Handler already registered'
      );
      return;
    }

    this.handler = async (requestId, sessionId, newOffset, totalShown, userId) => {
      await handleLoadMoreEvent(
        requestId,
        sessionId,
        newOffset,
        totalShown,
        llmProvider,
        wsManager,
        userId
      );
    };

    logger.info(
      { event: 'load_more_handler_registered' },
      '[LOAD_MORE_REGISTRY] Handler registered'
    );
  }

  /**
   * Handle load_more event
   * Called by WebSocket manager when client sends load_more message
   */
  async handle(
    requestId: string,
    sessionId: string | undefined,
    newOffset: number,
    totalShown: number,
    userId?: string
  ): Promise<void> {
    if (!this.handler) {
      logger.warn(
        { requestId, event: 'load_more_handler_not_registered' },
        '[LOAD_MORE_REGISTRY] No handler registered'
      );
      return;
    }

    await this.handler(requestId, sessionId, newOffset, totalShown, userId);
  }

  /**
   * Check if handler is registered
   */
  isRegistered(): boolean {
    return this.handler !== null;
  }

  /**
   * Unregister handler (for testing)
   */
  unregister(): void {
    this.handler = null;
  }
}

// Singleton instance
export const loadMoreRegistry = new LoadMoreHandlerRegistry();
