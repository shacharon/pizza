/**
 * Auto-Refresh Expired Cookie Middleware
 *
 * Transparently refreshes expired/stale session cookies without 401 errors.
 * Critical for mobile users (Android/iOS) who can't clear cookies.
 *
 * Detection uses jwt.decode (no signature check) so old cookies still refresh
 * even if secret/format changed. Issuing a new anonymous session is equivalent
 * to calling public POST /auth/bootstrap.
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

/**
 * Cookie needs refresh when:
 * - JWT exp is in the past, OR
 * - Signature/typ verification fails (stale/legacy cookie)
 */
function cookieNeedsRefresh(
  token: string,
  secret: string
): { needsRefresh: boolean; decoded?: { sessionId?: string; userId?: string } } {
  const decoded = jwt.decode(token) as {
    sessionId?: string;
    userId?: string;
    exp?: number;
    typ?: string;
  } | null;

  if (!decoded || typeof decoded !== 'object') {
    // Malformed — still refresh (same as bootstrap)
    return { needsRefresh: true };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof decoded.exp === 'number' && decoded.exp < now - 5) {
    return { needsRefresh: true, decoded };
  }

  // Not expired by clock — verify signature/typ
  try {
    jwt.verify(token, secret, {
      algorithms: ['HS256'],
      clockTolerance: 5
    });
    if (decoded.typ && decoded.typ !== 'session_cookie') {
      return { needsRefresh: true, decoded };
    }
    return { needsRefresh: false, decoded };
  } catch {
    // Invalid signature / legacy cookie → refresh
    return { needsRefresh: true, decoded };
  }
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
  next: NextFunction
): Promise<void> {
  try {
    const traceId = (req as any).traceId || 'unknown';
    const config = getConfig();
    const cookieHeader = req.headers.cookie;
    const sessionCookie = extractSessionCookie(cookieHeader);

    if (!sessionCookie) {
      next();
      return;
    }

    const { needsRefresh, decoded } = cookieNeedsRefresh(
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
        oldSessionId: decoded?.sessionId
          ? decoded.sessionId.substring(0, 12) + '...'
          : 'unknown'
      },
      '[AutoRefresh] Stale/expired cookie - issuing new session cookie'
    );

    const sessionStore = getSessionStore();
    let sessionId = decoded?.sessionId;
    const userId = decoded?.userId;

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
        traceId: (req as any).traceId || 'unknown',
        error: error instanceof Error ? error.message : 'unknown'
      },
      '[AutoRefresh] Failed - falling through to auth'
    );
    next();
  }
}
