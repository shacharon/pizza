/**
 * P0 Security Test: Search Result IDOR via Session Mismatch
 * 
 * Scenario: User A creates job, User B (different session) tries to access result
 * Expected: User B should get 404 (not 403) to avoid requestId disclosure
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { searchJobStore } from '../src/services/search/job-store/index.js';

describe('[P0 Security] Search IDOR - Session Mismatch', () => {
  let app: any;
  let jwtSecret: string;

  beforeAll(() => {
    // Set JWT_SECRET for test
    jwtSecret = process.env.JWT_SECRET || 'test-secret-key-minimum-32-characters-long';
    process.env.JWT_SECRET = jwtSecret;
    
    app = createApp();
  });

  afterAll(async () => {
    // Cleanup
  });

  it('should return 404 (not 403) when accessing job created by different session', async () => {
    // Step 1: User A creates JWT token and job
    const userASessionId = 'session-user-a-123';
    const userAToken = jwt.sign(
      { sessionId: userASessionId, iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    // Create job for User A
    const requestId = `req-idor-test-${Date.now()}`;
    await searchJobStore.createJob(requestId, {
      sessionId: userASessionId,
      query: 'test query',
      ownerUserId: null,
      ownerSessionId: userASessionId
    });

    // Set job result
    await searchJobStore.setResult(requestId, {
      requestId,
      sessionId: userASessionId,
      query: { original: 'test', parsed: null as any, language: 'en' },
      results: [{ id: 'secret-result', name: 'Secret Restaurant' } as any],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch' as any,
        appliedFilters: [],
        source: 'test' as any,
        confidence: 0.9
      }
    } as any);

    await searchJobStore.setStatus(requestId, 'DONE_SUCCESS', 100);

    // Step 2: User B tries to access with different session
    const userBSessionId = 'session-user-b-456';
    const userBToken = jwt.sign(
      { sessionId: userBSessionId, iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const response = await request(app)
      .get(`/api/v1/search/${requestId}/result`)
      .set('Authorization', `Bearer ${userBToken}`)
      .expect(404); // P0: Must return 404, not 403

    expect(response.body.code).toBe('NOT_FOUND');
    
    // P0: Response should NOT reveal that requestId exists
    // Should look identical to a truly non-existent requestId
    expect(response.body.message).toBeUndefined();
    expect(response.body.results).toBeUndefined();
  });

  it('should return 401 when accessing job without authentication', async () => {
    const requestId = `req-unauth-test-${Date.now()}`;
    
    // Create job
    await searchJobStore.createJob(requestId, {
      sessionId: 'some-session',
      query: 'test',
      ownerUserId: null,
      ownerSessionId: 'some-session'
    });

    const response = await request(app)
      .get(`/api/v1/search/${requestId}/result`)
      // No Authorization header
      .expect(401);

    expect(response.body.code).toBe('MISSING_AUTH');
  });

  it('should return 200 when owner accesses their own job', async () => {
    const ownerSessionId = 'session-owner-789';
    const ownerToken = jwt.sign(
      { sessionId: ownerSessionId, iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const requestId = `req-owner-test-${Date.now()}`;
    
    await searchJobStore.createJob(requestId, {
      sessionId: ownerSessionId,
      query: 'test query',
      ownerUserId: null,
      ownerSessionId: ownerSessionId
    });

    await searchJobStore.setResult(requestId, {
      requestId,
      sessionId: ownerSessionId,
      query: { original: 'test', parsed: null as any, language: 'en' },
      results: [],
      chips: [],
      meta: {
        tookMs: 100,
        mode: 'textsearch' as any,
        appliedFilters: [],
        source: 'test' as any,
        confidence: 0.9
      }
    } as any);

    await searchJobStore.setStatus(requestId, 'DONE_SUCCESS', 100);

    const response = await request(app)
      .get(`/api/v1/search/${requestId}/result`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    expect(response.body.results).toBeDefined();
    expect(Array.isArray(response.body.results)).toBe(true);
  });

  it('should return 404 for legacy job without owner (secure default)', async () => {
    const sessionId = 'session-current-user';
    const token = jwt.sign(
      { sessionId, iat: Math.floor(Date.now() / 1000) },
      jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const requestId = `req-legacy-test-${Date.now()}`;
    
    // Create legacy job without owner
    await searchJobStore.createJob(requestId, {
      sessionId: 'old-session',
      query: 'test',
      ownerUserId: null,
      ownerSessionId: null // Legacy: no owner
    });

    const response = await request(app)
      .get(`/api/v1/search/${requestId}/result`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404); // P0: Secure default - deny access to legacy jobs

    expect(response.body.code).toBe('NOT_FOUND');
  });
});
