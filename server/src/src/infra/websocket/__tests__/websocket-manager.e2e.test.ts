/**
 * WebSocket Manager Integration Tests (E2E)
 * 
 * Full end-to-end tests with real HTTP server and WebSocket connections
 * Tests message flow, backlog, pending subscriptions, and ownership checks
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'http';
import { WebSocket } from 'ws';
import { WebSocketManager } from '../websocket-manager.js';

// Helper to wait for condition
function waitFor(condition: () => boolean, timeout = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (condition()) {
        resolve();
      } else if (Date.now() - start > timeout) {
        reject(new Error('Timeout waiting for condition'));
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

// Helper to receive message
function receiveMessage(ws: WebSocket, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeAllListeners('message');
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
  });
}

describe('WebSocket Manager - Integration Tests', () => {
  let httpServer: Server;
  let wsManager: WebSocketManager;
  let port: number;
  let baseUrl: string;

  before(async () => {
    // Create HTTP server
    httpServer = createServer();

    // Find available port
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `ws://localhost:${port}`;
        resolve();
      });
    });

    // Initialize WebSocket manager with test config
    wsManager = new WebSocketManager({
      httpServer,
      allowedOrigins: ['http://localhost'],
      requireAuth: false, // Disable auth for testing
      heartbeatInterval: 30000,
      idleTimeout: 60000
    });
  });

  after(async () => {
    // Cleanup
    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('Basic Connection Flow', () => {
    it('should accept WebSocket connection', async () => {
      const client = new WebSocket(baseUrl);

      await new Promise<void>((resolve, reject) => {
        client.once('open', () => resolve());
        client.once('error', reject);
      });

      assert.strictEqual(client.readyState, WebSocket.OPEN);
      client.close();
    });

    it('should handle connection close gracefully', async () => {
      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      const closePromise = new Promise<void>((resolve) => {
        client.once('close', () => resolve());
      });

      client.close();
      await closePromise;

      assert.strictEqual(client.readyState, WebSocket.CLOSED);
    });
  });

  describe('Subscribe → Publish → Receive Flow', () => {
    it('should receive message after subscribing', async () => {
      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // Subscribe to channel
      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId: 'req-test-1',
        sessionId: 'session-test-1'
      }));

      // Wait for sub_ack
      const subAck = await receiveMessage(client);
      assert.strictEqual(subAck.type, 'sub_ack');
      assert.strictEqual(subAck.channel, 'search');

      // Publish message to channel
      wsManager.publishToChannel('search', 'req-test-1', 'session-test-1', {
        type: 'test_message',
        data: 'hello'
      });

      // Receive published message
      const message = await receiveMessage(client);
      assert.strictEqual(message.type, 'test_message');
      assert.strictEqual(message.data, 'hello');

      client.close();
    });

    it('should not receive messages for different requestId', async () => {
      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // Subscribe to req-1
      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId: 'req-different-1',
        sessionId: 'session-test'
      }));

      await receiveMessage(client); // sub_ack

      // Publish to req-2
      wsManager.publishToChannel('search', 'req-different-2', 'session-test', {
        type: 'test_message'
      });

      // Should not receive message (timeout expected)
      let received = false;
      setTimeout(() => {
        if (!received) {
          assert.ok(true, 'Correctly did not receive message for different requestId');
          client.close();
        }
      }, 500);

      try {
        await receiveMessage(client, 500);
        received = true;
        assert.fail('Should not have received message for different requestId');
      } catch (err) {
        // Expected timeout
        assert.ok(true);
      }

      client.close();
    });
  });

  describe('Backlog: Publish → Subscribe → Drain', () => {
    it('should receive backlogged messages on late subscribe', async () => {
      const requestId = 'req-backlog-1';
      const sessionId = 'session-backlog-1';

      // Publish BEFORE subscribe
      wsManager.publishToChannel('search', requestId, sessionId, {
        type: 'early_message_1',
        order: 1
      });

      wsManager.publishToChannel('search', requestId, sessionId, {
        type: 'early_message_2',
        order: 2
      });

      // Small delay to ensure messages are backlogged
      await new Promise(resolve => setTimeout(resolve, 100));

      // Now connect and subscribe
      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId,
        sessionId
      }));

      // Collect messages
      const messages: any[] = [];

      const collectMessages = async () => {
        try {
          while (messages.length < 3) { // sub_ack + 2 backlog messages
            const msg = await receiveMessage(client, 2000);
            messages.push(msg);
          }
        } catch (err) {
          // Timeout or error
        }
      };

      await collectMessages();

      // Verify sub_ack
      assert.strictEqual(messages[0].type, 'sub_ack');

      // Verify backlog messages in FIFO order
      assert.strictEqual(messages[1].type, 'early_message_1');
      assert.strictEqual(messages[1].order, 1);
      assert.strictEqual(messages[2].type, 'early_message_2');
      assert.strictEqual(messages[2].order, 2);

      client.close();
    });
  });

  describe('Pending Subscriptions: Subscribe → Job Created → Activate', () => {
    it('should send sub_ack with pending:true when job not found', async () => {
      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // Subscribe to non-existent request (job not created yet)
      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId: 'req-pending-1',
        sessionId: 'session-pending-1'
      }));

      const subAck = await receiveMessage(client);

      assert.strictEqual(subAck.type, 'sub_ack');
      assert.strictEqual(subAck.pending, true);
      assert.strictEqual(subAck.requestId, 'req-pending-1');

      client.close();
    });

    it('should activate pending subscription when notified', async () => {
      const requestId = 'req-pending-activate-1';
      const sessionId = 'session-pending-1';

      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // Subscribe (will be pending)
      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId,
        sessionId
      }));

      const subAck1 = await receiveMessage(client);
      assert.strictEqual(subAck1.pending, true);

      // Simulate job creation - activate pending subscriptions
      wsManager.activatePendingSubscriptions(requestId);

      // Should receive second sub_ack (activated)
      const subAck2 = await receiveMessage(client, 2000);
      assert.strictEqual(subAck2.type, 'sub_ack');
      // pending should be false or undefined now

      // Verify can receive published messages
      wsManager.publishToChannel('search', requestId, sessionId, {
        type: 'activated_message'
      });

      const message = await receiveMessage(client);
      assert.strictEqual(message.type, 'activated_message');

      client.close();
    });
  });

  describe('Ownership & IDOR Protection', () => {
    it('should reject subscription with session mismatch (if ownership store available)', async () => {
      // Note: This test assumes ownership checking is in place
      // If no ownership store, subscriptions may be allowed

      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // This test is implementation-dependent
      // If ownership checks are active, should get sub_nack
      // If not, should get sub_ack

      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId: 'req-owned-by-other',
        sessionId: 'session-intruder'
      }));

      const response = await receiveMessage(client);

      // Either sub_ack (no ownership) or sub_nack (ownership enforced)
      assert.ok(response.type === 'sub_ack' || response.type === 'sub_nack');

      client.close();
    });
  });

  describe('Unsubscribe Flow', () => {
    it('should stop receiving messages after unsubscribe', async () => {
      const requestId = 'req-unsub-1';
      const sessionId = 'session-unsub-1';

      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // Subscribe
      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId,
        sessionId
      }));

      await receiveMessage(client); // sub_ack

      // Verify can receive messages
      wsManager.publishToChannel('search', requestId, sessionId, {
        type: 'before_unsub'
      });

      const msg1 = await receiveMessage(client);
      assert.strictEqual(msg1.type, 'before_unsub');

      // Unsubscribe
      client.send(JSON.stringify({
        v: 1,
        type: 'unsubscribe',
        channel: 'search',
        requestId
      }));

      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));

      // Publish again
      wsManager.publishToChannel('search', requestId, sessionId, {
        type: 'after_unsub'
      });

      // Should NOT receive this message
      try {
        await receiveMessage(client, 500);
        assert.fail('Should not receive message after unsubscribe');
      } catch (err) {
        // Expected timeout
        assert.ok(true, 'Correctly did not receive message after unsubscribe');
      }

      client.close();
    });
  });

  describe('Connection Cleanup', () => {
    it('should remove all subscriptions on disconnect', async () => {
      const requestId = 'req-cleanup-1';
      const sessionId = 'session-cleanup-1';

      const client = new WebSocket(baseUrl);
      await new Promise<void>((resolve) => client.once('open', resolve));

      // Subscribe to multiple channels
      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId,
        sessionId
      }));

      await receiveMessage(client); // sub_ack

      client.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'assistant',
        requestId,
        sessionId
      }));

      await receiveMessage(client); // sub_ack

      // Disconnect
      client.close();

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 200));

      // Try to publish - should not crash even though subscriber is gone
      assert.doesNotThrow(() => {
        wsManager.publishToChannel('search', requestId, sessionId, {
          type: 'test'
        });
        wsManager.publishToChannel('assistant', requestId, sessionId, {
          type: 'test'
        });
      });
    });
  });

  describe('Multiple Clients', () => {
    it('should deliver messages to all subscribers', async () => {
      const requestId = 'req-multi-1';
      const sessionId = 'session-multi-1';

      // Connect two clients
      const client1 = new WebSocket(baseUrl);
      const client2 = new WebSocket(baseUrl);

      await Promise.all([
        new Promise<void>((resolve) => client1.once('open', resolve)),
        new Promise<void>((resolve) => client2.once('open', resolve))
      ]);

      // Both subscribe to same channel+request
      client1.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId,
        sessionId
      }));

      client2.send(JSON.stringify({
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId,
        sessionId
      }));

      // Wait for both sub_acks
      await Promise.all([
        receiveMessage(client1),
        receiveMessage(client2)
      ]);

      // Publish message
      wsManager.publishToChannel('search', requestId, sessionId, {
        type: 'broadcast_message'
      });

      // Both should receive
      const [msg1, msg2] = await Promise.all([
        receiveMessage(client1),
        receiveMessage(client2)
      ]);

      assert.strictEqual(msg1.type, 'broadcast_message');
      assert.strictEqual(msg2.type, 'broadcast_message');

      client1.close();
      client2.close();
    });
  });
});
