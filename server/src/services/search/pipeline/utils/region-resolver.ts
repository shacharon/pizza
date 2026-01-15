/**
 * Region Resolver Utility
 * 
 * Resolves region code with proper priority order:
 * 1. Device coordinates (if available)
 * 2. Session cache (if available)
 * 3. DEFAULT_REGION_CODE from config
 * 
 * CRITICAL: Do NOT derive region from language or city names
 */

import { PlacesConfig } from '../../../places/config/places.config.js';
import type { Coordinates } from '../../types/search-request.dto.js';
import type { ISessionService } from '../../types/search.types.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Derive region code from device coordinates
 * Uses simple lat/lng-based heuristics for known regions
 * 
 * @param coords User's device coordinates
 * @returns ISO-2 region code or null if can't determine
 */
function deriveRegionFromCoords(coords: Coordinates): string | null {
  // Israel bounds: ~29-33.5°N, 34-36°E
  if (coords.lat >= 29 && coords.lat <= 33.5 &&
    coords.lng >= 34 && coords.lng <= 36) {
    return 'IL';
  }

  // France bounds: ~41-51°N, -5-10°E
  if (coords.lat >= 41 && coords.lat <= 51 &&
    coords.lng >= -5 && coords.lng <= 10) {
    return 'FR';
  }

  // United States (continental): ~24-49°N, -125 to -66°W
  if (coords.lat >= 24 && coords.lat <= 49 &&
    coords.lng >= -125 && coords.lng <= -66) {
    return 'US';
  }

  // Add more regions as needed
  // For now, return null if can't determine
  return null;
}

/**
 * Resolve region code with priority order:
 * 1. Device coordinates (if available)
 * 2. Session cache (if available)
 * 3. DEFAULT_REGION_CODE from config
 * 
 * @param userLocation User's device coordinates (optional)
 * @param sessionId Current session ID
 * @param sessionService Session service for caching (optional)
 * @returns Region code and source
 */
export async function resolveRegionCode(
  userLocation: Coordinates | undefined,
  sessionId: string,
  sessionService: ISessionService | undefined
): Promise<{
  regionCode: string;
  source: 'device_coords' | 'session_cache' | 'default_config';
}> {

  // Priority 1: Device coordinates
  if (userLocation) {
    const derived = deriveRegionFromCoords(userLocation);
    if (derived) {
      logger.debug({
        sessionId,
        regionCode: derived,
        source: 'device_coords',
        coords: userLocation
      }, '[RegionResolver] Derived region from device coordinates');

      // Cache in session for future requests
      if (sessionService) {
        try {
          const session = await sessionService.get(sessionId);
          if (session) {
            await sessionService.update(sessionId, {
              context: { ...session.context, regionCode: derived }
            });
            logger.debug({
              sessionId,
              regionCode: derived
            }, '[RegionResolver] Cached region in session');
          }
        } catch (error) {
          logger.warn({
            sessionId,
            error: error instanceof Error ? error.message : 'unknown'
          }, '[RegionResolver] Failed to cache region in session');
        }
      }

      return { regionCode: derived, source: 'device_coords' };
    }
  }

  // Priority 2: Session cache
  if (sessionService) {
    try {
      const session = await sessionService.get(sessionId);
      if (session?.context.regionCode) {
        logger.debug({
          sessionId,
          regionCode: session.context.regionCode,
          source: 'session_cache'
        }, '[RegionResolver] Using cached region from session');

        return {
          regionCode: session.context.regionCode,
          source: 'session_cache'
        };
      }
    } catch (error) {
      logger.warn({
        sessionId,
        error: error instanceof Error ? error.message : 'unknown'
      }, '[RegionResolver] Failed to retrieve session cache');
    }
  }

  // Priority 3: Default from config
  const defaultRegion = PlacesConfig.defaultRegion.toUpperCase();

  logger.debug({
    sessionId,
    regionCode: defaultRegion,
    source: 'default_config'
  }, '[RegionResolver] Using default region from config');

  return { regionCode: defaultRegion, source: 'default_config' };
}
