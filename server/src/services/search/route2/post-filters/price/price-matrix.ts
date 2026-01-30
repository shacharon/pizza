/**
 * Price Matrix - Canonical mapping for price filtering
 * 
 * Single source of truth for priceIntent → Google priceLevel mapping
 * 
 * Google Places API priceLevel:
 * - 1: Cheap/Inexpensive ($)
 * - 2: Moderate ($$)
 * - 3: Expensive ($$$)
 * - 4: Very Expensive ($$$$)
 * - null/undefined: Unknown pricing
 */

type PriceIntentEnum = 'CHEAP' | 'MID' | 'EXPENSIVE';

/**
 * Canonical price matrix
 * Maps user intent to Google priceLevel values
 */
export const PRICE_MATRIX: Record<PriceIntentEnum, { googleLevels: number[] }> = {
    CHEAP: {
        googleLevels: [1]
    },
    MID: {
        googleLevels: [2]
    },
    EXPENSIVE: {
        googleLevels: [3, 4]
    }
};

/**
 * Check if a priceLevel matches the given priceIntent
 * 
 * @param priceLevel - Google Places priceLevel (1-4, or null/undefined)
 * @param priceIntent - User's price preference (non-null)
 * @returns true if priceLevel matches intent, false otherwise
 */
export function matchesPriceIntent(
    priceLevel: number | null | undefined,
    priceIntent: PriceIntentEnum
): boolean {
    if (priceLevel === null || priceLevel === undefined) {
        // Unknown pricing -> KEEP by default (conservative policy)
        return true;
    }

    const allowedLevels = PRICE_MATRIX[priceIntent].googleLevels;
    return allowedLevels.includes(priceLevel);
}
