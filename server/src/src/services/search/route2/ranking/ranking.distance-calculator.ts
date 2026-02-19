/**
 * DistanceCalculator
 * Calculates geographic distances using the Haversine formula
 * 
 * Returns distances in kilometers
 */

/**
 * DistanceCalculator class for geographic distance calculations
 */
export class DistanceCalculator {
  /**
   * Earth's radius in kilometers
   */
  private readonly EARTH_RADIUS_KM = 6371;

  /**
   * Calculate Haversine distance between two coordinates
   * 
   * @param lat1 - Latitude of first point (degrees)
   * @param lon1 - Longitude of first point (degrees)
   * @param lat2 - Latitude of second point (degrees)
   * @param lon2 - Longitude of second point (degrees)
   * @returns Distance in kilometers
   * 
   * Formula:
   * - Uses Haversine formula for great-circle distance
   * - Accounts for Earth's spherical shape
   * - Returns distance in kilometers
   * 
   * Examples:
   * - Same point: distance = 0
   * - Tel Aviv (32.0853, 34.7818) to Jerusalem (31.7683, 35.2137): ~52 km
   * - New York (40.7128, -74.0060) to Los Angeles (34.0522, -118.2437): ~3944 km
   */
  haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
      Math.cos(this.toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = this.EARTH_RADIUS_KM * c;

    return distance;
  }

  /**
   * Convert degrees to radians
   * 
   * @param degrees - Angle in degrees
   * @returns Angle in radians
   * 
   * Formula: radians = degrees * (π / 180)
   */
  toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }
}
