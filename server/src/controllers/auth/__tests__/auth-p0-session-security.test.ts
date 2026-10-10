/**
 * Regression tests for P0 auth findings A1, A2, and A3.
 * Forged, expired, and tampered credentials must not grant access or job ownership.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Express, Request, Response } from 'express';
import type { Logger } from 'pino';
import type { AuthenticatedRequest } from '../../../middleware/auth-session-or-jwt.middleware.js';
import type { ISearchJobStore } from '../../../services/search/job-store/job-store.interface.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-0123456789abcdef';
process.env.SESSION_COOKIE_SECRET = 'test-cookie-secret-0123456789abcd';
process.env.ENABLE_REDIS_JOBSTORE = 'false';
process.env.ENABLE_REDIS_CACHE = 'false';
process.env.ENABLE_AI_FEATURES = 'false';
process.env.ENABLE_GOOGLE_SEARCH = 'false';
process.env.LOG_LEVEL = 'silent';

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_COOKIE_SECRET = process.env.SESSION_COOKIE_SECRET;
const VICTIM_SESSION = 'sess_victim-owned-0001';
const OTHER_SESSION = 'sess_other-proven-0002';
const OWNER_USER = 'user_owner';
const ATTACKER_USER = 'user_attacker';
const OWNED_REQUEST = 'req-p0-owned-1';

const jwt = (await import('jsonwebtoken')).default;
const express = (await import('express')).default;
const { default: tokenRouter } = await import('../token.controller.js');
const { authSessionOrJwt } = await import(
  '../../../middleware/auth-session-or-jwt.middleware.js'
);
const { autoRefreshExpiredCookie } = await import(
  '../../../middleware/auto-refresh-expired-cookie.middleware.js'
);
const { signSessionCookie } = await import('../../../lib/session-cookie/session-cookie.service.js');
const { logger } = await import('../../../lib/logger/structured-logger.js');
const { validateJobOwnership } = await import('../../search/search.security.js');
const { searchJobStore } = await import('../../../services/search/job-store/index.js');
const { OwnershipValidator } = await import('../../stream/assistant-sse/ownership-validator.js');

const app: Express = express();
app.use(express.json());
app.use('/api/v1/auth', tokenRouter);
app.get('/api/v1/protected', authSessionOrJwt, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.status(200).json({
    sessionId: authReq.sessionId ?? null,
    userId: authReq.userId ?? null,
  });
});
app.get('/api/v1/stream/assistant/:requestId', authSessionOrJwt, (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.status(200).json({
    sessionId: authReq.sessionId ?? null,
    userId: authReq.userId ?? null,
  });
});

await searchJobStore.createJob(OWNED_REQUEST, {
  sessionId: VICTIM_SESSION,
  query: 'synthetic-query',
  ownerSessionId: VICTIM_SESSION,
  ownerUserId: OWNER_USER,
});

const ownershipValidator = new OwnershipValidator(
  {
    async getJob(requestId: string) {
      return {
        requestId,
        sessionId: VICTIM_SESSION,
        query: 'synthetic-query',
        status: 'DONE_SUCCESS',
        createdAt: 1,
        updatedAt: 1,
        ownerSessionId: VICTIM_SESSION,
        ownerUserId: OWNER_USER,
      };
    },
  } as unknown as ISearchJobStore,
  { warn() {}, debug() {} } as unknown as Logger
);

type JsonBody = Record<string, unknown>;

class FakeSessionStore {
  readonly sessions = new Map<string, { sessionId: string; userId?: string }>();
  readonly lookedUp: string[] = [];
  readonly touched: string[] = [];
  readonly createdUserIds: Array<string | undefined> = [];
  failCreate = false;

  async getSession(sessionId: string) {
    this.lookedUp.push(sessionId);
    return this.sessions.get(sessionId) ?? null;
  }

  async touchSession(sessionId: string) {
    this.touched.push(sessionId);
  }

  async createSession(userId?: string) {
    this.createdUserIds.push(userId);
    if (this.failCreate) {
      throw new Error('store down');
    }
    const sessionId = `sess_new_${this.createdUserIds.length}`;
    this.sessions.set(sessionId, userId ? { sessionId, userId } : { sessionId });
    return sessionId;
  }
}

function remember(store: FakeSessionStore, sessionId: string, userId?: string): void {
  store.sessions.set(sessionId, userId ? { sessionId, userId } : { sessionId });
}

function accessToken(sessionId: string, expiresInSeconds = 3600): string {
  return jwt.sign(
    { sessionId, iat: Math.floor(Date.now() / 1000) },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: expiresInSeconds }
  );
}

function expiredAccessToken(sessionId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sessionId, iat: now - 7200, exp: now - 120 },
    JWT_SECRET,
    { algorithm: 'HS256' }
  );
}

function staleAccessToken(sessionId: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { sessionId, iat: now - 31 * 24 * 60 * 60, exp: now + 3600 },
    JWT_SECRET,
    { algorithm: 'HS256' }
  );
}

function freshCookie(sessionId: string, userId?: string): string {
  return signSessionCookie(sessionId, userId, {
    secret: SESSION_COOKIE_SECRET,
    ttlSeconds: 3600,
  });
}

function expiredCookie(sessionId: string, userId?: string): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sessionId,
      ...(userId ? { userId } : {}),
      typ: 'session_cookie',
      iat: now - 7200,
      exp: now - 120,
    },
    SESSION_COOKIE_SECRET,
    { algorithm: 'HS256' }
  );
}

function forgedCookie(sessionId: string, userId: string): string {
  return jwt.sign(
    { sessionId, userId, typ: 'session_cookie' },
    'attacker-secret-0123456789abcdef',
    { algorithm: 'HS256', expiresIn: 3600 }
  );
}

function unsignedToken(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.`;
}

function tamperPayload(token: string, sessionId: string, userId: string): string {
  const parts = token.split('.');
  const header = parts[0];
  const signature = parts[2];
  if (!header || signature === undefined) {
    throw new Error('token is missing parts');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sessionId,
    userId,
    typ: 'session_cookie',
    iat: now - 7200,
    exp: now - 120,
  })).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function captureLogs() {
  const entries: unknown[][] = [];
  const target = logger as unknown as Record<string, (...args: unknown[]) => void>;
  const levels = ['info', 'warn', 'debug', 'error'] as const;
  const originals: Record<(typeof levels)[number], (...args: unknown[]) => void> = {
    info: target.info,
    warn: target.warn,
    debug: target.debug,
    error: target.error,
  };
  for (const level of levels) {
    Object.defineProperty(target, level, {
      configurable: true,
      writable: true,
      value: (...args: unknown[]) => {
        entries.push([level, ...args]);
      },
    });
  }
  return {
    entries,
    restore() {
      for (const level of levels) {
        Object.defineProperty(target, level, {
          configurable: true,
          writable: true,
          value: originals[level],
        });
      }
    },
  };
}

function logsContain(entries: unknown[][], secret: string): boolean {
  return JSON.stringify(entries).includes(secret);
}

async function send(
  method: string,
  path: string,
  options: { json?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; body: JsonBody }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const address = server.address() as AddressInfo;
    const payload = options.json === undefined ? undefined : JSON.stringify(options.json);
    const response = await new Promise<{ status: number; raw: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: address.port,
          path,
          method,
          headers: {
            ...(payload !== undefined
              ? {
                  'content-type': 'application/json',
                  'content-length': Buffer.byteLength(payload),
                }
              : {}),
            ...options.headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            resolve({
              status: res.statusCode ?? 0,
              raw: Buffer.concat(chunks).toString('utf8'),
            });
          });
        }
      );
      req.on('error', reject);
      if (payload !== undefined) {
        req.write(payload);
      }
      req.end();
    });
    const body = response.raw ? JSON.parse(response.raw) as JsonBody : {};
    return { status: response.status, body };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

async function refreshCookie(cookieValue: string, store: FakeSessionStore) {
  const req = {
    headers: { cookie: `theme=light; session=${cookieValue}` },
    path: '/api/v1/search',
    traceId: 'trace-refresh',
  } as unknown as Request;
  const cookies: Array<{ value: string; options: Record<string, unknown> }> = [];
  const res = {
    cookie(name: string, value: string, options: Record<string, unknown>) {
      assert.equal(name, 'session');
      cookies.push({ value, options });
    },
  } as unknown as Response;
  let continued = 0;
  await autoRefreshExpiredCookie(req, res, () => {
    continued += 1;
  }, store);
  return { req, cookies, continued };
}

function verifiedCookie(token: string): { sessionId: string; userId?: string; typ?: string } {
  return jwt.verify(token, SESSION_COOKIE_SECRET, {
    algorithms: ['HS256'],
  }) as { sessionId: string; userId?: string; typ?: string };
}

async function assertOwnership(sessionId: string, allowed: boolean): Promise<void> {
  const httpResult = await validateJobOwnership(OWNED_REQUEST, {
    sessionId,
    traceId: 'trace-owner',
  } as unknown as Request);
  assert.equal(httpResult.valid, allowed);
  if (!allowed) {
    assert.equal(httpResult.errorResponse?.status, 404);
  }

  const sseResult = await ownershipValidator.validate(
    OWNED_REQUEST,
    { sessionId } as AuthenticatedRequest
  );
  assert.equal(sseResult.valid, allowed);
  if (!allowed) {
    assert.equal(sseResult.reason, 'session_mismatch');
  }
}

describe('P0 auth session security', { concurrency: false }, () => {
  it('mints a new session when /auth/token is called with no credentials', async () => {
    const response = await send('POST', '/api/v1/auth/token', { json: {} });
    assert.equal(response.status, 200);
    const sessionId = String(response.body.sessionId);
    const token = String(response.body.token);
    assert.match(sessionId, /^sess_[0-9a-f-]{36}$/i);
    const verified = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { sessionId: string };
    assert.equal(verified.sessionId, sessionId);
    const decoded = jwt.decode(token, { complete: true });
    assert.ok(decoded && typeof decoded !== 'string');
    assert.equal(decoded.header.alg, 'HS256');
  });

  it('does not sign a client-supplied session id', async () => {
    const logs = captureLogs();
    try {
      const response = await send('POST', '/api/v1/auth/token', {
        json: { sessionId: VICTIM_SESSION },
      });
      assert.equal(response.status, 200);
      assert.notEqual(response.body.sessionId, VICTIM_SESSION);
      const token = String(response.body.token);
      const verified = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as { sessionId: string };
      assert.equal(verified.sessionId, response.body.sessionId);
      assert.equal(logsContain(logs.entries, VICTIM_SESSION), false);
      assert.equal(logsContain(logs.entries, token), false);
      assert.equal(logsContain(logs.entries, JWT_SECRET), false);
      const protectedResponse = await send('GET', '/api/v1/protected', {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(protectedResponse.status, 200);
      assert.equal(protectedResponse.body.sessionId, response.body.sessionId);
      await assertOwnership(String(protectedResponse.body.sessionId), false);
    } finally {
      logs.restore();
    }
  });

  it('reissues the session proved by a valid bearer token', async () => {
    const proof = accessToken(VICTIM_SESSION);
    const response = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: OTHER_SESSION },
      headers: { authorization: `Bearer ${proof}` },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.sessionId, VICTIM_SESSION);
    const protectedResponse = await send('GET', '/api/v1/protected', {
      headers: { authorization: `Bearer ${String(response.body.token)}` },
    });
    assert.equal(protectedResponse.status, 200);
    assert.equal(protectedResponse.body.sessionId, VICTIM_SESSION);
    await assertOwnership(VICTIM_SESSION, true);
  });

  it('reissues the session proved by a valid cookie and prefers it over a bearer token', async () => {
    const cookie = freshCookie(VICTIM_SESSION, OWNER_USER);
    const other = accessToken(OTHER_SESSION);
    const response = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: OTHER_SESSION },
      headers: {
        cookie: `session=${cookie}`,
        authorization: `Bearer ${other}`,
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.sessionId, VICTIM_SESSION);
  });

  it('falls through an invalid cookie to a valid bearer token', async () => {
    const response = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: VICTIM_SESSION },
      headers: {
        cookie: `session=${forgedCookie(VICTIM_SESSION, ATTACKER_USER)}`,
        authorization: `Bearer ${accessToken(OTHER_SESSION)}`,
      },
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.sessionId, OTHER_SESSION);
  });

  it('ignores an expired bearer token and does not keep that session', async () => {
    const response = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: VICTIM_SESSION },
      headers: { authorization: `Bearer ${expiredAccessToken(VICTIM_SESSION)}` },
    });
    assert.equal(response.status, 200);
    assert.notEqual(response.body.sessionId, VICTIM_SESSION);
    await assertOwnership(String(response.body.sessionId), false);
  });

  it('ignores a tampered bearer token', async () => {
    const tampered = tamperPayload(accessToken(OTHER_SESSION), VICTIM_SESSION, ATTACKER_USER);
    const response = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: VICTIM_SESSION },
      headers: { authorization: `Bearer ${tampered}` },
    });
    assert.equal(response.status, 200);
    assert.notEqual(response.body.sessionId, VICTIM_SESSION);
  });

  it('ignores an unsigned bearer token and a token older than 30 days', async () => {
    const now = Math.floor(Date.now() / 1000);
    const unsigned = unsignedToken({ sessionId: VICTIM_SESSION, iat: now, exp: now + 3600 });
    const unsignedResponse = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: VICTIM_SESSION },
      headers: { authorization: `Bearer ${unsigned}` },
    });
    assert.notEqual(unsignedResponse.body.sessionId, VICTIM_SESSION);

    const staleResponse = await send('POST', '/api/v1/auth/token', {
      json: { sessionId: VICTIM_SESSION },
      headers: { authorization: `Bearer ${staleAccessToken(VICTIM_SESSION)}` },
    });
    assert.notEqual(staleResponse.body.sessionId, VICTIM_SESSION);
  });

  it('rejects a non-string session id without logging the payload', async () => {
    const planted = 'PLANTED_TOKEN_VALUE_SHOULD_NOT_BE_LOGGED';
    const logs = captureLogs();
    try {
      const response = await send('POST', '/api/v1/auth/token', {
        json: { sessionId: { leaked: planted } },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.code, 'VALIDATION_ERROR');
      assert.equal(logsContain(logs.entries, planted), false);
      assert.equal(logsContain(logs.entries, JWT_SECRET), false);
    } finally {
      logs.restore();
    }
  });

  it('authenticates a valid cookie or bearer token and rejects expired, tampered, and unsigned tokens', async () => {
    const cookie = freshCookie(VICTIM_SESSION, OWNER_USER);
    const cookieResponse = await send('GET', '/api/v1/protected', {
      headers: { cookie: `session=${cookie}` },
    });
    assert.equal(cookieResponse.status, 200);
    assert.equal(cookieResponse.body.sessionId, VICTIM_SESSION);
    assert.equal(cookieResponse.body.userId, OWNER_USER);

    const bearer = accessToken(OTHER_SESSION);
    const bearerResponse = await send('GET', '/api/v1/protected', {
      headers: { authorization: `Bearer ${bearer}` },
    });
    assert.equal(bearerResponse.status, 200);
    assert.equal(bearerResponse.body.sessionId, OTHER_SESSION);

    const fallback = await send('GET', '/api/v1/protected', {
      headers: {
        cookie: `session=${forgedCookie(VICTIM_SESSION, ATTACKER_USER)}`,
        authorization: `Bearer ${bearer}`,
      },
    });
    assert.equal(fallback.status, 200);
    assert.equal(fallback.body.sessionId, OTHER_SESSION);

    for (const token of [
      expiredAccessToken(VICTIM_SESSION),
      tamperPayload(accessToken(OTHER_SESSION), VICTIM_SESSION, ATTACKER_USER),
      unsignedToken({
        sessionId: VICTIM_SESSION,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ]) {
      const denied = await send('GET', '/api/v1/protected', {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(denied.status, 401);
      assert.equal(denied.body.code, 'INVALID_TOKEN');
      assert.equal(denied.body.sessionId, undefined);
    }
  });

  it('keeps a valid unexpired cookie unchanged', async () => {
    const store = new FakeSessionStore();
    remember(store, VICTIM_SESSION, OWNER_USER);
    const cookie = freshCookie(VICTIM_SESSION, OWNER_USER);
    const result = await refreshCookie(cookie, store);
    assert.equal(result.continued, 1);
    assert.equal(result.cookies.length, 0);
    assert.equal(result.req.headers.cookie, `theme=light; session=${cookie}`);
    assert.deepEqual(store.lookedUp, []);
    assert.deepEqual(store.createdUserIds, []);
  });

  it('renews an expired signed cookie for the same session and user', async () => {
    const store = new FakeSessionStore();
    remember(store, VICTIM_SESSION, OWNER_USER);
    const cookie = expiredCookie(VICTIM_SESSION, OWNER_USER);
    const logs = captureLogs();
    try {
      const result = await refreshCookie(cookie, store);
      assert.equal(result.continued, 1);
      assert.equal(result.cookies.length, 1);
      assert.equal(result.cookies[0]?.options.httpOnly, true);
      const issued = verifiedCookie(result.cookies[0]!.value);
      assert.equal(issued.sessionId, VICTIM_SESSION);
      assert.equal(issued.userId, OWNER_USER);
      assert.equal(issued.typ, 'session_cookie');
      assert.equal(String(result.req.headers.cookie).includes(cookie), false);
      assert.deepEqual(store.lookedUp, [VICTIM_SESSION]);
      assert.deepEqual(store.touched, [VICTIM_SESSION]);
      assert.deepEqual(store.createdUserIds, []);
      assert.equal(logsContain(logs.entries, cookie), false);
      assert.equal(logsContain(logs.entries, result.cookies[0]!.value), false);
      assert.equal(logsContain(logs.entries, SESSION_COOKIE_SECRET), false);

      const protectedResponse = await send('GET', '/api/v1/protected', {
        headers: { cookie: `session=${result.cookies[0]!.value}` },
      });
      assert.equal(protectedResponse.status, 200);
      assert.equal(protectedResponse.body.sessionId, VICTIM_SESSION);
      assert.equal(protectedResponse.body.userId, OWNER_USER);
      await assertOwnership(VICTIM_SESSION, true);
    } finally {
      logs.restore();
    }
  });

  it('starts a new session when an expired signed cookie is not in the store', async () => {
    const store = new FakeSessionStore();
    const result = await refreshCookie(expiredCookie(VICTIM_SESSION, OWNER_USER), store);
    const issued = verifiedCookie(result.cookies[0]!.value);
    assert.notEqual(issued.sessionId, VICTIM_SESSION);
    assert.equal(issued.userId, OWNER_USER);
    assert.deepEqual(store.createdUserIds, [OWNER_USER]);
    await assertOwnership(issued.sessionId, false);
  });

  it('does not adopt a forged cookie even when that session exists', async () => {
    const store = new FakeSessionStore();
    remember(store, VICTIM_SESSION, OWNER_USER);
    const forged = forgedCookie(VICTIM_SESSION, ATTACKER_USER);
    const logs = captureLogs();
    try {
      const result = await refreshCookie(forged, store);
      assert.equal(result.continued, 1);
      const issued = verifiedCookie(result.cookies[0]!.value);
      assert.notEqual(issued.sessionId, VICTIM_SESSION);
      assert.equal(issued.userId, undefined);
      assert.deepEqual(store.lookedUp, []);
      assert.deepEqual(store.createdUserIds, [undefined]);
      assert.equal(logsContain(logs.entries, forged), false);
      assert.equal(logsContain(logs.entries, VICTIM_SESSION), false);
      assert.equal(logsContain(logs.entries, ATTACKER_USER), false);
      assert.equal(logsContain(logs.entries, result.cookies[0]!.value), false);

      const protectedResponse = await send('GET', '/api/v1/protected', {
        headers: { cookie: `session=${result.cookies[0]!.value}` },
      });
      assert.equal(protectedResponse.status, 200);
      assert.notEqual(protectedResponse.body.sessionId, VICTIM_SESSION);
      assert.equal(protectedResponse.body.userId, null);
      await assertOwnership(String(protectedResponse.body.sessionId), false);
    } finally {
      logs.restore();
    }
  });

  it('does not adopt a tampered, unsigned, cross-signed, or wrong-algorithm cookie', async () => {
    const cases = [
      tamperPayload(expiredCookie(OTHER_SESSION, OWNER_USER), VICTIM_SESSION, ATTACKER_USER),
      unsignedToken({
        sessionId: VICTIM_SESSION,
        userId: ATTACKER_USER,
        typ: 'session_cookie',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
      jwt.sign(
        { sessionId: VICTIM_SESSION, userId: ATTACKER_USER, typ: 'session_cookie' },
        JWT_SECRET,
        { algorithm: 'HS256', expiresIn: 3600 }
      ),
      jwt.sign(
        { sessionId: VICTIM_SESSION, userId: ATTACKER_USER, typ: 'session_cookie' },
        SESSION_COOKIE_SECRET,
        { algorithm: 'HS384', expiresIn: 3600 }
      ),
    ];

    for (const cookie of cases) {
      const store = new FakeSessionStore();
      remember(store, VICTIM_SESSION, OWNER_USER);
      const result = await refreshCookie(cookie, store);
      const issued = verifiedCookie(result.cookies[0]!.value);
      assert.notEqual(issued.sessionId, VICTIM_SESSION);
      assert.equal(issued.userId, undefined);
      assert.deepEqual(store.lookedUp, []);
      await assertOwnership(issued.sessionId, false);
    }
  });

  it('repairs a signed cookie with the wrong typ without changing its session', async () => {
    const store = new FakeSessionStore();
    remember(store, VICTIM_SESSION, OWNER_USER);
    const cookie = jwt.sign(
      { sessionId: VICTIM_SESSION, userId: OWNER_USER, typ: 'access' },
      SESSION_COOKIE_SECRET,
      { algorithm: 'HS256', expiresIn: 3600 }
    );
    const result = await refreshCookie(cookie, store);
    const issued = verifiedCookie(result.cookies[0]!.value);
    assert.equal(issued.sessionId, VICTIM_SESSION);
    assert.equal(issued.userId, OWNER_USER);
    assert.equal(issued.typ, 'session_cookie');
  });

  it('does not issue a cookie when session creation fails, and does not log the presented cookie', async () => {
    const store = new FakeSessionStore();
    store.failCreate = true;
    remember(store, VICTIM_SESSION, OWNER_USER);
    const forged = forgedCookie(VICTIM_SESSION, ATTACKER_USER);
    const logs = captureLogs();
    try {
      const result = await refreshCookie(forged, store);
      assert.equal(result.continued, 1);
      assert.equal(result.cookies.length, 0);
      assert.equal(String(result.req.headers.cookie).includes(forged), true);
      assert.equal(logsContain(logs.entries, forged), false);
      assert.equal(logsContain(logs.entries, VICTIM_SESSION), false);
      assert.equal(logsContain(logs.entries, SESSION_COOKIE_SECRET), false);
      assert.equal(logsContain(logs.entries, 'store down'), false);
    } finally {
      logs.restore();
    }
  });

  it('does not log session cookies or bearer tokens on the SSE auth path', async () => {
    const cookie = freshCookie(VICTIM_SESSION, OWNER_USER);
    const marker = 'ZZZCOOKIEMARKERZZZ';
    const logs = captureLogs();
    try {
      const ok = await send('GET', '/api/v1/stream/assistant/req-p0-owned-1', {
        headers: { cookie: `session=${cookie}; extra=${marker}` },
      });
      assert.equal(ok.status, 200);
      assert.equal(ok.body.sessionId, VICTIM_SESSION);
      assert.equal(logsContain(logs.entries, cookie), false);
      assert.equal(logsContain(logs.entries, marker), false);
      assert.equal(logsContain(logs.entries, SESSION_COOKIE_SECRET), false);

      const forged = forgedCookie(VICTIM_SESSION, ATTACKER_USER);
      const bearer = unsignedToken({
        sessionId: VICTIM_SESSION,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      const denied = await send('GET', '/api/v1/stream/assistant/req-p0-owned-1', {
        headers: {
          cookie: `session=${forged}`,
          authorization: `Bearer ${bearer}`,
        },
      });
      assert.equal(denied.status, 401);
      assert.equal(logsContain(logs.entries, forged), false);
      assert.equal(logsContain(logs.entries, bearer), false);
      assert.equal(logsContain(logs.entries, JWT_SECRET), false);
    } finally {
      logs.restore();
    }
  });
});
