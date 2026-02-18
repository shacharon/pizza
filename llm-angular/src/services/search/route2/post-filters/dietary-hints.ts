/**
 * Dietary Hints - SOFT Hinting System
 * 
 * Pure functions to compute dietary preference hints without removing results.
 * Used for ranking/metadata enrichment only.
 */

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface DietaryHint {
  confidence: ConfidenceLevel;
  matchedTerms: string[];
}

export interface PlaceDto {
  name?: string;
  address?: string;
  tags?: string[]; // Google Place types
  [key: string]: any;
}

/**
 * Compute gluten-free hint for a place
 * 
 * Confidence levels:
 * - HIGH: Strong explicit mentions in name (e.g., "Gluten-Free Bakery")
 * - MEDIUM: Moderate signals (gluten-free in name with modifiers, or health/special diet types)
 * - LOW: Weak signals (health-related types, relevant categories)
 * - NONE: No signals detected
 * 
 * @param placeDto - Place result DTO with name, tags, address
 * @returns Hint with confidence level and matched terms
 */
export function computeGlutenFreeHint(placeDto: PlaceDto): DietaryHint {
  const name = placeDto.name?.toLowerCase() || '';
  const address = placeDto.address?.toLowerCase() || '';
  const tags = placeDto.tags?.map(t => t.toLowerCase()) || [];

  const matchedTerms: string[] = [];

  // HIGH confidence: Strong explicit gluten-free mentions in name
  const highConfidencePatterns = [
    'gluten-free',
    'gluten free',
    'glutenfree',
    'ללא גלוטן',
    'לגלוטן',
    'celiac-friendly',
    'celiac friendly',
    'sin gluten',
    'sans gluten',
    'senza glutine'
  ];

  for (const pattern of highConfidencePatterns) {
    if (name.includes(pattern)) {
      matchedTerms.push(pattern);
    }
  }

  // Check for strong standalone mentions (e.g., "GF Bakery", "GF Kitchen")
  if (/\bgf\b/.test(name) || /\bg\.f\.\b/.test(name)) {
    matchedTerms.push('gf-abbreviation');
  }

  // HIGH confidence if we found explicit mentions
  if (matchedTerms.length > 0) {
    return {
      confidence: 'HIGH',
      matchedTerms
    };
  }

  // MEDIUM confidence: Moderate signals
  const mediumConfidenceTerms = [
    'health food',
    'health bar',
    'vegan',
    'organic',
    'allergen-free',
    'allergy-friendly',
    'dietary',
    'nutrition'
  ];

  for (const term of mediumConfidenceTerms) {
    if (name.includes(term)) {
      matchedTerms.push(term);
    }
  }

  // Check tags for health/special diet indicators
  const healthRelatedTypes = [
    'health_food_restaurant',
    'vegan_restaurant',
    'vegetarian_restaurant',
    'organic_restaurant'
  ];

  for (const type of healthRelatedTypes) {
    if (tags.includes(type)) {
      matchedTerms.push(`type:${type}`);
    }
  }

  // MEDIUM confidence if we found moderate signals
  if (matchedTerms.length > 0) {
    return {
      confidence: 'MEDIUM',
      matchedTerms
    };
  }

  // LOW confidence: Weak signals (bakery/cafe with no gluten mention might have options)
  const lowConfidenceTypes = [
    'bakery',
    'cafe',
    'restaurant',
    'food'
  ];

  for (const type of lowConfidenceTypes) {
    if (tags.includes(type)) {
      matchedTerms.push(`type:${type}`);
    }
  }

  // Only return LOW if it's a food establishment
  if (matchedTerms.length > 0) {
    return {
      confidence: 'LOW',
      matchedTerms
    };
  }

  // NONE: No signals detected
  return {
    confidence: 'NONE',
    matchedTerms: []
  };
}

/**
 * Attach dietary hints to place DTO (mutates object)
 * Only attaches hints when dietary preference is active
 * 
 * @param placeDto - Place result DTO to enrich
 * @param isGlutenFree - Whether user requested gluten-free preference
 */
export function attachDietaryHints(placeDto: PlaceDto, isGlutenFree: boolean | null): void {
  if (!isGlutenFree) {
    // Don't attach hints if preference not requested
    return;
  }

  const glutenFreeHint = computeGlutenFreeHint(placeDto);

  // Initialize dietaryHints if not present
  if (!placeDto.dietaryHints) {
    (placeDto as any).dietaryHints = {};
  }

  // Attach gluten-free hint
  (placeDto as any).dietaryHints.glutenFree = glutenFreeHint;
}
