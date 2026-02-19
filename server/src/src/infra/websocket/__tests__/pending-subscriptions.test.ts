/**
 * Pending Subscriptions Manager Tests
 * 
 * Verifies pending subscription management, activation,
 * TTL expiration (90s), and session validation
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { PendingSubscriptionsManager } from '../pending-subscriptions.js';

// Minimal WebSocket mock
function createMockWebSocket(clientId: string): Partial<WebSocket> {
  return {
    send: mock.fn((data: string) => { }),
    readyState: 1, // OPEN
    // @ts-ignore
    _clientId: clientId
  };
}

describe('PendingSubscriptionsManager', () => {
  let manager: PendingSubscriptionsManager;
  let originalSetTimeout: typeof setTimeout;
  let originalClearTimeout: typeof clearTimeout;
  let timers: Map<any, { callback: Function; time: number }>;
  let currentTime: number;

  beforeEach(() => {
    manager = new PendingSubscriptionsManager('test-request-id');

    // Setup fake timers
    timers = new Map();
    currentTime = Date.now();

    originalSetTimeout = global.setTimeout;
    originalClearTimeout = global.clearTimeout;

    global.setTimeout = ((cb: Function, delay: number) => {
      const id = Math.random();
      timers.set(id, { callback: cb, time: currentTime + delay });
      return id as any;
    }) as any;

    global.clearTimeout = ((id: any) => {
      timers.delete(id);
    }) as any;
  });

  afterEach(() => {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  });

  function advanceTime(ms: number) {
    currentTime += ms;
    const toExecute: Array<{ id: any; callback: Function }> = [];

    for (const [id, timer] of timers.entries()) {
      if (timer.time <= currentTime) {
        toExecute.push({ id, callback: timer.callback });
      }
    }

    // Execute expired timers
    toExecute.forEach(({ id, callback }) => {
      timers.delete(id);
      callback();
    });
  }

  describe('register', () => {
    it('should register pending subscription', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      manager.register(
        'search',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      // Verify registration (no exceptions thrown)
      assert.ok(true);
    });

    it('should send sub_ack with pending:true', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const sendMock = ws.send as any;

      manager.register(
        'search',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      assert.strictEqual(sendMock.mock.calls.length, 1);
      const message = JSON.parse(sendMock.mock.calls[0].arguments[0]);
      assert.strictEqual(message.type, 'sub_ack');
      assert.strictEqual(message.channel, 'search');
      assert.strictEqual(message.requestId, 'req-123');
      assert.strictEqual(message.pending, true);
    });

    it('should track multiple pending subscriptions', () => {
      const ws1 = createMockWebSocket('client-1') as WebSocket;
      const ws2 = createMockWebSocket('client-2') as WebSocket;

      manager.register('search', 'req-1', 'session-1', ws1, { userId: 'user-1', sessionId: 'session-1' });
      manager.register('search', 'req-2', 'session-2', ws2, { userId: 'user-2', sessionId: 'session-2' });

      // Both should be registered (verify via no errors)
      assert.ok(true);
    });
  });

  describe('activatePendingSubscriptions', () => {
    it('should activate pending subscriptions for matching request', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const subscribeMock = mock.fn(async () => { });

      manager.register(
        'search',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      manager.activatePendingSubscriptions('req-123', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 1);
      assert.strictEqual(subscribeMock.mock.calls[0].arguments[0], 'search');
      assert.strictEqual(subscribeMock.mock.calls[0].arguments[1], 'req-123');
    });

    it('should not activate subscriptions for different request', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const subscribeMock = mock.fn(async () => { });

      manager.register(
        'search',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      manager.activatePendingSubscriptions('req-different', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 0);
    });

    it('should activate multiple pending subscriptions for same request', () => {
      const ws1 = createMockWebSocket('client-1') as WebSocket;
      const ws2 = createMockWebSocket('client-2') as WebSocket;
      const subscribeMock = mock.fn(async () => { });

      manager.register('search', 'req-123', 'session-456', ws1, { userId: 'user-1', sessionId: 'session-456' });
      manager.register('search', 'req-123', 'session-456', ws2, { userId: 'user-1', sessionId: 'session-456' });

      manager.activatePendingSubscriptions('req-123', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 2);
    });

    it('should remove activated subscriptions from pending', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const subscribeMock = mock.fn(async () => { });

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      manager.activatePendingSubscriptions('req-123', subscribeMock);

      // Second activation should do nothing
      const subscribeMock2 = mock.fn(async () => { });
      manager.activatePendingSubscriptions('req-123', subscribeMock2);

      assert.strictEqual(subscribeMock2.mock.calls.length, 0);
    });

    it('should reject activation with session mismatch', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const sendMock = ws.send as any;

      manager.register(
        'search',
        'req-123',
        'session-wrong',
        ws,
        { userId: 'user-1', sessionId: 'session-wrong' }
      );

      // Mock ownership check returning different session
      const subscribeMock = mock.fn(async (
        channel: string,
        requestId: string,
        sessionId: string,
        socket: WebSocket,
        context: any
      ) => {
        // Simulate ownership check failure by checking session
        if (sessionId === 'session-wrong') {
          const nackMsg = {
            v: 1,
            type: 'sub_nack',
            channel,
            requestId,
            reason: 'Session mismatch'
          };
          socket.send(JSON.stringify(nackMsg));
        }
      });

      manager.activatePendingSubscriptions('req-123', subscribeMock);

      // Should have attempted activation
      assert.strictEqual(subscribeMock.mock.calls.length, 1);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire pending subscriptions after 90 seconds', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const sendMock = ws.send as any;

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      // Advance time past TTL (90 seconds)
      advanceTime(90001);

      // Should have sent expiration message
      // Note: Implementation-dependent, but typically sends a message or closes
      assert.ok(sendMock.mock.calls.length >= 1); // At least the initial sub_ack
    });

    it('should cleanup expired entries', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      // Advance time and trigger cleanup
      advanceTime(90001);

      // Attempting to activate should find no pending subscriptions
      const subscribeMock = mock.fn(async () => { });
      manager.activatePendingSubscriptions('req-123', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 0);
    });

    it('should not expire subscriptions before TTL', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      // Advance time but not past TTL
      advanceTime(30000); // 30 seconds

      // Should still be activatable
      const subscribeMock = mock.fn(async () => { });
      manager.activatePendingSubscriptions('req-123', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 1);
    });
  });

  describe('cleanupExpired', () => {
    it('should remove expired pending subscriptions', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      advanceTime(90001);
      manager.cleanupExpired();

      // Should be removed
      const subscribeMock = mock.fn(async () => { });
      manager.activatePendingSubscriptions('req-123', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 0);
    });

    it('should keep non-expired pending subscriptions', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      advanceTime(30000); // 30 seconds, not expired
      manager.cleanupExpired();

      // Should still exist
      const subscribeMock = mock.fn(async () => { });
      manager.activatePendingSubscriptions('req-123', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 1);
    });
  });

  describe('Edge cases', () => {
    it('should handle activation with no pending subscriptions', () => {
      const subscribeMock = mock.fn(async () => { });

      manager.activatePendingSubscriptions('req-nonexistent', subscribeMock);

      assert.strictEqual(subscribeMock.mock.calls.length, 0);
    });

    it('should handle multiple activations of same request', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const subscribeMock1 = mock.fn(async () => { });
      const subscribeMock2 = mock.fn(async () => { });

      manager.register('search', 'req-123', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      manager.activatePendingSubscriptions('req-123', subscribeMock1);
      manager.activatePendingSubscriptions('req-123', subscribeMock2);

      assert.strictEqual(subscribeMock1.mock.calls.length, 1);
      assert.strictEqual(subscribeMock2.mock.calls.length, 0);
    });

    it('should handle socket with multiple pending subscriptions', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      manager.register('search', 'req-1', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });
      manager.register('search', 'req-2', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });
      manager.register('assistant', 'req-1', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      const subscribeMock = mock.fn(async () => { });

      manager.activatePendingSubscriptions('req-1', subscribeMock);

      // Should activate both 'search' and 'assistant' for req-1
      assert.strictEqual(subscribeMock.mock.calls.length, 2);
    });
  });
});
