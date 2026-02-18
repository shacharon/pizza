/**
 * Auth Verifier Tests
 * 
 * Verifies ticket authentication, origin validation,
 * HTTPS enforcement, and one-time ticket consumption
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { IncomingMessage } from 'http';
import type Redis from 'ioredis';
import { verifyClient, verifyTicket } from '../auth-verifier.js';

describe('Auth Verifier', () => {
  describe('verifyClient - Origin Validation', () => {
    it('should accept origin in allowed list', async () => {
      const req = {
        headers: { origin: 'https://app.example.com' }
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'https://app.example.com' },
        req,
        {
          allowedOrigins: ['https://app.example.com'],
          requireAuth: false,
          redisClient: null,
          isProduction: false
        }
      );

      assert.strictEqual(result.ok, true);
    });

    it('should reject origin not in allowed list', async () => {
      const req = {
        headers: { origin: 'https://evil.example.com' }
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'https://evil.example.com' },
        req,
        {
          allowedOrigins: ['https://app.example.com'],
          requireAuth: false,
          redisClient: null,
          isProduction: true
        }
      );

      assert.strictEqual(result.ok, false);
      assert.match(result.message!, /origin.*not allowed/i);
    });

    it('should use fallback origin when origin header missing', async () => {
      const req = {
        headers: {}
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: undefined },
        req,
        {
          allowedOrigins: ['https://fallback.example.com'],
          requireAuth: false,
          redisClient: null,
          isProduction: false,
          fallbackOrigin: 'https://fallback.example.com'
        }
      );

      assert.strictEqual(result.ok, true);
    });

    it('should enforce HTTPS in production via x-forwarded-proto', async () => {
      const req = {
        headers: {
          origin: 'https://app.example.com',
          'x-forwarded-proto': 'http'
        }
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'https://app.example.com' },
        req,
        {
          allowedOrigins: ['https://app.example.com'],
          requireAuth: false,
          redisClient: null,
          isProduction: true
        }
      );

      assert.strictEqual(result.ok, false);
      assert.match(result.message!, /https.*required/i);
    });

    it('should allow HTTP in development', async () => {
      const req = {
        headers: { origin: 'http://localhost:4200' }
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'http://localhost:4200' },
        req,
        {
          allowedOrigins: ['http://localhost:4200'],
          requireAuth: false,
          redisClient: null,
          isProduction: false
        }
      );

      assert.strictEqual(result.ok, true);
    });
  });

  describe('verifyTicket - Ticket Validation', () => {
    let mockRedis: Partial<Redis>;

    beforeEach(() => {
      mockRedis = {
        get: mock.fn(async () => null),
        del: mock.fn(async () => 1)
      };
    });

    it('should accept valid ticket with correct structure', async () => {
      const ticketData = JSON.stringify({
        userId: 'user-123',
        sessionId: 'session-456',
        exp: Date.now() + 60000
      });

      mockRedis.get = mock.fn(async () => ticketData);

      const result = await verifyTicket(
        'ticket-valid',
        mockRedis as Redis
      );

      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.userId, 'user-123');
      assert.strictEqual(result.sessionId, 'session-456');
    });

    it('should reject missing ticket', async () => {
      mockRedis.get = mock.fn(async () => null);

      const result = await verifyTicket(
        'ticket-missing',
        mockRedis as Redis
      );

      assert.strictEqual(result.valid, false);
      assert.match(result.reason!, /not found/i);
    });

    it('should reject expired ticket', async () => {
      const ticketData = JSON.stringify({
        userId: 'user-123',
        sessionId: 'session-456',
        exp: Date.now() - 1000 // Expired 1 second ago
      });

      mockRedis.get = mock.fn(async () => ticketData);

      const result = await verifyTicket(
        'ticket-expired',
        mockRedis as Redis
      );

      assert.strictEqual(result.valid, false);
      assert.match(result.reason!, /expired/i);
    });

    it('should enforce one-time consumption by deleting ticket', async () => {
      const ticketData = JSON.stringify({
        userId: 'user-123',
        sessionId: 'session-456',
        exp: Date.now() + 60000
      });

      mockRedis.get = mock.fn(async () => ticketData);
      const delMock = mock.fn(async () => 1);
      mockRedis.del = delMock;

      await verifyTicket('ticket-onetime', mockRedis as Redis);

      assert.strictEqual((delMock as any).mock.calls.length, 1);
      assert.strictEqual((delMock as any).mock.calls[0].arguments[0], 'ws:ticket:ticket-onetime');
    });

    it('should reject malformed ticket JSON', async () => {
      mockRedis.get = mock.fn(async () => 'invalid-json{');

      const result = await verifyTicket(
        'ticket-malformed',
        mockRedis as Redis
      );

      assert.strictEqual(result.valid, false);
      assert.match(result.reason!, /malformed/i);
    });

    it('should reject ticket with missing userId', async () => {
      const ticketData = JSON.stringify({
        sessionId: 'session-456',
        exp: Date.now() + 60000
      });

      mockRedis.get = mock.fn(async () => ticketData);

      const result = await verifyTicket(
        'ticket-no-user',
        mockRedis as Redis
      );

      assert.strictEqual(result.valid, false);
      assert.match(result.reason!, /missing.*userId/i);
    });

    it('should reject ticket with missing sessionId', async () => {
      const ticketData = JSON.stringify({
        userId: 'user-123',
        exp: Date.now() + 60000
      });

      mockRedis.get = mock.fn(async () => ticketData);

      const result = await verifyTicket(
        'ticket-no-session',
        mockRedis as Redis
      );

      assert.strictEqual(result.valid, false);
      assert.match(result.reason!, /missing.*sessionId/i);
    });
  });

  describe('verifyClient - Auth Integration', () => {
    let mockRedis: Partial<Redis>;

    beforeEach(() => {
      mockRedis = {
        get: mock.fn(async () => null),
        del: mock.fn(async () => 1)
      };
    });

    it('should accept valid ticket in query params', async () => {
      const ticketData = JSON.stringify({
        userId: 'user-123',
        sessionId: 'session-456',
        exp: Date.now() + 60000
      });

      mockRedis.get = mock.fn(async () => ticketData);

      const req = {
        headers: { origin: 'https://app.example.com' },
        url: '/?ticket=valid-ticket-123'
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'https://app.example.com' },
        req,
        {
          allowedOrigins: ['https://app.example.com'],
          requireAuth: true,
          redisClient: mockRedis as Redis,
          isProduction: false
        }
      );

      assert.strictEqual(result.ok, true);
      assert.strictEqual(result.userId, 'user-123');
      assert.strictEqual(result.sessionId, 'session-456');
    });

    it('should reject connection when auth required but no ticket', async () => {
      const req = {
        headers: { origin: 'https://app.example.com' },
        url: '/'
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'https://app.example.com' },
        req,
        {
          allowedOrigins: ['https://app.example.com'],
          requireAuth: true,
          redisClient: mockRedis as Redis,
          isProduction: false
        }
      );

      assert.strictEqual(result.ok, false);
      assert.match(result.message!, /authentication.*required/i);
    });

    it('should allow connection when auth not required and no ticket', async () => {
      const req = {
        headers: { origin: 'https://app.example.com' },
        url: '/'
      } as IncomingMessage;

      const result = await verifyClient(
        { origin: 'https://app.example.com' },
        req,
        {
          allowedOrigins: ['https://app.example.com'],
          requireAuth: false,
          redisClient: null,
          isProduction: false
        }
      );

      assert.strictEqual(result.ok, true);
    });
  });
});
