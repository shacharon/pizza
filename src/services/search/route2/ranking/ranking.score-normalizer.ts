/**
 * ScoreNormalizer
 * Pure normalization functions for ranking components
 * 
 * All methods return values in range [0, 1] for weighted scoring
 */

/**
 * ScoreNormalizer class for ranking normalization
 */
export class ScoreNormalizer {
  /**
   * Normalize rating to 0-1 scale
   * 
   * @param rating - Rating value (typically 0-5 from Google)
   * @returns Normalized rating in range [0, 1], clamped
   * 
   * Logic:
   * - rating / 5, clamped to [0, 1]
   * - null/undefined treated as 0
   * 
   * Examples:
   * - 5 => 1.0
   * - 4 => 0.8
   * - 0 => 0.0
   * - null => 0.0
   */
  normalizeRating(rating: number | null | undefined): number {
    const ratingValue = rating ?? 0;
    return this.clamp(ratingValue / 5, 0, 1);
  }

  /**
   * Normalize review count to 0-1 scale using logarithmic scale
   * 
   * @param count - Number of user reviews
   * @returns Normalized review count in range [0, 1], clamped
   * 
   * Logic:
   * - log10(count + 1) / 5, clamped to [0, 1]
   * - Logarithmic scale to avoid dominance by high review counts
   * - null/undefined treated as 0
   * - Negative values treated as 0
   * 
   * Examples:
   * - 0 => 0.0 (log10(1) / 5)
   * - 9 => 0.2 (log10(10) / 5)
   * - 99 => 0.4 (log10(100) / 5)
   * - 999 => 0.6 (log10(1000) / 5)
   * - 9999 => 0.8 (log10(10000) / 5)
   * - null => 0.0
   * - negative => 0.0
   */
  normalizeReviews(count: number | null | undefined): number {
    const reviewCount = count ?? 0;
    
    // Guard against negative values to avoid NaN from log10
    if (reviewCount < 0) {
      return 0;
    }
    
    return this.clamp(Math.log10(reviewCount + 1) / 5, 0, 1);
  }

  /**
   * Normalize distance to 0-1 scale (closer is better)
   * 
   * @param distanceKm - Distance in kilometers
   * @returns Normalized distance score in range [0, 1]
   * 
   * Logic:
   * - 1 / (1 + distanceKm)
   * - Closer places get higher scores (approaches 1 as distance approaches 0)
   * - null/undefined treated as 0 (no location available)
   * - Negative values treated as 0
   * 
   * Examples:
   * - 0 km => 1.0
   * - 1 km => 0.5
   * - 4 km => 0.2
   * - 9 km => 0.1
   * - null => 0.0
   */
  normalizeDistance(distanceKm: number | null | undefined): number {
    // If distance is null/undefined, return 0 (no location bonus)
    if (distanceKm === null || distanceKm === undefined) {
      return 0;
    }

    // If distance is negative, treat as 0 (no valid distance)
    if (distanceKm < 0) {
      return 0;
    }

    // Apply formula: 1 / (1 + distanceKm)
    return 1 / (1 + distanceKm);
  }

  /**
   * Normalize open/closed status to 0-1 scale
   * 
   * @param openNow - Open status (true, false, 'UNKNOWN', null, undefined)
   * @returns Normalized open score in range [0, 1]
   * 
   * Logic:
   * - true (open) => 1.0
   * - false (closed) => 0.0
   * - 'UNKNOWN', null, undefined => 0.5 (neutral)
   * 
   * Examples:
   * - true => 1.0
   * - false => 0.0
   * - 'UNKNOWN' => 0.5
   * - null => 0.5
   */
  normalizeOpen(openNow: boolean | 'UNKNOWN' | null | undefined): number {
    if (openNow === true) {
      return 1;
    } else if (openNow === false) {
      return 0;
    } else {
      // 'UNKNOWN', null, undefined => 0.5
      return 0.5;
    }
  }

  /**
   * Clamp value between min and max
   * 
   * @param value - Value to clamp
   * @param min - Minimum value
   * @param max - Maximum value
   * @returns Clamped value in range [min, max]
   */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
