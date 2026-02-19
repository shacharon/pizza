/**
 * Location Bias Validator
 * Validates and normalizes location bias coordinates for Google Places API
 * 
 * Validation rules:
 * - Lat must be in range [-90, 90]
 * - Lng must be in range [-180, 180]
 * - Detect suspicious coordinates (potential swaps for Israel region)
 */

import { logger } from '../../../../../../lib/logger/structured-logger.js';

/**
 * Validate location bias coordinates
 * Returns validated coordinates or null if invalid
 * 
 * @param center - Coordinates to validate
 * @param requestId - Request ID for logging
 * @returns Validated coordinates or null if invalid
 */
export function validateLocationBias(
  center: { lat: number; lng: number },
  requestId?: string
): { lat: number; lng: number } | null {
  const { lat, lng } = center;

  // Check valid ranges
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    logger.warn({
      requestId,
      event: 'bias_invalid_discarded',
      reason: 'out_of_range',
      lat,
      lng
    }, '[GOOGLE] Invalid bias coordinates discarded');
    return null;
  }

  // Detect potential swapped coordinates for Israel region
  // Israel: lat ~29-33, lng ~34-36
  // If both values are ~34-35, likely swapped or invalid
  if (Math.abs(lat - lng) < 0.5 && lat > 32 && lat < 36 && lng > 32 && lng < 36) {
    logger.warn({
      requestId,
      event: 'bias_invalid_discarded',
      reason: 'suspicious_duplicate_values',
      lat,
      lng
    }, '[GOOGLE] Suspicious bias coordinates (possible swap) discarded');
    return null;
  }

  return { lat, lng };
}
