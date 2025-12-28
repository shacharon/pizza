/**
 * Places Fixtures
 * Phase 7: Mock data for deterministic CI testing
 * 
 * Provides fixture data for QA dataset queries
 * Ensures stable, repeatable test results
 */

import type { PlaceItem } from '../places.types.js';

/**
 * Fixture data keyed by category_city pattern
 * Matches QA dataset queries for predictable results
 */
export const FIXTURES: Record<string, PlaceItem[]> = {
  // Pizza in Tel Aviv (Hebrew + English)
  'pizza_tel_aviv': [
    {
      id: 'fixture_pizza_ta_1',
      name: 'Pizza Tel Aviv 1',
      rating: 4.5,
      reviewCount: 150,
      priceLevel: 2,
      location: { lat: 32.0853, lng: 34.7818, city: 'Tel Aviv' },
      categories: ['pizza', 'italian'],
      cuisine: 'italian',
      openNow: 'UNKNOWN',
      address: 'Dizengoff St, Tel Aviv'
    },
    {
      id: 'fixture_pizza_ta_2',
      name: 'Pizza Tel Aviv 2',
      rating: 4.3,
      reviewCount: 98,
      priceLevel: 2,
      location: { lat: 32.0789, lng: 34.7806, city: 'Tel Aviv' },
      categories: ['pizza'],
      cuisine: 'italian',
      openNow: 'UNKNOWN',
      address: 'Rothschild Blvd, Tel Aviv'
    },
    {
      id: 'fixture_pizza_ta_3',
      name: 'Pizza Tel Aviv 3',
      rating: 4.6,
      reviewCount: 200,
      priceLevel: 3,
      location: { lat: 32.0744, lng: 34.7765, city: 'Tel Aviv' },
      categories: ['pizza', 'restaurant'],
      cuisine: 'italian',
      openNow: 'UNKNOWN',
      address: 'Allenby St, Tel Aviv'
    }
  ],

  // Sushi in Jerusalem (Hebrew + English)
  'sushi_jerusalem': [
    {
      id: 'fixture_sushi_jer_1',
      name: 'Sushi Jerusalem 1',
      rating: 4.4,
      reviewCount: 120,
      priceLevel: 3,
      location: { lat: 31.7683, lng: 35.2137, city: 'Jerusalem' },
      categories: ['sushi', 'japanese'],
      cuisine: 'japanese',
      openNow: 'UNKNOWN',
      address: 'Jaffa Rd, Jerusalem'
    },
    {
      id: 'fixture_sushi_jer_2',
      name: 'Sushi Jerusalem 2',
      rating: 4.2,
      reviewCount: 85,
      priceLevel: 2,
      location: { lat: 31.7767, lng: 35.2345, city: 'Jerusalem' },
      categories: ['sushi'],
      cuisine: 'japanese',
      openNow: 'UNKNOWN',
      address: 'King George St, Jerusalem'
    }
  ],

  // Italian in Haifa (Hebrew + English)
  'italian_haifa': [
    {
      id: 'fixture_italian_haifa_1',
      name: 'Italian Restaurant Haifa',
      rating: 4.5,
      reviewCount: 110,
      priceLevel: 3,
      location: { lat: 32.7940, lng: 34.9896, city: 'Haifa' },
      categories: ['italian', 'restaurant'],
      cuisine: 'italian',
      openNow: 'UNKNOWN',
      address: 'Haifa Port, Haifa'
    }
  ],

  // Burger in Tel Aviv
  'burger_tel_aviv': [
    {
      id: 'fixture_burger_ta_1',
      name: 'Burger Place Tel Aviv',
      rating: 4.4,
      reviewCount: 180,
      priceLevel: 2,
      location: { lat: 32.0809, lng: 34.7806, city: 'Tel Aviv' },
      categories: ['burger', 'american'],
      cuisine: 'american',
      openNow: 'UNKNOWN',
      address: 'Ben Yehuda St, Tel Aviv'
    }
  ],

  // Vegan in Tel Aviv + Jerusalem
  'vegan_tel_aviv': [
    {
      id: 'fixture_vegan_ta_1',
      name: 'Vegan Restaurant Tel Aviv',
      rating: 4.6,
      reviewCount: 95,
      priceLevel: 2,
      location: { lat: 32.0667, lng: 34.7743, city: 'Tel Aviv' },
      categories: ['vegan', 'restaurant'],
      cuisine: 'vegan',
      dietaryOptions: ['vegan'],
      openNow: 'UNKNOWN',
      address: 'Florentin, Tel Aviv'
    }
  ],

  'vegan_jerusalem': [
    {
      id: 'fixture_vegan_jer_1',
      name: 'Vegan Restaurant Jerusalem',
      rating: 4.5,
      reviewCount: 75,
      priceLevel: 2,
      location: { lat: 31.7683, lng: 35.2137, city: 'Jerusalem' },
      categories: ['vegan', 'restaurant'],
      cuisine: 'vegan',
      dietaryOptions: ['vegan'],
      openNow: 'UNKNOWN',
      address: 'Mahane Yehuda, Jerusalem'
    }
  ],

  // Kosher in Jerusalem
  'kosher_jerusalem': [
    {
      id: 'fixture_kosher_jer_1',
      name: 'Kosher Restaurant Jerusalem',
      rating: 4.3,
      reviewCount: 130,
      priceLevel: 2,
      location: { lat: 31.7780, lng: 35.2094, city: 'Jerusalem' },
      categories: ['kosher', 'restaurant'],
      cuisine: 'kosher',
      dietaryOptions: ['kosher'],
      openNow: 'UNKNOWN',
      address: 'Geula, Jerusalem'
    }
  ],

  // Cafe in Tel Aviv
  'cafe_tel_aviv': [
    {
      id: 'fixture_cafe_ta_1',
      name: 'Cafe Tel Aviv',
      rating: 4.4,
      reviewCount: 160,
      priceLevel: 2,
      location: { lat: 32.0833, lng: 34.7800, city: 'Tel Aviv' },
      categories: ['cafe', 'coffee'],
      cuisine: 'cafe',
      openNow: 'UNKNOWN',
      address: 'Rothschild Blvd, Tel Aviv'
    }
  ],

  // Default fallback - generic restaurants
  'default': [
    {
      id: 'fixture_default_1',
      name: 'Mock Restaurant',
      rating: 4.0,
      reviewCount: 50,
      priceLevel: 2,
      location: { lat: 32.0853, lng: 34.7818, city: 'Tel Aviv' },
      categories: ['restaurant'],
      cuisine: 'general',
      openNow: 'UNKNOWN',
      address: 'Mock Address'
    }
  ]
};

/**
 * Load fixtures into a Map for fast lookup
 */
export function loadFixtures(): Map<string, PlaceItem[]> {
  const fixtureMap = new Map<string, PlaceItem[]>();
  
  for (const [key, places] of Object.entries(FIXTURES)) {
    fixtureMap.set(key.toLowerCase(), places);
  }
  
  return fixtureMap;
}

/**
 * Get fixture key from search parameters
 * Normalizes query to match fixture keys
 */
export function getFixtureKey(category?: string, city?: string): string {
  const cat = category?.toLowerCase().trim() || 'default';
  const loc = city?.toLowerCase().trim() || 'default';
  
  // Try exact match first
  const exactKey = `${cat}_${loc}`;
  if (FIXTURES[exactKey]) {
    return exactKey;
  }
  
  // Try category only
  if (FIXTURES[cat]) {
    return cat;
  }
  
  // Default fallback
  return 'default';
}





