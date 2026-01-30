/**
 * Rating Matrix - Canonical mapping for rating filtering
 * 
 * Single source of truth for minRatingBucket → minimum rating threshold
 * 
 * Google Places API rating:
 * - 1.0 to 5.0: Numeric rating
 * - null/undefined: Unknown rating
 */

type MinRatingBucketEnum = 'R35' | 'R40' | 'R45';

/**
 * Canonical rating matrix
 * Maps user rating intent to minimum rating threshold
 */
export const RATING_MATRIX: Record<MinRatingBucketEnum, { threshold: number }> = {
    R35: {
        threshold: 3.5
    },
    R40: {
        threshold: 4.0
    },
    R45: {
        threshold: 4.5
    }
};

/**
 * Check if a rating meets the minimum rating bucket threshold
 * 
 * @param rating - Google Places rating (1.0-5.0, or null/undefined)
 * @param minRatingBucket - User's minimum rating preference
 * @returns true if rating meets threshold, false otherwise
 */
export function meetsMinRating(
    rating: number | null | undefined,
    minRatingBucket: MinRatingBucketEnum
): boolean {
    if (rating === null || rating === undefined) {
        // Unknown rating -> KEEP by default (conservative policy)
        return true;
    }

    const threshold = RATING_MATRIX[minRatingBucket].threshold;
    return rating >= threshold;
}
