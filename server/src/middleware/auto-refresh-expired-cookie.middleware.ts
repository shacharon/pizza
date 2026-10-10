/**
 * Auto-Refresh Expired Cookie Middleware
 *
 * Transparently refreshes expired/stale session cookies without 401 errors.
 * Critical for mobile users (Android/iOS) who can't clear cookies.
 *
 * A cookie is refreshed in place only when its HS256 signature verifies.
 * Expiry and a wrong typ can be renewed from those verified claims.
 * A bad signature, tampered payload, or malformed cookie discards every claim
 * and starts a new anonymous session (same outcome as POST /auth/bootstrap).
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../lib/logger/structured-logger.js';
import { getSessionStore } from '../lib/session/redis-session.store.js';
import { signSessionCookie } from '../lib/session-cookie/session-cookie.service.js';
import { getConfig } from '../config/env.js';

function extractSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    const eq = cookie.indexOf('=');
    if (eq === -1) continue;
    const name = cookie.slice(0, eq).trim();
    const value = cookie.slice(eq + 1).trim();
    if (name === 'session' && value) {
      return value;
    }
  }

  return null;
}

type VerifiedSessionClaims = {
  sessionId: string;
  userId?: string;
};

/**
 * Store used to keep a verified session alive.
 * Production passes the Redis session store. Tests pass a fake.
 */
interface SessionRefreshStore {
  getSession(sessionId: string): Promise<{ sessionId: string; userId?: string } | null>;
  touchSession(sessionId: string): Promise<void>;
  createSession(userId?: string): Promise<string>;
}

/**
 * Cookie needs a new signature when it is expired or has the wrong typ.
 * Claims are returned only after jwt.verify succeeds (signature required).
 * ignoreExpiration allows an expired-but-signed cookie to keep its session.
 */
function cookieNeedsRefresh(
  token: string,
  secret: string
): { needsRefresh: boolean; claims?: VerifiedSessionClaims } {
  let sessionId: string;
  let userId: string | undefined;
  let exp: number | undefined;
  let typ: unknown;
  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      ignoreExpiration: true,
      clockTolerance: 5,
    });
    if (!decoded || typeof decoded === 'string') {
      return { needsRefresh: true };
    }
    if (typeof decoded.sessionId !== 'string' || decoded.sessionId.length === 0) {
      return { needsRefresh: true };
    }
    sessionId = decoded.sessionId;
    userId = typeof decoded.userId === 'string' && decoded.userId.length > 0
      ? decoded.userId
      : undefined;
    exp = typeof decoded.exp === 'number' ? decoded.exp : undefined;
    typ = decoded.typ;
  } catch {
    return { needsRefresh: true };
  }

  const now = Math.floor(Date.now() / 1000);
  const expired = typeof exp === 'number' && exp < now - 5;
  const wrongTyp = typ != null && typ !== 'session_cookie';
  if (!expired && !wrongTyp) {
    return { needsRefresh: false };
  }

  return {
    needsRefresh: true,
    claims: userId ? { sessionId, userId } : { sessionId },
  };
}

function setSessionCookieOnResponse(
  res: Response,
  cookieValue: string,
  ttlSeconds: number,
  cookieDomain: string | undefined,
  cookieSameSite: 'Strict' | 'Lax' | 'None'
): void {
  const sameSiteMap = {
    Strict: 'strict',
    Lax: 'lax',
    None: 'none'
  } as const;

  const cookieOpts: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    maxAge: number;
    domain?: string;
  } = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: sameSiteMap[cookieSameSite],
    maxAge: ttlSeconds * 1000
  };
  if (cookieDomain) {
    cookieOpts.domain = cookieDomain;
  }
  res.cookie('session', cookieValue, cookieOpts);
}

export async function autoRefreshExpiredCookie(
  req: Request,
  res: Response,
  next: NextFunction,
  sessionStore: SessionRefreshStore = getSessionStore()
): Promise<void> {
  try {
    const traceId = req.traceId || 'unknown';
    const config = getConfig();
    const cookieHeader = req.headers.cookie;
    const sessionCookie = extractSessionCookie(cookieHeader);

    if (!sessionCookie) {
      next();
      return;
    }

    const { needsRefresh, claims } = cookieNeedsRefresh(
      sessionCookie,
      config.sessionCookieSecret
    );

    if (!needsRefresh) {
      next();
      return;
    }

    logger.info(
      {
        event: 'auto_refresh_expired_cookie',
        traceId,
        path: req.path,
        oldSessionId: claims?.sessionId
          ? claims.sessionId.substring(0, 12) + '...'
          : 'unverified'
      },
      '[AutoRefresh] Stale/expired cookie - issuing new session cookie'
    );

    let sessionId = claims?.sessionId;
    const userId = claims?.userId;

    if (sessionId) {
      try {
        const existing = await sessionStore.getSession(sessionId);
        if (existing) {
          await sessionStore.touchSession(sessionId);
        } else {
          sessionId = undefined;
        }
      } catch {
        sessionId = undefined;
      }
    }

    if (!sessionId) {
      sessionId = await sessionStore.createSession(userId);
    }

    const newCookie = signSessionCookie(sessionId, userId, {
      secret: config.sessionCookieSecret,
      ttlSeconds: config.sessionCookieTtlSeconds
    });

    setSessionCookieOnResponse(
      res,
      newCookie,
      config.sessionCookieTtlSeconds,
      config.cookieDomain,
      config.cookieSameSite
    );

    const escaped = sessionCookie.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const newCookieHeader = cookieHeader
      ? cookieHeader.replace(new RegExp(`session=${escaped}`), `session=${newCookie}`)
      : `session=${newCookie}`;
    req.headers.cookie = newCookieHeader;

    logger.info(
      {
        event: 'auto_refresh_complete',
        traceId,
        sessionId: sessionId.substring(0, 12) + '...',
        ttlSeconds: config.sessionCookieTtlSeconds
      },
      '[AutoRefresh] New session cookie issued - request continues'
    );

    next();
  } catch (error) {
    logger.error(
      {
        event: 'auto_refresh_failed',
        traceId: req.traceId || 'unknown',
        error: error instanceof Error ? error.name : 'unknown'
      },
      '[AutoRefresh] Failed - falling through to auth'
    );
    next();
  }
}
