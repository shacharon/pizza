/**
 * WebSocket Manager Initialization Tests
 * 
 * Tests that WebSocketManager properly initializes all services
 * and provides defensive guardrails against undefined dependencies
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'http';
import { WebSocketManager } from '../websocket-manager.js';

describe('WebSocketManager - Initialization & Defensive Guardrails', () => {
  let httpServer: Server;
  let wsManager: WebSocketManager;
  let originalAuthEnv: string | undefined;

  before(async () => {
    // Disable auth requirement for tests
    originalAuthEnv = process.env.WS_REQUIRE_AUTH;
    process.env.WS_REQUIRE_AUTH = 'false';

    // Create minimal HTTP server
    httpServer = createServer();
    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => resolve());
    });
  });

  after(async () => {
    // Restore original auth setting
    if (originalAuthEnv !== undefined) {
      process.env.WS_REQUIRE_AUTH = originalAuthEnv;
    } else {
      delete process.env.WS_REQUIRE_AUTH;
    }

    if (httpServer) {
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  });

  describe('Service Initialization', () => {
    it('should initialize WebSocketManager without throwing', () => {
      assert.doesNotThrow(() => {
        wsManager = new WebSocketManager(httpServer, {
          path: '/ws-test',
          allowedOrigins: ['*']
        });
      });
    });

    it('should have publisher service initialized', () => {
      // Access private field for testing (TypeScript workaround)
      const manager = wsManager as any;
      assert.ok(manager.publisher, 'publisher should be initialized');
      assert.strictEqual(typeof manager.publisher.publishToChannel, 'function');
    });

    it('should have subscriptionActivator service initialized', () => {
      const manager = wsManager as any;
      assert.ok(manager.subscriptionActivator, 'subscriptionActivator should be initialized');
      assert.strictEqual(typeof manager.subscriptionActivator.activatePendingSubscriptions, 'function');
    });

    it('should have backlogDrainer service initialized', () => {
      const manager = wsManager as any;
      assert.ok(manager.backlogDrainer, 'backlogDrainer should be initialized');
      assert.strictEqual(typeof manager.backlogDrainer.drain, 'function');
    });
  });

  describe('Defensive Guardrails - publishToChannel', () => {
    it('should not throw when publishing to a channel', () => {
      assert.doesNotThrow(() => {
        const result = wsManager.publishToChannel('search', 'req-test-123', undefined, {
          type: 'status',
          requestId: 'req-test-123',
          status: 'running',
          progress: 50
        });

        // Should return a valid summary (even if no subscribers)
        assert.ok(result);
        assert.strictEqual(typeof result.attempted, 'number');
        assert.strictEqual(typeof result.sent, 'number');
        assert.strictEqual(typeof result.failed, 'number');
      });
    });

    it('should return zero summary when no subscribers', () => {
      const result = wsManager.publishToChannel('search', 'req-nonexistent', undefined, {
        type: 'status',
        requestId: 'req-nonexistent',
        status: 'running',
        progress: 25
      });

      assert.strictEqual(result.attempted, 0);
      assert.strictEqual(result.sent, 0);
      assert.strictEqual(result.failed, 0);
    });
  });

  describe('Defensive Guardrails - activatePendingSubscriptions', () => {
    it('should not throw when activating pending subscriptions', () => {
      assert.doesNotThrow(() => {
        wsManager.activatePendingSubscriptions('req-test-456', 'session-test');
      });
    });

    it('should handle non-existent requestId gracefully', () => {
      assert.doesNotThrow(() => {
        wsManager.activatePendingSubscriptions('req-does-not-exist', 'some-session');
      });
    });
  });

  describe('Redis-enabled Mode', () => {
    it('should initialize with Redis config without throwing', async () => {
      const redisServer = createServer();
      await new Promise<void>((resolve) => {
        redisServer.listen(0, () => resolve());
      });

      let redisManager: WebSocketManager | undefined;

      assert.doesNotThrow(() => {
        redisManager = new WebSocketManager(redisServer, {
          path: '/ws-redis',
          allowedOrigins: ['*'],
          redisUrl: 'redis://localhost:6379' // Will connect to local redis if available
        });

        // Verify services are still initialized
        const manager = redisManager as any;
        assert.ok(manager.publisher, 'publisher should be initialized with Redis');
        assert.ok(manager.subscriptionActivator, 'subscriptionActivator should be initialized with Redis');
        assert.ok(manager.backlogDrainer, 'backlogDrainer should be initialized with Redis');
      });

      await new Promise<void>((resolve) => {
        redisServer.close(() => resolve());
      });
    });
  });
});
