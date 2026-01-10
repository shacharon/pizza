/**
 * Phase 3: WebSocket Late-Subscriber Replay Test
 * Verifies that clients connecting after assistant completion receive cached state
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { createServer, Server as HTTPServer } from 'http';
import WebSocket from 'ws';
import { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';
import { InMemoryRequestStore } from '../src/infra/state/in-memory-request-store.js';
import type { RequestState } from '../src/infra/state/request-state.store.js';

describe('WebSocket Replay - Phase 3', () => {
  let server: HTTPServer;
  let wsManager: WebSocketManager;
  let stateStore: InMemoryRequestStore;
  const PORT = 4002;

  before(() => {
    server = createServer();
    stateStore = new InMemoryRequestStore(300, 60_000);

    wsManager = new WebSocketManager(server, {
      path: '/ws',
      heartbeatIntervalMs: 60_000,
      allowedOrigins: ['*'],
      requestStateStore: stateStore
    });

    return new Promise<void>((resolve) => {
      server.listen(PORT, () => {
        console.log(`Replay test server listening on ${PORT}`);
        resolve();
      });
    });
  });

  after(() => {
    stateStore.shutdown();
    wsManager.shutdown();
    return new Promise<void>((resolve) => {
      server.close(() => {
        console.log('Replay test server closed');
        resolve();
      });
    });
  });

  it('should replay completed assistant output to late subscriber', async () => {
    const requestId = 'replay-test-req-123';

    // Seed state store with completed assistant job
    const state: RequestState = {
      requestId,
      sessionId: 'test-session',
      coreResult: {
        requestId,
        sessionId: 'test-session',
        query: { original: 'test', parsed: {} as any, language: 'en' },
        results: [],
        chips: [],
        truthState: {} as any,
        meta: {} as any
      },
      assistantStatus: 'completed',
      assistantOutput: 'Found 10 great pizza places in Tel Aviv!',
      recommendations: [
        { id: 'action-1', type: 'VIEW_DETAILS', level: 0, label: 'View Details', icon: '👁️', enabled: true },
        { id: 'action-2', type: 'GET_DIRECTIONS', level: 0, label: 'Directions', icon: '🗺️', enabled: true }
      ],
      seed: 12345,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    };

    await stateStore.set(requestId, state);

    // Connect WebSocket (late subscriber)
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    // Collect messages
    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // Subscribe to requestId
    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId
    }));

    // Wait for replay messages
    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify replay messages
    assert.ok(receivedMessages.length > 0, 'Should receive replay messages');

    // Should receive status message
    const statusMsg = receivedMessages.find(m => m.type === 'status');
    assert.ok(statusMsg, 'Should receive status message');
    assert.strictEqual(statusMsg.status, 'completed');

    // Should receive stream.done with cached output
    const doneMsg = receivedMessages.find(m => m.type === 'stream.done');
    assert.ok(doneMsg, 'Should receive stream.done message');
    assert.strictEqual(doneMsg.fullText, 'Found 10 great pizza places in Tel Aviv!');

    // Should receive recommendations
    const recMsg = receivedMessages.find(m => m.type === 'recommendation');
    assert.ok(recMsg, 'Should receive recommendation message');
    assert.strictEqual(recMsg.actions.length, 2);

    ws.close();
  });

  it('should not replay if no state exists', async () => {
    const requestId = 'replay-test-no-state';

    // Do NOT seed state

    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    // Subscribe
    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId
    }));

    await new Promise(resolve => setTimeout(resolve, 300));

    // Should not receive any replay messages
    assert.strictEqual(receivedMessages.length, 0, 'Should not receive replay when no state');

    ws.close();
  });

  it('should replay pending status if assistant not complete', async () => {
    const requestId = 'replay-test-pending';

    // Seed state with pending status
    const state: RequestState = {
      requestId,
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 12345,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    };

    await stateStore.set(requestId, state);

    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId
    }));

    await new Promise(resolve => setTimeout(resolve, 300));

    // Should only receive status (no output/recommendations)
    const statusMsg = receivedMessages.find(m => m.type === 'status');
    assert.ok(statusMsg, 'Should receive status message');
    assert.strictEqual(statusMsg.status, 'pending');

    const doneMsg = receivedMessages.find(m => m.type === 'stream.done');
    assert.strictEqual(doneMsg, undefined, 'Should NOT receive stream.done for pending state');

    ws.close();
  });

  it('should replay streaming status with partial output', async () => {
    const requestId = 'replay-test-streaming';

    // Seed state with streaming status and partial output
    const state: RequestState = {
      requestId,
      coreResult: {} as any,
      assistantStatus: 'streaming',
      assistantOutput: 'Found 10...',
      seed: 12345,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    };

    await stateStore.set(requestId, state);

    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);

    await new Promise<void>((resolve) => {
      ws.on('open', () => resolve());
    });

    const receivedMessages: any[] = [];
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()));
    });

    ws.send(JSON.stringify({
      type: 'subscribe',
      requestId
    }));

    await new Promise(resolve => setTimeout(resolve, 300));

    const statusMsg = receivedMessages.find(m => m.type === 'status');
    assert.strictEqual(statusMsg.status, 'streaming');

    const doneMsg = receivedMessages.find(m => m.type === 'stream.done');
    assert.ok(doneMsg, 'Should receive partial output');
    assert.strictEqual(doneMsg.fullText, 'Found 10...');

    ws.close();
  });
});
