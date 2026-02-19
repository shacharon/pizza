/**
 * Subscription Manager Dev Mode Tests
 * Tests WS_REQUIRE_AUTH=false behavior for session mismatch bypass
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { SubscriptionManager } from '../subscription-manager.js';
import type { ISearchJobStore } from '../../../services/search/job-store/job-store.interface.js';
import type { IRequestStateStore } from '../../state/request-state.store.js';

// Mock WebSocket
class MockWebSocket {
  ctx: any;
  sessionId: string;
  clientId: string;
  
  constructor(sessionId: string, clientId: string = 'test-client') {
    this.sessionId = sessionId;
    this.clientId = clientId;
    this.ctx = { sessionId, clientId, connectedAt: Date.now() };
  }
}

// Mock JobStore
class MockJobStore implements Partial<ISearchJobStore> {
  private jobs = new Map<string, any>();

  async getJob(requestId: string) {
    return this.jobs.get(requestId) || null;
  }

  setJob(requestId: string, job: any) {
    this.jobs.set(requestId, job);
  }

  clear() {
    this.jobs.clear();
  }
}

describe('SubscriptionManager - Dev Mode (WS_REQUIRE_AUTH=false)', () => {
  let subscriptionManager: SubscriptionManager;
  let mockJobStore: MockJobStore;
  const originalEnv = process.env.WS_REQUIRE_AUTH;

  beforeEach(() => {
    mockJobStore = new MockJobStore();
    subscriptionManager = new SubscriptionManager(
      undefined as any, // requestStateStore not used in these tests
      mockJobStore as any
    );
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.WS_REQUIRE_AUTH;
    } else {
      process.env.WS_REQUIRE_AUTH = originalEnv;
    }
    mockJobStore.clear();
  });

  it('should BYPASS session_mismatch when WS_REQUIRE_AUTH=false and connection is anonymous', async () => {
    // Setup: Dev mode with auth disabled
    process.env.WS_REQUIRE_AUTH = 'false';

    // Job was created with JWT session
    const requestId = 'req-test-123';
    const jwtSessionId = 'sess_abc123';
    mockJobStore.setJob(requestId, {
      requestId,
      ownerSessionId: jwtSessionId,
      ownerUserId: undefined
    });

    // WS connection is anonymous (no ticket auth)
    const ws = new MockWebSocket('anonymous', 'ws-client-1') as any;
    const isProduction = false;
    const requireAuth = false; // WS_REQUIRE_AUTH=false

    // Attempt subscribe
    const result = await subscriptionManager.handleSubscribeRequest(
      ws,
      {
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId
      } as any,
      ws.clientId,
      requireAuth,
      isProduction
    );

    // Assert: Should SUCCEED (bypass session check in dev mode)
    assert.strictEqual(result.success, true, 'Subscribe should succeed in dev mode with anonymous connection');
    assert.strictEqual(result.pending, false, 'Should not be pending');
    assert.strictEqual(result.channel, 'search');
    assert.strictEqual(result.requestId, requestId);
  });

  it('should ENFORCE session_mismatch when WS_REQUIRE_AUTH=true (prod mode)', async () => {
    // Setup: Prod mode with auth enabled
    process.env.WS_REQUIRE_AUTH = 'true';

    // Job was created with JWT session
    const requestId = 'req-test-456';
    const jwtSessionId = 'sess_xyz789';
    mockJobStore.setJob(requestId, {
      requestId,
      ownerSessionId: jwtSessionId,
      ownerUserId: undefined
    });

    // WS connection is anonymous (auth failed or missing)
    const ws = new MockWebSocket('anonymous', 'ws-client-2') as any;
    const isProduction = true;
    const requireAuth = true; // WS_REQUIRE_AUTH=true

    // Attempt subscribe
    const result = await subscriptionManager.handleSubscribeRequest(
      ws,
      {
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId
      } as any,
      ws.clientId,
      requireAuth,
      isProduction
    );

    // Assert: Should FAIL (enforce session check in prod mode)
    assert.strictEqual(result.success, false, 'Subscribe should be rejected - not authenticated');
  });

  it('should ALLOW matching sessions in dev mode (normal authenticated case)', async () => {
    // Setup: Dev mode with auth disabled (but client still sends valid ticket)
    process.env.WS_REQUIRE_AUTH = 'false';

    // Job was created with JWT session
    const requestId = 'req-test-789';
    const jwtSessionId = 'sess_match123';
    mockJobStore.setJob(requestId, {
      requestId,
      ownerSessionId: jwtSessionId,
      ownerUserId: undefined
    });

    // WS connection has matching session (ticket was used)
    const ws = new MockWebSocket(jwtSessionId, 'ws-client-3') as any;
    const isProduction = false;
    const requireAuth = false;

    // Attempt subscribe
    const result = await subscriptionManager.handleSubscribeRequest(
      ws,
      {
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId
      } as any,
      ws.clientId,
      requireAuth,
      isProduction
    );

    // Assert: Should SUCCEED (normal case)
    assert.strictEqual(result.success, true, 'Subscribe should succeed with matching session');
    assert.strictEqual(result.pending, false);
  });

  it('should REJECT non-anonymous session_mismatch even in dev mode', async () => {
    // Setup: Dev mode with auth disabled
    process.env.WS_REQUIRE_AUTH = 'false';

    // Job was created with JWT session A
    const requestId = 'req-test-999';
    const jwtSessionIdA = 'sess_userA';
    mockJobStore.setJob(requestId, {
      requestId,
      ownerSessionId: jwtSessionIdA,
      ownerUserId: undefined
    });

    // WS connection has different non-anonymous session B (different user's ticket)
    const jwtSessionIdB = 'sess_userB';
    const ws = new MockWebSocket(jwtSessionIdB, 'ws-client-4') as any;
    const isProduction = false;
    const requireAuth = false;

    // Attempt subscribe
    const result = await subscriptionManager.handleSubscribeRequest(
      ws,
      {
        v: 1,
        type: 'subscribe',
        channel: 'search',
        requestId
      } as any,
      ws.clientId,
      requireAuth,
      isProduction
    );

    // Assert: Should FAIL (different users, still enforce security)
    assert.strictEqual(result.success, false, 'Subscribe should be rejected - session mismatch between different users');
  });
});
