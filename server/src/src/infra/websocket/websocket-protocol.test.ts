/**
 * WebSocket Protocol Tests
 * 
 * Verifies assistant channel is properly supported in protocol
 */

import { describe, it, expect } from 'vitest';
import { isWSClientMessage, normalizeToCanonical } from './websocket-protocol.js';
import type { WSChannel } from './websocket-protocol.js';

describe('WebSocket Protocol - Assistant Channel Support', () => {
  describe('WSChannel type', () => {
    it('should include assistant in channel union', () => {
      const validChannels: WSChannel[] = ['search', 'assistant'];
      
      validChannels.forEach((channel) => {
        expect(['search', 'assistant']).toContain(channel);
      });
    });
  });

  describe('isWSClientMessage validation', () => {
    it('should accept assistant channel in canonical format', () => {
      const message = {
        v: 1,
        type: 'subscribe',
        channel: 'assistant',
        requestId: 'req-123',
        sessionId: 'session-456'
      };

      expect(isWSClientMessage(message)).toBe(true);
    });

    it('should accept assistant channel subscribe message', () => {
      const subscribeMsg = {
        v: 1,
        type: 'subscribe',
        channel: 'assistant',
        requestId: 'req-789'
      };

      expect(isWSClientMessage(subscribeMsg)).toBe(true);
    });

    it('should accept assistant channel unsubscribe message', () => {
      const unsubscribeMsg = {
        v: 1,
        type: 'unsubscribe',
        channel: 'assistant',
        requestId: 'req-999'
      };

      expect(isWSClientMessage(unsubscribeMsg)).toBe(true);
    });

    it('should reject invalid channel names', () => {
      const invalidMsg = {
        v: 1,
        type: 'subscribe',
        channel: 'invalid',
        requestId: 'req-000'
      };

      expect(isWSClientMessage(invalidMsg)).toBe(false);
    });
  });

  describe('normalizeToCanonical', () => {
    it('should normalize assistant channel message to canonical format', () => {
      const legacyMsg = {
        type: 'subscribe',
        channel: 'assistant',
        requestId: 'req-legacy',
        sessionId: 'session-legacy',
        payload: {}
      };

      const canonical = normalizeToCanonical(legacyMsg);

      expect(canonical).toMatchObject({
        v: 1,
        type: 'subscribe',
        channel: 'assistant',
        requestId: 'req-legacy',
        sessionId: 'session-legacy'
      });
    });
  });
});
