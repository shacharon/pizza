/**
 * P0 Security Test: WebSocket Expired Ticket Rejection
 * 
 * Scenario: User tries to connect with expired or invalid ticket
 * Expected: Connection should be rejected
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';
import { verifyClient } from '../src/infra/websocket/auth-verifier.js';
import type { Server } from 'http';
import type Redis from 'ioredis';

describe('[P0 Security] WebSocket Expired Ticket', () => {
  let mockRedis: Partial<Redis.Redis>;

  beforeAll(() => {
    mockRedis = {
      get: async (key: string) => {
        // Simulate expired ticket (not found in Redis)
        if (key === 'ws_ticket:expired-ticket-123') {
          return null; // Expired/deleted
        }
        
        // Valid ticket
        if (key === 'ws_ticket:valid-ticket-456') {
          return JSON.stringify({
            userId: null,
            sessionId: 'test-session-789',
            createdAt: Date.now() - 30000 // 30s ago
          });
        }
        
        return null;
      },
      del: async () => 1
    } as Partial<Redis.Redis>;
  });

  it('should reject connection with expired ticket', async () => {
    const mockReq = {
      url: '/ws?ticket=expired-ticket-123',
      headers: {
        origin: 'http://localhost:4200',
        'x-forwarded-for': '127.0.0.1'
      },
      socket: {
        remoteAddress: '127.0.0.1'
      }
    };

    const mockInfo = {
      origin: 'http://localhost:4200',
      req: mockReq,
      secure: false
    };

    const allowedOrigins = ['http://localhost:4200'];
    
    const result = await verifyClient(mockInfo, allowedOrigins, mockRedis as Redis.Redis);

    expect(result).toBe(false);
    expect((mockReq as any).wsRejectReason).toBeDefined();
  });

  it('should reject connection with no ticket', async () => {
    const mockReq = {
      url: '/ws', // No ticket query param
      headers: {
        origin: 'http://localhost:4200',
        'x-forwarded-for': '127.0.0.1'
      },
      socket: {
        remoteAddress: '127.0.0.1'
      }
    };

    const mockInfo = {
      origin: 'http://localhost:4200',
      req: mockReq,
      secure: false
    };

    const allowedOrigins = ['http://localhost:4200'];
    
    const result = await verifyClient(mockInfo, allowedOrigins, mockRedis as Redis.Redis);

    expect(result).toBe(false);
  });

  it('should accept connection with valid ticket', async () => {
    const mockReq = {
      url: '/ws?ticket=valid-ticket-456',
      headers: {
        origin: 'http://localhost:4200',
        'x-forwarded-for': '127.0.0.1'
      },
      socket: {
        remoteAddress: '127.0.0.1'
      }
    };

    const mockInfo = {
      origin: 'http://localhost:4200',
      req: mockReq,
      secure: false
    };

    const allowedOrigins = ['http://localhost:4200'];
    
    const result = await verifyClient(mockInfo, allowedOrigins, mockRedis as Redis.Redis);

    expect(result).toBe(true);
    expect((mockReq as any).userId).toBeUndefined(); // null in ticket
    expect((mockReq as any).sessionId).toBe('test-session-789');
  });

  it('should reject connection with malformed ticket', async () => {
    // Override mock to return invalid JSON
    const localMockRedis = {
      get: async (key: string) => {
        if (key === 'ws_ticket:malformed-ticket') {
          return 'invalid-json{{{'; // Malformed JSON
        }
        return null;
      },
      del: async () => 1
    } as Partial<Redis.Redis>;

    const mockReq = {
      url: '/ws?ticket=malformed-ticket',
      headers: {
        origin: 'http://localhost:4200',
        'x-forwarded-for': '127.0.0.1'
      },
      socket: {
        remoteAddress: '127.0.0.1'
      }
    };

    const mockInfo = {
      origin: 'http://localhost:4200',
      req: mockReq,
      secure: false
    };

    const allowedOrigins = ['http://localhost:4200'];
    
    const result = await verifyClient(mockInfo, allowedOrigins, localMockRedis as Redis.Redis);

    expect(result).toBe(false);
  });
});
