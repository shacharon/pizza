/**
 * Region Resolver Utility
 * 
 * Resolves region code with proper priority order:
 * 1. Device coordinates (IL bbox check)
 * 2. Session cache
 * 3. DEFAULT_REGION from config
 * 
 * NO language/text heuristics - only geographic bounds
 * 
 * NOTE: This utility is NOT used by Gate2 anymore. Gate2 now gets regionCode from LLM.
 * This file remains for potential future use by other stages.
 */

import type { Route2Context } from '../types.js';
import { PlacesConfig } from '../../../places/config/places.config.js';
import { logger } from '../../../../lib/logger/structured-logger.js';

type RegionSource = 'device' | 'session' | 'config';

// Israel bounding box (hardcoded constants)
const IL_BBOX = {
  latMin: 29.45,
  latMax: 33.35,
  lngMin: 34.20,
  lngMax: 35.90
};

/**
 * Check if coordinates are within Israel bounding box
 */
function isInIsraelBBox(lat: number, lng: number): boolean {
  return lat >= IL_BBOX.latMin && lat <= IL_BBOX.latMax &&
    lng >= IL_BBOX.lngMin && lng <= IL_BBOX.lngMax;
}

/**
 * Resolve user region code with priority order
 * Based on device coordinates only, NOT query content
 * 
 * @param context Route2 pipeline context
 * @returns User region code and source
 */
export async function resolveUserRegionCode(
  context: Route2Context
): Promise<{ userRegionCode: 'IL' | 'OTHER'; source: RegionSource }> {
  const { userLocation, sessionId, sessionService, requestId } = context;

  // Priority 1: Device coordinates
  if (userLocation) {
    const userRegionCode = isInIsraelBBox(userLocation.lat, userLocation.lng) ? 'IL' : 'OTHER';

    // Cache in session (using 'regionCode' key for compatibility)
    if (sessionService && sessionId) {
      try {
        const session = await sessionService.get(sessionId);
        if (session) {
          await sessionService.update(sessionId, {
            context: { ...session.context, regionCode: userRegionCode }
          });
        }
      } catch (error) {
        logger.warn({
          requestId,
          sessionId,
          error: error instanceof Error ? error.message : 'unknown'
        }, '[RegionResolver] Failed to cache user region in session');
      }
    }

    return { userRegionCode, source: 'device' };
  }

  // Priority 2: Session cache
  if (sessionService && sessionId) {
    try {
      const session = await sessionService.get(sessionId);
      if (session?.context.regionCode) {
        return { userRegionCode: session.context.regionCode as 'IL' | 'OTHER', source: 'session' };
      }
    } catch (error) {
      logger.warn({
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : 'unknown'
      }, '[RegionResolver] Failed to retrieve session cache');
    }
  }

  // Priority 3: Default from config
  const defaultRegion = (PlacesConfig.defaultRegion?.toUpperCase() || 'IL') as 'IL' | 'OTHER';

  // Cache in session (using 'regionCode' key for compatibility)
  if (sessionService && sessionId) {
    try {
      const session = await sessionService.get(sessionId);
      if (session) {
        await sessionService.update(sessionId, {
          context: { ...session.context, regionCode: defaultRegion }
        });
      }
    } catch (error) {
      logger.warn({
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : 'unknown'
      }, '[RegionResolver] Failed to cache default user region');
    }
  }

  return { userRegionCode: defaultRegion, source: 'config' };
}
