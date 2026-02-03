/**
 * Distance Calculation Utilities
 * Haversine formula for straight-line distance between two coordinates
 */

import type { Coordinates } from '../domain/types/search.types';

/**
 * Calculate straight-line distance between two coordinates using Haversine formula
 * @param from Starting coordinates
 * @param to Destination coordinates
 * @returns Distance in meters
 */
export function calculateDistance(from: Coordinates, to: Coordinates): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = toRadians(from.lat);
  const φ2 = toRadians(to.lat);
  const Δφ = toRadians(to.lat - from.lat);
  const Δλ = toRadians(to.lng - from.lng);

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Calculate walking time in minutes
 * @param distanceMeters Distance in meters
 * @returns Walking time in minutes (rounded)
 */
export function calculateWalkingTime(distanceMeters: number): number {
  // Walking speed: 5 km/h = 83.3 m/min
  return Math.round(distanceMeters / 83.3);
}

/**
 * Format distance for display with i18n support
 * @param distanceMeters Distance in meters
 * @param metersUnit i18n unit for meters (e.g., 'm', 'מ׳', 'м')
 * @param kmUnit i18n unit for kilometers (e.g., 'km', 'ק״מ', 'км')
 * @returns Formatted distance string (e.g., "1.2 km", "350 m")
 */
export function formatDistance(distanceMeters: number, metersUnit: string, kmUnit: string): string {
  if (distanceMeters >= 1000) {
    const km = (distanceMeters / 1000).toFixed(1);
    return `${km} ${kmUnit}`;
  }
  return `${Math.round(distanceMeters)} ${metersUnit}`;
}

/**
 * Get distance value and unit separately for advanced formatting
 * @param distanceMeters Distance in meters
 * @returns Object with value and unit type
 */
export function getDistanceComponents(distanceMeters: number): { value: string; unitType: 'meters' | 'km' } {
  if (distanceMeters >= 1000) {
    const km = (distanceMeters / 1000).toFixed(1);
    return { value: km, unitType: 'km' };
  }
  return { value: Math.round(distanceMeters).toString(), unitType: 'meters' };
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return degrees * Math.PI / 180;
}
