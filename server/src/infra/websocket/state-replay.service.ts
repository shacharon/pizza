/**
 * State Replay Service
 * Handles replaying state for late subscribers
 * PURE replay logic - no subscription management
 */

import { WebSocket } from 'ws';
import { logger } from '../../lib/logger/structured-logger.js';
import type { WSServerMessage } from './websocket-protocol.js';
import type { IRequestStateStore } from '../state/request-state.store.js';

/**
 * StateReplayService
 * Replays state to late-joining subscribers
 */
export class StateReplayService {
  constructor(
    private requestStateStore: IRequestStateStore | undefined
  ) {}

  /**
   * Replay state for late subscribers
   */
  async replayStateIfAvailable(
    requestId: string,
    ws: WebSocket,
    clientId: string,
    sendTo: (ws: WebSocket, message: WSServerMessage) => boolean
  ): Promise<void> {
    if (!this.requestStateStore) {
      return;
    }

    try {
      const state = await this.requestStateStore.get(requestId);

      if (!state) {
        logger.debug({ requestId, clientId }, 'No state to replay');
        return;
      }

      // Send current status
      const statusSent = sendTo(ws, {
        type: 'status',
        requestId,
        status: state.assistantStatus
      });

      // If assistant output exists, send it
      if (state.assistantOutput) {
        sendTo(ws, {
          type: 'stream.done',
          requestId,
          fullText: state.assistantOutput
        });
      }

      // If recommendations exist, send them
      if (state.recommendations && state.recommendations.length > 0) {
        sendTo(ws, {
          type: 'recommendation',
          requestId,
          actions: state.recommendations
        });
      }

      if (!statusSent) {
        return;
      }

      logger.info({
        requestId,
        clientId,
        hasOutput: !!state.assistantOutput,
        hasRecommendations: !!(state.recommendations && state.recommendations.length > 0)
      }, 'websocket_replay_sent');

    } catch (error) {
      logger.error({
        requestId,
        clientId,
        error
      }, 'Failed to replay state');
    }
  }
}
