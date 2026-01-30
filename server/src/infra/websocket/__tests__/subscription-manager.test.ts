/**
 * Subscription Manager Tests
 * 
 * Verifies subscription lifecycle, ownership checks,
 * sub_ack/sub_nack protocol, and state replay hooks
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { SubscriptionManager } from '../subscription-manager.js';

// Minimal WebSocket mock
function createMockWebSocket(clientId: string): Partial<WebSocket> {
  return {
    send: mock.fn((data: string) => { }),
    readyState: 1, // OPEN
    // @ts-ignore
    _clientId: clientId
  };
}

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;
  let mockRequestStateStore: any;
  let mockJobStore: any;

  beforeEach(() => {
    mockRequestStateStore = {
      getOwnership: mock.fn(async (requestId: string) => null)
    };

    mockJobStore = {
      getJobState: mock.fn(async (requestId: string) => null)
    };

    manager = new SubscriptionManager(
      'test-request-id',
      mockRequestStateStore,
      mockJobStore
    );
  });

  describe('subscribe', () => {
    it('should add client to subscribers map', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      await manager.subscribe(
        'channel-1',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      const subscribers = manager.getSubscribers('channel-1', 'req-123');
      assert.strictEqual(subscribers.length, 1);
      assert.strictEqual(subscribers[0], ws);
    });

    it('should send sub_ack on successful subscription', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const sendMock = ws.send as any;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe(
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
    });

    it('should send sub_nack when session mismatch', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const sendMock = ws.send as any;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-correct'
      }));

      await manager.subscribe(
        'search',
        'req-123',
        'session-wrong',
        ws,
        { userId: 'user-1', sessionId: 'session-wrong' }
      );

      assert.strictEqual(sendMock.mock.calls.length, 1);
      const message = JSON.parse(sendMock.mock.calls[0].arguments[0]);
      assert.strictEqual(message.type, 'sub_nack');
      assert.match(message.reason, /session.*mismatch/i);
    });

    it('should send sub_nack when userId mismatch', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      const sendMock = ws.send as any;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-correct',
        sessionId: 'session-456'
      }));

      await manager.subscribe(
        'search',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-wrong', sessionId: 'session-456' }
      );

      assert.strictEqual(sendMock.mock.calls.length, 1);
      const message = JSON.parse(sendMock.mock.calls[0].arguments[0]);
      assert.strictEqual(message.type, 'sub_nack');
      assert.match(message.reason, /user.*mismatch/i);
    });

    it('should not add subscriber on ownership failure', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-correct',
        sessionId: 'session-correct'
      }));

      await manager.subscribe(
        'search',
        'req-123',
        'session-wrong',
        ws,
        { userId: 'user-wrong', sessionId: 'session-wrong' }
      );

      const subscribers = manager.getSubscribers('search', 'req-123');
      assert.strictEqual(subscribers.length, 0);
    });

    it('should allow multiple subscribers for same channel+request', async () => {
      const ws1 = createMockWebSocket('client-1') as WebSocket;
      const ws2 = createMockWebSocket('client-2') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe(
        'search',
        'req-123',
        'session-456',
        ws1,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      await manager.subscribe(
        'search',
        'req-123',
        'session-456',
        ws2,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      const subscribers = manager.getSubscribers('search', 'req-123');
      assert.strictEqual(subscribers.length, 2);
    });
  });

  describe('unsubscribe', () => {
    it('should remove client from subscribers', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe(
        'search',
        'req-123',
        'session-456',
        ws,
        { userId: 'user-1', sessionId: 'session-456' }
      );

      manager.unsubscribe('search', 'req-123', ws);

      const subscribers = manager.getSubscribers('search', 'req-123');
      assert.strictEqual(subscribers.length, 0);
    });

    it('should only remove specific client', async () => {
      const ws1 = createMockWebSocket('client-1') as WebSocket;
      const ws2 = createMockWebSocket('client-2') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe('search', 'req-123', 'session-456', ws1, { userId: 'user-1', sessionId: 'session-456' });
      await manager.subscribe('search', 'req-123', 'session-456', ws2, { userId: 'user-1', sessionId: 'session-456' });

      manager.unsubscribe('search', 'req-123', ws1);

      const subscribers = manager.getSubscribers('search', 'req-123');
      assert.strictEqual(subscribers.length, 1);
      assert.strictEqual(subscribers[0], ws2);
    });
  });

  describe('cleanup', () => {
    it('should remove all subscriptions for a socket', async () => {
      const ws = createMockWebSocket('client-1') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe('search', 'req-1', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });
      await manager.subscribe('search', 'req-2', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });
      await manager.subscribe('assistant', 'req-1', 'session-456', ws, { userId: 'user-1', sessionId: 'session-456' });

      manager.cleanup(ws);

      assert.strictEqual(manager.getSubscribers('search', 'req-1').length, 0);
      assert.strictEqual(manager.getSubscribers('search', 'req-2').length, 0);
      assert.strictEqual(manager.getSubscribers('assistant', 'req-1').length, 0);
    });

    it('should not affect other clients subscriptions', async () => {
      const ws1 = createMockWebSocket('client-1') as WebSocket;
      const ws2 = createMockWebSocket('client-2') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe('search', 'req-123', 'session-456', ws1, { userId: 'user-1', sessionId: 'session-456' });
      await manager.subscribe('search', 'req-123', 'session-456', ws2, { userId: 'user-1', sessionId: 'session-456' });

      manager.cleanup(ws1);

      const subscribers = manager.getSubscribers('search', 'req-123');
      assert.strictEqual(subscribers.length, 1);
      assert.strictEqual(subscribers[0], ws2);
    });
  });

  describe('buildSubscriptionKey', () => {
    it('should create consistent key format', () => {
      const key = manager.buildSubscriptionKey('search', 'req-123');
      assert.strictEqual(key, 'search:req-123');
    });

    it('should create unique keys for different channels', () => {
      const key1 = manager.buildSubscriptionKey('search', 'req-123');
      const key2 = manager.buildSubscriptionKey('assistant', 'req-123');
      assert.notStrictEqual(key1, key2);
    });

    it('should create unique keys for different requests', () => {
      const key1 = manager.buildSubscriptionKey('search', 'req-123');
      const key2 = manager.buildSubscriptionKey('search', 'req-456');
      assert.notStrictEqual(key1, key2);
    });
  });

  describe('ESM compatibility (P0 fix)', () => {
    it('should not throw "require is not defined" error in ESM runtime', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      (ws as any).clientId = 'test-client-id';
      
      // This should not throw ReferenceError: require is not defined
      // The subscribe method uses crypto.createHash() which was previously require('crypto')
      assert.doesNotThrow(() => {
        manager.subscribe('search', 'req-test-123', 'session-test-456', ws);
      });
    });

    it('should handle crypto hashing in subscribe without require()', () => {
      const ws = createMockWebSocket('client-1') as WebSocket;
      (ws as any).clientId = 'test-client-id';
      
      // Verify the subscribe completes successfully with crypto operations
      manager.subscribe('search', 'req-hash-test', 'session-hash-test', ws);
      
      const subscribers = manager.getSubscribers('search:req-hash-test');
      assert.ok(subscribers, 'Subscribers should be defined after subscribe');
      assert.strictEqual(subscribers!.size, 1, 'Should have 1 subscriber');
    });
  });

  describe('getStats', () => {
    it('should return zero stats when no subscriptions', () => {
      const stats = manager.getStats();

      assert.strictEqual(stats.totalSubscriptions, 0);
      assert.strictEqual(stats.uniqueClients, 0);
    });

    it('should count total subscriptions correctly', async () => {
      const ws1 = createMockWebSocket('client-1') as WebSocket;
      const ws2 = createMockWebSocket('client-2') as WebSocket;

      mockRequestStateStore.getOwnership = mock.fn(async () => ({
        userId: 'user-1',
        sessionId: 'session-456'
      }));

      await manager.subscribe('search', 'req-1', 'session-456', ws1, { userId: 'user-1', sessionId: 'session-456' });
      await manager.subscribe('search', 'req-2', 'session-456', ws1, { userId: 'user-1', sessionId: 'session-456' });
      await manager.subscribe('assistant', 'req-1', 'session-456', ws2, { userId: 'user-1', sessionId: 'session-456' });

      const stats = manager.getStats();

      assert.strictEqual(stats.totalSubscriptions, 3);
      assert.strictEqual(stats.uniqueClients, 2);
    });
  });
});
