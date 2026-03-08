/**
 * Location resolution for Route2
 * Computes ctx.userLocation per request with priority:
 * 1. Client payload (lat, lng)
 * 2. Session store (lastKnownLocation)
 * 3. IP-based geo (fallback)
 * Does NOT reuse cached coordinates blindly; resolves fresh each request.
 */

import type { Request } from 'express';
import { logger } from '../../../../lib/logger/structured-logger.js';

export type LocationSource = 'client_payload' | 'session_store' | 'ip_geo' | 'none';

export interface ResolvedLocation {
  userLocation: { lat: number; lng: number } | null;
  source: LocationSource;
  /** Session's lastKnownLocation before this request (for debug: search_started) */
  sessionLocation?: { lat: number; lng: number } | null;
  /** True when session had a previous location and new location was >5km away (session overwritten) */
  invalidated?: boolean;
  /** True when caller should persist userLocation to session once (client_payload or ip_geo). Persist AFTER resolution, only once per request, guarded by AbortSignal. */
  shouldPersistSession?: boolean;
}

/** Distance beyond which session location is invalidated and overwritten (km) */
const INVALIDATION_THRESHOLD_KM = 5;

/**
 * Haversine distance between two points in km.
 */
export function distanceKm(
  prev: { lat: number; lng: number },
  next: { lat: number; lng: number }
): number {
  const R_KM = 6371;
  const dLat = ((next.lat - prev.lat) * Math.PI) / 180;
  const dLon = ((next.lng - prev.lng) * Math.PI) / 180;
  const lat1 = (prev.lat * Math.PI) / 180;
  const lat2 = (next.lat * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R_KM * c;
}

/** Session store interface for location resolution (avoids direct Redis dependency in route2) */
export interface SessionStoreForLocation {
  getSession(sessionId: string): Promise<{ lastKnownLocation?: { lat: number; lng: number } } | null>;
  updateLocation(sessionId: string, location: { lat: number; lng: number }): Promise<void>;
}

/** IP geo provider: returns coords for IP or null if unknown/unavailable */
export type GetLocationFromIp = (ip: string) => Promise<{ lat: number; lng: number } | null>;

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded && typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0 && forwarded[0]) {
    const first = (forwarded[0] as string).split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

function isValidCoord(lat: number, lng: number): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !Number.isNaN(lat) &&
    !Number.isNaN(lng)
  );
}

/**
 * Resolve user location for this request using priority: client payload → session store → IP geo.
 * Logs location_resolved { requestId, source, lat, lng } when a location is set.
 */
export async function resolveUserLocation(params: {
  requestId: string;
  clientPayload: { lat: number; lng: number } | null | undefined;
  sessionId?: string | null;
  sessionStore?: SessionStoreForLocation | null;
  req?: Request | null;
  getLocationFromIp?: GetLocationFromIp | null;
}): Promise<ResolvedLocation> {
  const { requestId, clientPayload, sessionId, sessionStore, req, getLocationFromIp } = params;

  // 1. Client payload (no session write here; caller persists once after resolution)
  if (clientPayload && isValidCoord(clientPayload.lat, clientPayload.lng)) {
    const next = { lat: clientPayload.lat, lng: clientPayload.lng };
    let invalidated = false;
    let sessionLocation: { lat: number; lng: number } | null = null;
    if (sessionId && sessionStore) {
      try {
        const session = await sessionStore.getSession(sessionId);
        const prev = session?.lastKnownLocation;
        if (prev && isValidCoord(prev.lat, prev.lng)) {
          sessionLocation = prev;
          const km = distanceKm(prev, next);
          if (km > INVALIDATION_THRESHOLD_KM) {
            invalidated = true;
            logger.info(
              {
                event: 'location_invalidated',
                requestId,
                prev: { lat: prev.lat, lng: prev.lng },
                next: { lat: next.lat, lng: next.lng },
                distanceKm: Math.round(km * 100) / 100,
              },
              '[Route2] Session location invalidated (distance > 5km), overwritten with new location'
            );
            logger.info(
              {
                event: 'city_switched_mid_session',
                requestId,
                prev: { lat: prev.lat, lng: prev.lng },
                next: { lat: next.lat, lng: next.lng },
                distanceKm: Math.round(km * 100) / 100,
              },
              '[Route2] City switched mid-session (distance > 5km)'
            );
          }
        }
      } catch {
        // Non-fatal: continue with resolution
      }
    }
    logger.info(
      { event: 'location_resolved', requestId, source: 'client_payload', lat: next.lat, lng: next.lng },
      '[Route2] Location resolved from client payload'
    );
    return {
      userLocation: next,
      source: 'client_payload',
      sessionLocation: sessionLocation ?? undefined,
      invalidated: invalidated || undefined,
      shouldPersistSession: true,
    };
  }

  // 2. Session store
  if (sessionId && sessionStore) {
    try {
      const session = await sessionStore.getSession(sessionId);
      const loc = session?.lastKnownLocation;
      if (loc && isValidCoord(loc.lat, loc.lng)) {
        logger.info(
          { event: 'location_resolved', requestId, source: 'session_store', lat: loc.lat, lng: loc.lng },
          '[Route2] Location resolved from session store'
        );
        return {
          userLocation: { lat: loc.lat, lng: loc.lng },
          source: 'session_store',
          sessionLocation: { lat: loc.lat, lng: loc.lng },
        };
      }
    } catch (err) {
      logger.warn(
        { requestId, sessionId, error: err instanceof Error ? err.message : 'unknown' },
        '[Route2] Session store read failed for location fallback'
      );
    }
  }

  // 3. IP-based geo
  if (req && getLocationFromIp) {
    const ip = getClientIp(req);
    try {
      const coords = await getLocationFromIp(ip);
      if (coords && isValidCoord(coords.lat, coords.lng)) {
        const next = coords;
        let invalidated = false;
        let sessionLocation: { lat: number; lng: number } | null = null;
        if (sessionId && sessionStore) {
          try {
            const session = await sessionStore.getSession(sessionId);
            const prev = session?.lastKnownLocation;
            if (prev && isValidCoord(prev.lat, prev.lng)) {
              sessionLocation = prev;
              const km = distanceKm(prev, next);
              if (km > INVALIDATION_THRESHOLD_KM) {
                invalidated = true;
                logger.info(
                  {
                    event: 'location_invalidated',
                    requestId,
                    prev: { lat: prev.lat, lng: prev.lng },
                    next: { lat: next.lat, lng: next.lng },
                    distanceKm: Math.round(km * 100) / 100,
                  },
                  '[Route2] Session location invalidated (distance > 5km), overwritten with new location'
                );
                logger.info(
                  {
                    event: 'city_switched_mid_session',
                    requestId,
                    prev: { lat: prev.lat, lng: prev.lng },
                    next: { lat: next.lat, lng: next.lng },
                    distanceKm: Math.round(km * 100) / 100,
                  },
                  '[Route2] City switched mid-session (distance > 5km)'
                );
              }
            }
          } catch {
            // Non-fatal: continue with resolution
          }
        }
        logger.info(
          { event: 'location_resolved', requestId, source: 'ip_geo', lat: next.lat, lng: next.lng },
          '[Route2] Location resolved from IP geo'
        );
        return {
          userLocation: next,
          source: 'ip_geo',
          sessionLocation: sessionLocation ?? undefined,
          invalidated: invalidated || undefined,
          shouldPersistSession: true,
        };
      }
    } catch (err) {
      logger.warn(
        { requestId, error: err instanceof Error ? err.message : 'unknown' },
        '[Route2] IP geo failed for location fallback'
      );
    }
  }

  logger.info(
    { event: 'location_resolved', requestId, source: 'none' },
    '[Route2] No location resolved (client/session/IP geo)'
  );
  return { userLocation: null, source: 'none' };
}

/**
 * Persist resolved location to session store once per request, AFTER resolution.
 * Guard: if abortSignal.aborted → skip session write (no race with parallel stages / request close).
 */
export async function persistSessionLocationIfNeeded(
  resolved: ResolvedLocation,
  sessionStore: SessionStoreForLocation,
  sessionId: string,
  abortSignal?: AbortSignal | null
): Promise<void> {
  if (!resolved.shouldPersistSession || !resolved.userLocation) return;
  if (abortSignal?.aborted) return;
  try {
    await sessionStore.updateLocation(sessionId, resolved.userLocation);
  } catch {
    // Non-fatal: session write best-effort
  }
}

/**
 * Stub IP geo provider: returns null (no implementation).
 * Replace with a real provider (e.g. MaxMind, ip-api) when available.
 */
export async function getLocationFromIpStub(_ip: string): Promise<{ lat: number; lng: number } | null> {
  return null;
}
