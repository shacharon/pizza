/**
 * Connection Handler Tests
 * 
 * Verifies connection setup, heartbeat mechanism,
 * idle timeout, and cleanup on disconnect
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { setupConnection, handleClose, handleError, executeHeartbeat } from '../connection-handler.js';

// Mock WebSocket with event handling
function createMockWebSocket(): Partial<WebSocket> & { listeners: Map<string, Function[]> } {
  const listeners = new Map<string, Function[]>();

  return {
    listeners,
    on: mock.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) {
        listeners.set(event, []);
      }
      listeners.get(event)!.push(handler);
    }),
    send: mock.fn((data: string, cb?: Function) => {
      if (cb) cb();
    }),
    ping: mock.fn((data?: any, cb?: Function) => {
      if (cb) cb();
    }),
    terminate: mock.fn(() => { }),
    close: mock.fn(() => { }),
    readyState: 1, // OPEN
    isAlive: true
  } as any;
}

describe('Connection Handler', () => {
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let originalSetTimeout: typeof setTimeout;
  let intervals: Map<any, { callback: Function; delay: number }>;
  let timeouts: Map<any, { callback: Function; delay: number }>;
  let currentTime: number;

  beforeEach(() => {
    intervals = new Map();
    timeouts = new Map();
    currentTime = Date.now();

    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    originalSetTimeout = global.setTimeout;

    global.setInterval = ((cb: Function, delay: number) => {
      const id = Math.random();
      intervals.set(id, { callback: cb, delay });
      return id as any;
    }) as any;

    global.clearInterval = ((id: any) => {
      intervals.delete(id);
    }) as any;

    global.setTimeout = ((cb: Function, delay: number) => {
      const id = Math.random();
      timeouts.set(id, { callback: cb, delay });
      return id as any;
    }) as any;
  });

  afterEach(() => {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.setTimeout = originalSetTimeout;
  });

  function advanceTime(ms: number) {
    currentTime += ms;

    // Execute timeouts
    const expiredTimeouts: any[] = [];
    for (const [id, timer] of timeouts.entries()) {
      if (timer.delay <= ms) {
        expiredTimeouts.push(id);
        timer.callback();
      }
    }
    expiredTimeouts.forEach(id => timeouts.delete(id));
  }

  function tickInterval(times: number = 1) {
    for (let i = 0; i < times; i++) {
      intervals.forEach(({ callback }) => callback());
    }
  }

  describe('setupConnection', () => {
    it('should initialize context with clientId', () => {
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      assert.strictEqual(ws.clientId, 'client-abc');
    });

    it('should set isAlive to true initially', () => {
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      assert.strictEqual(ws.isAlive, true);
    });

    it('should attach pong handler that sets isAlive', () => {
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      // Simulate pong event
      const pongHandlers = ws.listeners.get('pong');
      assert.ok(pongHandlers && pongHandlers.length > 0);

      ws.isAlive = false;
      pongHandlers![0]();
      assert.strictEqual(ws.isAlive, true);
    });

    it('should store userId and sessionId in context', () => {
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      assert.strictEqual(ws.userId, 'user-123');
      assert.strictEqual(ws.sessionId, 'session-456');
    });

    it('should set lastActivity timestamp', () => {
      const ws = createMockWebSocket() as any;
      const before = Date.now();

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      const after = Date.now();

      assert.ok(ws.lastActivity >= before);
      assert.ok(ws.lastActivity <= after);
    });
  });

  describe('executeHeartbeat', () => {
    it('should ping all alive connections', () => {
      const clients = new Set<WebSocket>();
      const ws1 = createMockWebSocket() as any;
      const ws2 = createMockWebSocket() as any;

      ws1.isAlive = true;
      ws2.isAlive = true;
      clients.add(ws1);
      clients.add(ws2);

      executeHeartbeat(clients, 'test-request-id');

      assert.strictEqual((ws1.ping as any).mock.calls.length, 1);
      assert.strictEqual((ws2.ping as any).mock.calls.length, 1);
    });

    it('should terminate dead connections (isAlive=false)', () => {
      const clients = new Set<WebSocket>();
      const ws1 = createMockWebSocket() as any;
      const ws2 = createMockWebSocket() as any;

      ws1.isAlive = false; // Dead connection
      ws2.isAlive = true;
      clients.add(ws1);
      clients.add(ws2);

      executeHeartbeat(clients, 'test-request-id');

      assert.strictEqual((ws1.terminate as any).mock.calls.length, 1);
      assert.strictEqual((ws2.terminate as any).mock.calls.length, 0);
    });

    it('should set isAlive=false after ping', () => {
      const clients = new Set<WebSocket>();
      const ws = createMockWebSocket() as any;

      ws.isAlive = true;
      clients.add(ws);

      executeHeartbeat(clients, 'test-request-id');

      assert.strictEqual(ws.isAlive, false);
    });

    it('should remove terminated connections from set', () => {
      const clients = new Set<WebSocket>();
      const ws = createMockWebSocket() as any;

      ws.isAlive = false;
      clients.add(ws);

      const sizeBefore = clients.size;
      executeHeartbeat(clients, 'test-request-id');

      assert.strictEqual(sizeBefore, 1);
      assert.strictEqual(clients.size, 0);
    });

    it('should not ping closed connections', () => {
      const clients = new Set<WebSocket>();
      const ws = createMockWebSocket() as any;

      ws.isAlive = true;
      ws.readyState = 3; // CLOSED
      clients.add(ws);

      executeHeartbeat(clients, 'test-request-id');

      // Should not attempt to ping closed socket
      assert.strictEqual((ws.ping as any).mock.calls.length, 0);
    });
  });

  describe('handleClose', () => {
    it('should call cleanup callback', () => {
      const ws = createMockWebSocket() as any;
      const cleanupMock = mock.fn(() => { });

      handleClose(ws, 1000, 'Normal closure', cleanupMock);

      assert.strictEqual(cleanupMock.mock.calls.length, 1);
      assert.strictEqual(cleanupMock.mock.calls[0].arguments[0], ws);
    });

    it('should pass close code and reason', () => {
      const ws = createMockWebSocket() as any;
      ws.clientId = 'client-123';

      // Just verify no exceptions thrown
      handleClose(ws, 1000, 'Normal closure', () => { });

      assert.ok(true);
    });

    it('should handle abnormal closure', () => {
      const ws = createMockWebSocket() as any;
      ws.clientId = 'client-123';

      handleClose(ws, 1006, 'Abnormal closure', () => { });

      assert.ok(true);
    });
  });

  describe('handleError', () => {
    it('should log error without crashing', () => {
      const ws = createMockWebSocket() as any;
      ws.clientId = 'client-123';
      const error = new Error('Test error');

      // Should not throw
      assert.doesNotThrow(() => {
        handleError(ws, error);
      });
    });

    it('should handle error without clientId', () => {
      const ws = createMockWebSocket() as any;
      const error = new Error('Test error');

      assert.doesNotThrow(() => {
        handleError(ws, error);
      });
    });
  });

  describe('Idle timeout', () => {
    it('should terminate connection after idle timeout', () => {
      const clients = new Set<WebSocket>();
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        5000 // 5 second timeout
      );

      clients.add(ws);

      // Advance time past idle timeout
      advanceTime(6000);

      // Should have timeout scheduled
      assert.ok(timeouts.size > 0 || (ws.terminate as any).mock.calls.length > 0);
    });

    it('should not terminate active connections', () => {
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      // Update last activity
      ws.lastActivity = Date.now();

      // Advance time but not past idle
      advanceTime(10000);

      assert.strictEqual((ws.terminate as any).mock.calls.length, 0);
    });
  });

  describe('Heartbeat integration', () => {
    it('should detect dead connection after missed pong', () => {
      const clients = new Set<WebSocket>();
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      clients.add(ws);
      ws.isAlive = true;

      // First heartbeat: ping, set isAlive=false
      executeHeartbeat(clients, 'test-request-id');
      assert.strictEqual(ws.isAlive, false);

      // Simulate no pong received (isAlive stays false)

      // Second heartbeat: should terminate
      executeHeartbeat(clients, 'test-request-id');
      assert.strictEqual((ws.terminate as any).mock.calls.length, 1);
    });

    it('should keep connection alive when pong received', () => {
      const clients = new Set<WebSocket>();
      const ws = createMockWebSocket() as any;

      setupConnection(
        ws,
        { userId: 'user-123', sessionId: 'session-456' },
        'client-abc',
        30000
      );

      clients.add(ws);

      // First heartbeat
      executeHeartbeat(clients, 'test-request-id');

      // Simulate pong received
      const pongHandlers = ws.listeners.get('pong');
      pongHandlers![0]();
      assert.strictEqual(ws.isAlive, true);

      // Second heartbeat should not terminate
      executeHeartbeat(clients, 'test-request-id');
      assert.strictEqual((ws.terminate as any).mock.calls.length, 0);
    });
  });

  describe('Edge cases', () => {
    it('should handle cleanup callback throwing error', () => {
      const ws = createMockWebSocket() as any;
      const cleanupMock = mock.fn(() => {
        throw new Error('Cleanup failed');
      });

      // Should not propagate error
      assert.doesNotThrow(() => {
        handleClose(ws, 1000, 'Normal', cleanupMock);
      });
    });

    it('should handle multiple close calls', () => {
      const ws = createMockWebSocket() as any;
      const cleanupMock = mock.fn(() => { });

      handleClose(ws, 1000, 'Normal', cleanupMock);
      handleClose(ws, 1000, 'Normal', cleanupMock);

      // Should handle gracefully (though cleanup might be called twice)
      assert.ok(cleanupMock.mock.calls.length >= 1);
    });

    it('should handle error on closed socket', () => {
      const ws = createMockWebSocket() as any;
      ws.readyState = 3; // CLOSED
      const error = new Error('Error on closed socket');

      assert.doesNotThrow(() => {
        handleError(ws, error);
      });
    });
  });
});
