/**
 * Review Count Filter - Deterministic Mapping Matrix
 *
 * Maps review count intent buckets (from LLM) to actual minimum review count thresholds.
 *
 * Design Rules:
 * - LLM extracts INTENT ONLY (bucket: C25, C100, C500)
 * - This matrix is the SINGLE SOURCE OF TRUTH for numeric thresholds
 * - Unknown review count is KEPT (not filtered out)
 * - If filter yields 0 results → auto-relax only this filter
 *
 * Bucket Semantics:
 * - C25:  Some reviews, not brand new (25+ reviews)
 * - C100: Well-known, established place (100+ reviews)
 * - C500: Very popular, widely known (500+ reviews)
 */

/**
 * Deterministic mapping: Intent Bucket → Minimum Review Count
 */
export const REVIEW_COUNT_MATRIX = {
    C25: 25,
    C100: 100,
    C500: 500,
} as const;

/**
 * Type-safe bucket keys
 */
export type MinReviewCountBucket = keyof typeof REVIEW_COUNT_MATRIX;

/**
 * Get minimum review count threshold for a given bucket
 * Returns null if bucket is null (no filtering)
 *
 * @param bucket Intent bucket from LLM (or null)
 * @returns Minimum review count threshold, or null if no filtering
 */
export function getMinReviewCountThreshold(bucket: MinReviewCountBucket | null): number | null {
    if (bucket === null) return null;
    return REVIEW_COUNT_MATRIX[bucket];
}

/**
 * Check if a place meets the minimum review count requirement
 *
 * @param userRatingsTotal Total number of user ratings/reviews for the place
 * @param minReviewCountBucket Minimum review count bucket filter (or null)
 * @returns true if place meets requirement, false otherwise
 *
 * Design Note: Places with unknown review count (undefined/null) are KEPT
 */
export function meetsMinReviewCountRequirement(
    userRatingsTotal: number | undefined | null,
    minReviewCountBucket: MinReviewCountBucket | null
): boolean {
    // No filter applied
    if (minReviewCountBucket === null) {
        return true;
    }

    // Unknown review count → KEEP (design rule: unknown is kept)
    if (userRatingsTotal === undefined || userRatingsTotal === null) {
        return true;
    }

    // Apply threshold
    const threshold = REVIEW_COUNT_MATRIX[minReviewCountBucket];
    return userRatingsTotal >= threshold;
}
