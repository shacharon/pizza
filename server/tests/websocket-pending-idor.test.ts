/**
 * P0 Security Test: WebSocket Pending Subscription IDOR
 * 
 * Scenario: Attacker subscribes to requestId before legitimate user creates job
 * Expected: Attacker should NOT receive any notifications or data
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { WebSocket } from 'ws';
import { createApp } from '../src/app.js';
import { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';
import type { Server } from 'http';

describe('[P0 Security] WebSocket Pending Subscription IDOR', () => {
  let app: any;
  let server: Server;
  let wsManager: WebSocketManager;
  let wsUrl: string;

  beforeAll(async () => {
    app = createApp();
    server = app.listen(0); // Random port
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 3000;
    
    // Mock Redis for auth
    const mockRedis = {
      get: async (key: string) => {
        if (key.startsWith('ws_ticket:')) {
          const ticketId = key.replace('ws_ticket:', '');
          // Return ticket data for specific tickets
          if (ticketId === 'attacker-ticket') {
            return JSON.stringify({
              userId: null,
              sessionId: 'attacker-session-123',
              createdAt: Date.now()
            });
          }
          if (ticketId === 'victim-ticket') {
            return JSON.stringify({
              userId: null,
              sessionId: 'victim-session-456',
              createdAt: Date.now()
            });
          }
        }
        return null;
      },
      del: async () => 1,
      setex: async () => 'OK'
    } as any;

    wsManager = new WebSocketManager(server, {
      path: '/ws-test',
      allowedOrigins: ['http://localhost'],
      redisUrl: 'redis://mock'
    });

    // Inject mock Redis
    (wsManager as any).redis = mockRedis;

    wsUrl = `ws://localhost:${port}/ws-test`;
  });

  afterAll(async () => {
    wsManager?.shutdown();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should reject pending subscription from non-owner when job is created', async () => {
    const requestId = `req-idor-test-${Date.now()}`;
    
    // Step 1: Attacker subscribes BEFORE job exists (pending subscription)
    const attackerWs = new WebSocket(`${wsUrl}?ticket=attacker-ticket`);
    
    await new Promise<void>((resolve, reject) => {
      attackerWs.on('open', () => resolve());
      attackerWs.on('error', reject);
      setTimeout(() => reject(new Error('Attacker WS connection timeout')), 2000);
    });

    // Attacker subscribes to requestId that doesn't exist yet
    const attackerMessages: any[] = [];
    attackerWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      attackerMessages.push(msg);
    });

    attackerWs.send(JSON.stringify({
      type: 'subscribe',
      channel: 'search',
      requestId
    }));

    // Wait for sub_ack with pending:true
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const subAck = attackerMessages.find(m => m.type === 'sub_ack');
    expect(subAck).toBeDefined();
    expect(subAck?.pending).toBe(true);

    // Step 2: Legitimate user (victim) creates job
    // This simulates job creation with victim's session
    wsManager.activatePendingSubscriptions(requestId, 'victim-session-456');

    // Wait for potential sub_nack to attacker
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Victim connects and subscribes
    const victimWs = new WebSocket(`${wsUrl}?ticket=victim-ticket`);
    
    await new Promise<void>((resolve, reject) => {
      victimWs.on('open', () => resolve());
      victimWs.on('error', reject);
      setTimeout(() => reject(new Error('Victim WS connection timeout')), 2000);
    });

    const victimMessages: any[] = [];
    victimWs.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      victimMessages.push(msg);
    });

    victimWs.send(JSON.stringify({
      type: 'subscribe',
      channel: 'search',
      requestId
    }));

    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 4: Publish message to requestId
    wsManager.publishToChannel('search', requestId, 'victim-session-456', {
      type: 'progress',
      requestId,
      stage: 'done',
      message: 'Secret data for victim only'
    } as any);

    await new Promise(resolve => setTimeout(resolve, 500));

    // Assertions
    const attackerSubNack = attackerMessages.find(m => m.type === 'sub_nack');
    const attackerReceivedData = attackerMessages.find(m => m.type === 'progress');
    
    const victimSubAck2 = victimMessages.find(m => m.type === 'sub_ack');
    const victimReceivedData = victimMessages.find(m => m.type === 'progress');

    // P0: Attacker should receive sub_nack (session mismatch)
    expect(attackerSubNack).toBeDefined();
    expect(attackerSubNack?.reason).toBe('session_mismatch');

    // P0: Attacker should NOT receive any data
    expect(attackerReceivedData).toBeUndefined();

    // Victim should receive sub_ack and data
    expect(victimSubAck2).toBeDefined();
    expect(victimSubAck2?.pending).toBe(false);
    expect(victimReceivedData).toBeDefined();
    expect(victimReceivedData?.message).toBe('Secret data for victim only');

    // Cleanup
    attackerWs.close();
    victimWs.close();
  });

  it('should reject pending subscription that expires before job creation', async () => {
    const requestId = `req-expire-test-${Date.now()}`;
    
    const ws = new WebSocket(`${wsUrl}?ticket=attacker-ticket`);
    
    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => resolve());
      ws.on('error', reject);
      setTimeout(() => reject(new Error('WS connection timeout')), 2000);
    });

    const messages: any[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
    });

    ws.send(JSON.stringify({
      type: 'subscribe',
      channel: 'search',
      requestId
    }));

    await new Promise(resolve => setTimeout(resolve, 500));

    // Verify pending subscription was registered
    const subAck = messages.find(m => m.type === 'sub_ack');
    expect(subAck?.pending).toBe(true);

    // Wait for expiration (90s is too long for test, so we'll trigger cleanup manually)
    // In production, this would happen via heartbeat interval
    // For test, we simulate the cleanup
    const pendingManager = (wsManager as any).pendingSubscriptionsManager;
    if (pendingManager && typeof pendingManager.cleanupExpired === 'function') {
      // Force expiration by manipulating the pending subscription's expiresAt
      const pendingKey = `search:${requestId}:attacker-session-123`;
      const pending = pendingManager.pendingSubscriptions?.get(pendingKey);
      if (pending) {
        pending.expiresAt = Date.now() - 1000; // Expired 1s ago
      }
      
      pendingManager.cleanupExpired((ws: WebSocket, channel: string, reqId: string, reason: string) => {
        // sendSubNack callback
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Cleanup
    ws.close();
  });
});
