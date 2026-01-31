/**
 * Cuisine-to-Types Mapper
 * 
 * Maps canonical cuisineKey to Google Places includedTypes
 * Ensures language-independent search parameters
 */

import type { CuisineKey } from '../../shared/cuisine-tokens.js';

/**
 * Map cuisineKey to Google Places includedTypes
 * Returns array of type strings that Google understands
 * 
 * Reference: https://developers.google.com/maps/documentation/places/web-service/place-types
 */
export function mapCuisineToIncludedTypes(cuisineKey?: string): string[] {
  if (!cuisineKey) {
    // Default: all restaurants
    return ['restaurant'];
  }

  // Map canonical cuisine keys to Google types
  const mapping: Record<string, string[]> = {
    // Cuisine types
    'italian': ['italian_restaurant', 'restaurant'],
    'japanese': ['japanese_restaurant', 'restaurant'],
    'chinese': ['chinese_restaurant', 'restaurant'],
    'thai': ['thai_restaurant', 'restaurant'],
    'indian': ['indian_restaurant', 'restaurant'],
    'mexican': ['mexican_restaurant', 'restaurant'],
    'french': ['french_restaurant', 'restaurant'],
    'mediterranean': ['mediterranean_restaurant', 'restaurant'],
    'middle_eastern': ['middle_eastern_restaurant', 'restaurant'],
    'american': ['american_restaurant', 'restaurant'],
    'asian': ['restaurant'], // Generic Asian
    'seafood': ['seafood_restaurant', 'restaurant'],
    'steakhouse': ['steak_house', 'restaurant'],
    
    // Specific food types
    'pizza': ['pizza_restaurant', 'restaurant'],
    'sushi': ['sushi_restaurant', 'japanese_restaurant', 'restaurant'],
    'burger': ['hamburger_restaurant', 'restaurant'],
    
    // Dietary
    'vegan': ['vegan_restaurant', 'restaurant'],
    'vegetarian': ['vegetarian_restaurant', 'restaurant'],
    'kosher': ['restaurant'], // Google doesn't have specific kosher type
    
    // Food categories
    'dairy': ['restaurant'],
    'meat': ['restaurant'],
    'fish': ['seafood_restaurant', 'restaurant'],
    
    // Meal types / venues
    'breakfast': ['breakfast_restaurant', 'restaurant'],
    'cafe': ['cafe', 'coffee_shop'],
    'bakery': ['bakery', 'cafe'],
    'dessert': ['dessert_restaurant', 'ice_cream_shop', 'bakery'],
    'fast_food': ['fast_food_restaurant', 'restaurant'],
    'fine_dining': ['restaurant'],
    'casual_dining': ['restaurant']
  };

  return mapping[cuisineKey] || ['restaurant'];
}

/**
 * Map typeKey to Google Places includedTypes
 * For non-cuisine searches (e.g., "restaurants near me")
 */
export function mapTypeToIncludedTypes(typeKey?: string): string[] {
  if (!typeKey) {
    return ['restaurant'];
  }

  const mapping: Record<string, string[]> = {
    'restaurant': ['restaurant'],
    'cafe': ['cafe', 'coffee_shop'],
    'bar': ['bar', 'night_club'],
    'bakery': ['bakery'],
    'fast_food': ['fast_food_restaurant'],
    'food': ['restaurant', 'cafe', 'bakery']
  };

  return mapping[typeKey] || ['restaurant'];
}
