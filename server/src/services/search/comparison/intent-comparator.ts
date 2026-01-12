/**
 * Intent Comparator (Phase 3)
 * 
 * Compares mapped SearchIntent (from legacy parser) with direct SearchIntent (from LLM).
 * Used to validate the new LLM prompt and identify differences.
 */

import type { SearchIntent } from '../types/intent.dto.js';

/**
 * Type of difference detected
 */
export type DifferenceType =
  | 'foodAnchor.type'
  | 'foodAnchor.present'
  | 'locationAnchor.text'
  | 'locationAnchor.type'
  | 'locationAnchor.present'
  | 'nearMe'
  | 'explicitDistance.meters'
  | 'explicitDistance.originalText'
  | 'preferences.dietary'
  | 'preferences.priceLevel'
  | 'preferences.openNow'
  | 'preferences.delivery'
  | 'preferences.takeout'
  | 'language'
  | 'confidence';

/**
 * A single difference between two intents
 */
export interface IntentDifference {
  field: DifferenceType;
  mapped: any;
  direct: any;
  severity: 'critical' | 'moderate' | 'minor';
}

/**
 * Result of comparing two SearchIntents
 */
export interface IntentComparison {
  /**
   * Whether intents match (no critical differences)
   */
  matched: boolean;
  
  /**
   * List of all differences found
   */
  differences: IntentDifference[];
  
  /**
   * Confidence comparison
   */
  confidence: {
    mapped: number;
    direct: number;
    delta: number;
  };
  
  /**
   * Field-level match metrics
   */
  metrics: {
    foodAnchorMatch: boolean;
    locationAnchorMatch: boolean;
    nearMeMatch: boolean;
    preferencesMatch: boolean;
  };
}

/**
 * Compare two SearchIntents and identify differences
 * 
 * @param mapped - SearchIntent from legacy parser + mapper
 * @param direct - SearchIntent from direct LLM extraction
 * @returns Comparison result with differences
 */
export function compareSearchIntents(
  mapped: SearchIntent,
  direct: SearchIntent
): IntentComparison {
  
  const differences: IntentDifference[] = [];
  
  // Compare food anchor
  const foodAnchorMatch = compareFoodAnchor(mapped, direct, differences);
  
  // Compare location anchor
  const locationAnchorMatch = compareLocationAnchor(mapped, direct, differences);
  
  // Compare nearMe
  const nearMeMatch = compareNearMe(mapped, direct, differences);
  
  // Compare explicit distance
  compareExplicitDistance(mapped, direct, differences);
  
  // Compare preferences
  const preferencesMatch = comparePreferences(mapped, direct, differences);
  
  // Compare language
  compareLanguage(mapped, direct, differences);
  
  // Compare confidence
  const confidenceDelta = direct.confidence - mapped.confidence;
  if (Math.abs(confidenceDelta) > 0.15) {
    differences.push({
      field: 'confidence',
      mapped: mapped.confidence,
      direct: direct.confidence,
      severity: 'minor'
    });
  }
  
  // Determine if matched (no critical differences)
  const hasCriticalDifferences = differences.some(d => d.severity === 'critical');
  const matched = !hasCriticalDifferences;
  
  return {
    matched,
    differences,
    confidence: {
      mapped: mapped.confidence,
      direct: direct.confidence,
      delta: confidenceDelta
    },
    metrics: {
      foodAnchorMatch,
      locationAnchorMatch,
      nearMeMatch,
      preferencesMatch
    }
  };
}

/**
 * Compare food anchors
 */
function compareFoodAnchor(
  mapped: SearchIntent,
  direct: SearchIntent,
  differences: IntentDifference[]
): boolean {
  
  let match = true;
  
  // Compare present flag
  if (mapped.foodAnchor.present !== direct.foodAnchor.present) {
    differences.push({
      field: 'foodAnchor.present',
      mapped: mapped.foodAnchor.present,
      direct: direct.foodAnchor.present,
      severity: 'critical'
    });
    match = false;
  }
  
  // Compare type (fuzzy match if both present)
  if (mapped.foodAnchor.present && direct.foodAnchor.present) {
    const mappedType = normalizeText(mapped.foodAnchor.type);
    const directType = normalizeText(direct.foodAnchor.type);
    
    if (mappedType !== directType) {
      // Check if they're similar enough (e.g., "pizza" vs "פיצה")
      const similar = areSimilarFoodTypes(mappedType, directType);
      
      differences.push({
        field: 'foodAnchor.type',
        mapped: mapped.foodAnchor.type,
        direct: direct.foodAnchor.type,
        severity: similar ? 'moderate' : 'critical'
      });
      
      if (!similar) {
        match = false;
      }
    }
  }
  
  return match;
}

/**
 * Compare location anchors
 */
function compareLocationAnchor(
  mapped: SearchIntent,
  direct: SearchIntent,
  differences: IntentDifference[]
): boolean {
  
  let match = true;
  
  // Compare present flag
  if (mapped.locationAnchor.present !== direct.locationAnchor.present) {
    differences.push({
      field: 'locationAnchor.present',
      mapped: mapped.locationAnchor.present,
      direct: direct.locationAnchor.present,
      severity: 'critical'
    });
    match = false;
  }
  
  // Compare type
  if (mapped.locationAnchor.type !== direct.locationAnchor.type) {
    differences.push({
      field: 'locationAnchor.type',
      mapped: mapped.locationAnchor.type,
      direct: direct.locationAnchor.type,
      severity: 'moderate'
    });
  }
  
  // Compare text (fuzzy match if both present)
  if (mapped.locationAnchor.present && direct.locationAnchor.present) {
    const mappedText = normalizeText(mapped.locationAnchor.text);
    const directText = normalizeText(direct.locationAnchor.text);
    
    if (mappedText !== directText) {
      differences.push({
        field: 'locationAnchor.text',
        mapped: mapped.locationAnchor.text,
        direct: direct.locationAnchor.text,
        severity: 'moderate'
      });
    }
  }
  
  return match;
}

/**
 * Compare nearMe flags
 */
function compareNearMe(
  mapped: SearchIntent,
  direct: SearchIntent,
  differences: IntentDifference[]
): boolean {
  
  if (mapped.nearMe !== direct.nearMe) {
    differences.push({
      field: 'nearMe',
      mapped: mapped.nearMe,
      direct: direct.nearMe,
      severity: 'critical'
    });
    return false;
  }
  
  return true;
}

/**
 * Compare explicit distance
 */
function compareExplicitDistance(
  mapped: SearchIntent,
  direct: SearchIntent,
  differences: IntentDifference[]
): void {
  
  // Compare meters
  if (mapped.explicitDistance.meters !== direct.explicitDistance.meters) {
    differences.push({
      field: 'explicitDistance.meters',
      mapped: mapped.explicitDistance.meters,
      direct: direct.explicitDistance.meters,
      severity: 'moderate'
    });
  }
  
  // Compare original text (if both have values)
  if (mapped.explicitDistance.originalText && direct.explicitDistance.originalText) {
    const mappedText = normalizeText(mapped.explicitDistance.originalText);
    const directText = normalizeText(direct.explicitDistance.originalText);
    
    if (mappedText !== directText) {
      differences.push({
        field: 'explicitDistance.originalText',
        mapped: mapped.explicitDistance.originalText,
        direct: direct.explicitDistance.originalText,
        severity: 'minor'
      });
    }
  }
}

/**
 * Compare preferences
 */
function comparePreferences(
  mapped: SearchIntent,
  direct: SearchIntent,
  differences: IntentDifference[]
): boolean {
  
  let match = true;
  
  // Compare dietary (array comparison)
  const mappedDietary = mapped.preferences?.dietary || [];
  const directDietary = direct.preferences?.dietary || [];
  
  if (!arraysEqual(mappedDietary, directDietary)) {
    differences.push({
      field: 'preferences.dietary',
      mapped: mappedDietary,
      direct: directDietary,
      severity: 'moderate'
    });
    match = false;
  }
  
  // Compare priceLevel
  if (mapped.preferences?.priceLevel !== direct.preferences?.priceLevel) {
    differences.push({
      field: 'preferences.priceLevel',
      mapped: mapped.preferences?.priceLevel,
      direct: direct.preferences?.priceLevel,
      severity: 'minor'
    });
  }
  
  // Compare openNow
  if (mapped.preferences?.openNow !== direct.preferences?.openNow) {
    differences.push({
      field: 'preferences.openNow',
      mapped: mapped.preferences?.openNow,
      direct: direct.preferences?.openNow,
      severity: 'moderate'
    });
    match = false;
  }
  
  // Compare delivery
  if (mapped.preferences?.delivery !== direct.preferences?.delivery) {
    differences.push({
      field: 'preferences.delivery',
      mapped: mapped.preferences?.delivery,
      direct: direct.preferences?.delivery,
      severity: 'minor'
    });
  }
  
  // Compare takeout
  if (mapped.preferences?.takeout !== direct.preferences?.takeout) {
    differences.push({
      field: 'preferences.takeout',
      mapped: mapped.preferences?.takeout,
      direct: direct.preferences?.takeout,
      severity: 'minor'
    });
  }
  
  return match;
}

/**
 * Compare language
 */
function compareLanguage(
  mapped: SearchIntent,
  direct: SearchIntent,
  differences: IntentDifference[]
): void {
  
  if (mapped.language !== direct.language) {
    differences.push({
      field: 'language',
      mapped: mapped.language,
      direct: direct.language,
      severity: 'minor'
    });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Normalize text for comparison (lowercase, trim, remove extra spaces)
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Check if two food types are similar enough to be considered a match
 */
function areSimilarFoodTypes(type1: string, type2: string): boolean {
  // Exact match
  if (type1 === type2) return true;
  
  // One contains the other
  if (type1.includes(type2) || type2.includes(type1)) return true;
  
  // Common translations (pizza/פיצה, sushi/סושי, etc.)
  const translations: Record<string, string[]> = {
    'pizza': ['פיצה', 'pizza'],
    'sushi': ['סושי', 'sushi'],
    'burger': ['המבורגר', 'burger'],
    'italian': ['איטלקי', 'italian', 'איטלקית'],
    'chinese': ['סיני', 'chinese', 'סינית'],
    'japanese': ['יפני', 'japanese', 'יפנית']
  };
  
  for (const [key, variants] of Object.entries(translations)) {
    if (variants.includes(type1) && variants.includes(type2)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Check if two arrays are equal (order-independent for dietary)
 */
function arraysEqual(arr1: string[], arr2: string[]): boolean {
  if (arr1.length !== arr2.length) return false;
  
  const sorted1 = [...arr1].sort();
  const sorted2 = [...arr2].sort();
  
  return sorted1.every((val, idx) => val === sorted2[idx]);
}
