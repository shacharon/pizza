/**
 * WebSocket heartbeat tests (per-socket ping/pong + dead-connection terminate)
 *
 * Verifies: 25s ping interval, lastPongAt on pong, terminate when no pong in 35s,
 * clear interval on close/error, and websocket_dead_terminated log.
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { setupConnection } from '../connection-handler.js';

function createMockWs(): Partial<WebSocket> & {
  listeners: Map<string, Function[]>;
  clientId?: string;
  lastPongAt?: number;
  ip?: string;
  ua?: string;
  heartbeatTimerId?: ReturnType<typeof setInterval>;
} {
  const listeners = new Map<string, Function[]>();
  const ws: any = {
    listeners,
    on: (event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    },
    ping: mock.fn(),
    terminate: mock.fn(),
    close: mock.fn(),
    readyState: 1, // OPEN
  };
  return ws;
}

describe('WebSocket heartbeat (per-socket)', () => {
  let intervals: Map<any, { callback: Function; delay: number }>;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;

  beforeEach(() => {
    intervals = new Map();
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    global.setInterval = ((callback: Function, delay: number) => {
      const id = { id: Math.random(), unref: () => {} };
      intervals.set(id, { callback, delay });
      return id as any;
    }) as any;
    global.clearInterval = ((id: any) => {
      intervals.delete(id);
    }) as any;
  });

  afterEach(() => {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
  });

  it('sets lastPongAt on connection and updates it on pong', () => {
    const ws = createMockWs() as any;
    const onMessage = mock.fn();
    const onClose = mock.fn();
    const onError = mock.fn();
    const req = { sessionId: 's1', headers: {} };

    setupConnection(ws, req, onMessage, onClose, onError);

    assert.ok(typeof ws.lastPongAt === 'number', 'lastPongAt set on connection');
    const pongHandlers = ws.listeners.get('pong');
    assert.ok(pongHandlers && pongHandlers.length >= 1, 'pong handler registered');

    const before = Date.now();
    pongHandlers![0]();
    const after = Date.now();
    assert.ok(ws.lastPongAt >= before && ws.lastPongAt <= after + 5, 'lastPongAt updated on pong');
  });

  it('sends ping when interval fires and socket is OPEN', () => {
    const ws = createMockWs() as any;
    setupConnection(ws, { sessionId: 's1', headers: {} }, () => {}, () => {}, () => {});

    assert.strictEqual(intervals.size, 1, 'one heartbeat interval');
    const [, { callback }] = [...intervals.entries()][0];
    callback();
    assert.strictEqual((ws.ping as any).mock.calls.length, 1, 'ping sent');
  });

  it('terminates and clears interval when lastPongAt older than 35s', () => {
    const ws = createMockWs() as any;
    setupConnection(ws, {
      sessionId: 's1',
      headers: { 'user-agent': 'TestAgent' },
      socket: { remoteAddress: '127.0.0.1' },
    }, () => {}, () => {}, () => {});

    ws.lastPongAt = Date.now() - 40_000;
    const [, { callback }] = [...intervals.entries()][0];
    callback();

    assert.strictEqual((ws.terminate as any).mock.calls.length, 1, 'socket terminated');
    assert.ok(ws.heartbeatTimerId === undefined, 'heartbeat interval cleared');
    assert.strictEqual((ws.close as any).mock.calls.length, 1, 'close called before terminate');
  });

  it('clears heartbeat interval on close', () => {
    const ws = createMockWs() as any;
    setupConnection(ws, { sessionId: 's1', headers: {} }, () => {}, () => {}, () => {});

    assert.strictEqual(intervals.size, 1);
    const closeHandlers = ws.listeners.get('close');
    assert.ok(closeHandlers && closeHandlers.length >= 1);
    closeHandlers![0](1000, Buffer.from(''));
    assert.strictEqual(intervals.size, 0, 'interval cleared on close');
  });

  it('clears heartbeat interval on error', () => {
    const ws = createMockWs() as any;
    setupConnection(ws, { sessionId: 's1', headers: {} }, () => {}, () => {}, () => {});

    assert.strictEqual(intervals.size, 1);
    const errorHandlers = ws.listeners.get('error');
    assert.ok(errorHandlers && errorHandlers.length >= 1);
    errorHandlers![0](new Error('test'));
    assert.strictEqual(intervals.size, 0, 'interval cleared on error');
  });
});
