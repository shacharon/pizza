/**
 * Phase 3: WebSocket Manager Integration Tests
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer, Server as HTTPServer } from 'http';
import WebSocket from 'ws';
import { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';

describe('WebSocketManager - Phase 3', () => {
  let server: HTTPServer;
  let wsManager: WebSocketManager;
  const PORT = 3999;

  before(() => {
    server = createServer();
    wsManager = new WebSocketManager(server, {
      path: '/ws',
      heartbeatIntervalMs: 60_000,
      allowedOrigins: ['*']
    });

    return new Promise<void>((resolve) => {
      server.listen(PORT, () => {
        console.log(`Test server listening on ${PORT}`);
        resolve();
      });
    });
  });

  after(() => {
    wsManager.shutdown();
    return new Promise<void>((resolve) => {
      server.close(() => {
        console.log('Test server closed');
        resolve();
      });
    });
  });

  it('should accept WebSocket connections', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
    });

    assert.strictEqual(ws.readyState, WebSocket.OPEN, 'WebSocket should be open');
    ws.close();
  });

  it('should handle subscribe message', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    // Send subscribe message
    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'test-req-123'
    }));

    // Wait a bit for subscription to be processed
    await new Promise(resolve => setTimeout(resolve, 100));

    const stats = wsManager.getStats();
    assert.strictEqual(stats.connections, 1, 'Should have 1 connection');
    assert.ok(stats.subscriptions >= 1, 'Should have at least 1 subscription');

    ws.close();
  });

  it('should publish messages to subscribers', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    // Subscribe
    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'test-req-456'
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    // Set up message listener
    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // Publish a message
    wsManager.publish('test-req-456', {
      type: 'status',
      requestId: 'test-req-456',
      status: 'streaming'
    });

    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.strictEqual(receivedMessages.length, 1, 'Should receive 1 message');
    assert.strictEqual(receivedMessages[0].type, 'status');
    assert.strictEqual(receivedMessages[0].status, 'streaming');

    ws.close();
  });

  it('should cleanup subscriptions on disconnect', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId: 'test-req-789'
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    const statsBefore = wsManager.getStats();
    assert.ok(statsBefore.subscriptions > 0, 'Should have subscriptions');

    // Close connection
    ws.close();

    await new Promise(resolve => setTimeout(resolve, 500));

    const statsAfter = wsManager.getStats();
    assert.strictEqual(statsAfter.connections, 0, 'Should have 0 connections after close');
  });

  it('should reject invalid messages', async () => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // Send invalid message
    ws.send(JSON.stringify({
      type: 'invalid_type',
      foo: 'bar'
    }));

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should receive an error message
    assert.ok(receivedMessages.length > 0, 'Should receive error response');
    const errorMsg = receivedMessages.find(m => m.type === 'error');
    assert.ok(errorMsg, 'Should receive error message');

    ws.close();
  });
});
