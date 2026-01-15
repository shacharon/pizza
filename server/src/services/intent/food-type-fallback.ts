/**
 * Deterministic fallback for common food type tokens
 * Applies ONLY when LLM confidence is low or category is null/empty
 */

const FOOD_TYPE_TOKENS = {
    // Hebrew
    'חומוסיה': 'hummus restaurant',
    'חומוסייה': 'hummus restaurant',
    'חומוס': 'hummus restaurant',
    'בשרים': 'meat restaurant',
    'מסעדת בשרים': 'meat restaurant',
    'סטייק': 'meat restaurant',
    'על האש': 'meat restaurant',
    'חלבי': 'dairy restaurant',
    'מסעדה חלבית': 'dairy restaurant',
    'צמחוני': 'vegetarian restaurant',
    'מסעדה צמחונית': 'vegetarian restaurant',

    // Russian
    'хумус': 'hummus restaurant',
    'хумусия': 'hummus restaurant',
    'мясной': 'meat restaurant',
    'мясной ресторан': 'meat restaurant',
    'стейкхаус': 'meat restaurant',
    'молочный': 'dairy restaurant',
    'молочный ресторан': 'dairy restaurant',
    'вегетарианский': 'vegetarian restaurant',

    // English (for completeness)
    'hummus place': 'hummus restaurant',
    'steakhouse': 'meat restaurant',
    'grill': 'meat restaurant',
    'bbq': 'meat restaurant',
} as const;

export function applyFoodTypeFallback(
    rawQuery: string,
    currentCanonical: string | null | undefined,
    confidence: number,
    confidenceThreshold = 0.7
): string | null {
    // Only apply if category is missing OR confidence is low
    if (currentCanonical && confidence >= confidenceThreshold) {
        return currentCanonical;
    }

    const lowerQuery = rawQuery.toLowerCase().trim();

    // Check for exact matches first
    for (const [token, canonical] of Object.entries(FOOD_TYPE_TOKENS)) {
        if (lowerQuery.includes(token.toLowerCase())) {
            return canonical;
        }
    }

    return currentCanonical || null;
}
