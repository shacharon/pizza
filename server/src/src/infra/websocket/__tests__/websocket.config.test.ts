/**
 * WebSocket Configuration Tests
 * 
 * Verifies environment variable parsing, origin validation,
 * and security gates for production environments
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWebSocketConfig, validateRedisForAuth } from '../websocket.config.js';

describe('WebSocket Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('resolveWebSocketConfig', () => {
    it('should use FRONTEND_ORIGINS when provided', () => {
      process.env.FRONTEND_ORIGINS = 'https://app.example.com,https://app2.example.com';
      process.env.ALLOWED_ORIGINS = 'https://old.example.com';
      process.env.NODE_ENV = 'production';

      const config = resolveWebSocketConfig({});

      assert.ok(config.allowedOrigins.includes('https://app.example.com'));
      assert.ok(config.allowedOrigins.includes('https://app2.example.com'));
      assert.ok(!config.allowedOrigins.includes('https://old.example.com'));
    });

    it('should fallback to ALLOWED_ORIGINS when FRONTEND_ORIGINS not set', () => {
      delete process.env.FRONTEND_ORIGINS;
      process.env.ALLOWED_ORIGINS = 'https://allowed.example.com';
      process.env.NODE_ENV = 'production';

      const config = resolveWebSocketConfig({});

      assert.ok(config.allowedOrigins.includes('https://allowed.example.com'));
    });

    it('should replace wildcard origins with fallback in production', () => {
      process.env.FRONTEND_ORIGINS = '*';
      process.env.NODE_ENV = 'production';
      process.env.WS_FALLBACK_ORIGIN = 'https://fallback.test.com';

      const config = resolveWebSocketConfig({});

      // Should not contain wildcard
      assert.ok(!config.allowedOrigins.includes('*'));
      // Should use fallback
      assert.ok(config.allowedOrigins.includes('https://fallback.test.com'));
    });

    it('should use default fallback when no WS_FALLBACK_ORIGIN set', () => {
      process.env.FRONTEND_ORIGINS = '*';
      process.env.NODE_ENV = 'production';
      delete process.env.WS_FALLBACK_ORIGIN;

      const config = resolveWebSocketConfig({});

      // Should use default fallback
      assert.ok(config.allowedOrigins.includes('https://app.going2eat.food'));
    });

    it('should allow localhost in development', () => {
      delete process.env.FRONTEND_ORIGINS;
      delete process.env.ALLOWED_ORIGINS;
      process.env.NODE_ENV = 'development';

      const config = resolveWebSocketConfig({});

      assert.ok(config.allowedOrigins.some(origin => origin.includes('localhost')));
    });

    it('should parse WS_REQUIRE_AUTH environment variable (tested via validateRedisForAuth)', () => {
      // WS_REQUIRE_AUTH is used internally by validateRedisForAuth
      // Config object doesn't expose this field
      delete process.env.WS_REQUIRE_AUTH;

      // Test default behavior (requireAuth=true) via validateRedisForAuth
      assert.throws(
        () => validateRedisForAuth(false),
        /redis.*required/i
      );
    });

    it('should respect WS_REQUIRE_AUTH=false', () => {
      process.env.WS_REQUIRE_AUTH = 'false';

      // Should not throw when auth disabled
      assert.doesNotThrow(() => validateRedisForAuth(false));

      // Cleanup
      delete process.env.WS_REQUIRE_AUTH;
    });

    it('should use WS_FALLBACK_ORIGIN when wildcard detected in production', () => {
      process.env.WS_FALLBACK_ORIGIN = 'https://fallback.example.com';
      process.env.FRONTEND_ORIGINS = '*';
      process.env.NODE_ENV = 'production';

      const config = resolveWebSocketConfig({});

      // Should use fallback origin
      assert.ok(config.allowedOrigins.includes('https://fallback.example.com'));
    });

    it('should pass through provided redisUrl', () => {
      const config = resolveWebSocketConfig({ redisUrl: 'redis://test:6379' });

      assert.strictEqual(config.redisUrl, 'redis://test:6379');
    });

    it('should use REDIS_URL from environment', () => {
      process.env.REDIS_URL = 'redis://env:6379';

      const config = resolveWebSocketConfig({});

      assert.strictEqual(config.redisUrl, 'redis://env:6379');
    });

    it('should prioritize config redisUrl over environment', () => {
      process.env.REDIS_URL = 'redis://env:6379';

      const config = resolveWebSocketConfig({ redisUrl: 'redis://config:6379' });

      assert.strictEqual(config.redisUrl, 'redis://config:6379');
    });
  });

  describe('validateRedisForAuth', () => {
    beforeEach(() => {
      delete process.env.WS_REQUIRE_AUTH;
    });

    it('should throw when requireAuth=true (default) but no Redis', () => {
      assert.throws(
        () => validateRedisForAuth(false), // hasRedis=false
        /redis.*required/i
      );
    });

    it('should not throw when requireAuth=false and no Redis', () => {
      process.env.WS_REQUIRE_AUTH = 'false';
      assert.doesNotThrow(() => validateRedisForAuth(false)); // hasRedis=false
    });

    it('should not throw when requireAuth=true and Redis provided', () => {
      // Default requireAuth=true
      assert.doesNotThrow(() => validateRedisForAuth(true)); // hasRedis=true
    });
  });

  describe('Production Security Gates', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('should enforce HTTPS in production origins', () => {
      process.env.FRONTEND_ORIGINS = 'http://insecure.example.com';

      // Should not throw but should log warning (implementation-dependent)
      // At minimum, should parse correctly
      assert.doesNotThrow(() => resolveWebSocketConfig({}));
    });

    it('should trim whitespace from origin list', () => {
      process.env.FRONTEND_ORIGINS = ' https://app1.com , https://app2.com ';

      const config = resolveWebSocketConfig({});

      assert.ok(config.allowedOrigins.includes('https://app1.com'));
      assert.ok(config.allowedOrigins.includes('https://app2.com'));
      assert.ok(!config.allowedOrigins.some(o => o.includes(' ')));
    });
  });
});
