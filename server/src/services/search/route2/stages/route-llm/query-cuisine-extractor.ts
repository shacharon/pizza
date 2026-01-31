/**
 * Query Cuisine Extractor
 * 
 * Deterministically extracts cuisineKey from user query
 * Language-independent pattern matching
 */

import type { CuisineKey } from '../../shared/cuisine-tokens.js';

/**
 * Pattern matchers for each cuisine
 * Supports multiple languages (he, en, ru, ar, fr, es)
 */
const CUISINE_PATTERNS: Record<CuisineKey, RegExp[]> = {
  italian: [
    /איטלק/i,    // Hebrew
    /italian/i,   // English
    /итальян/i,   // Russian
    /italia/i,    // French/Spanish
    /italien/i    // French: "italien/italienne"
  ],
  japanese: [
    /יפנ/i,       // Hebrew
    /japan/i,     // English
    /японск/i,    // Russian
    /japon/i      // French/Spanish
  ],
  chinese: [
    /סינ/i,       // Hebrew
    /chines/i,    // English
    /китайск/i,   // Russian
    /chin/i       // French/Spanish
  ],
  thai: [
    /תאילנד/i,    // Hebrew
    /thai/i,      // English
    /тайск/i,     // Russian
    /tailand/i    // French/Spanish
  ],
  indian: [
    /הוד/i,       // Hebrew
    /india/i,     // English
    /индийск/i,   // Russian
    /indi/i       // French/Spanish
  ],
  mexican: [
    /מקסיק/i,     // Hebrew
    /mexican/i,   // English
    /мексиканск/i, // Russian
    /mexic/i      // French/Spanish
  ],
  french: [
    /צרפת/i,      // Hebrew
    /french/i,    // English
    /французск/i, // Russian
    /fran[cç]/i   // French/Spanish
  ],
  mediterranean: [
    /ים תיכונ/i,  // Hebrew
    /mediterr/i,  // English
    /средиземном/i, // Russian
    /mediterr/i   // French/Spanish
  ],
  middle_eastern: [
    /מזרח תיכונ/i, // Hebrew
    /middle.?east/i, // English
    /ближневосточн/i, // Russian
    /moyen.?orient/i // French
  ],
  american: [
    /אמריק/i,     // Hebrew
    /american/i,  // English
    /американск/i, // Russian
    /americ/i     // French/Spanish
  ],
  asian: [
    /אסיאת/i,     // Hebrew
    /asian/i,     // English
    /азиатск/i,   // Russian
    /asiat/i      // French/Spanish
  ],
  seafood: [
    /דגים/i,      // Hebrew
    /seafood|fish/i, // English
    /морепродукт/i, // Russian
    /fruit.?de.?mer/i // French
  ],
  steakhouse: [
    /סטייק/i,     // Hebrew
    /steak/i,     // English
    /стейк/i,     // Russian
    /bistec/i     // Spanish
  ],
  pizza: [
    /פיצ/i,       // Hebrew
    /pizza/i,     // English/Universal
    /пицц/i       // Russian
  ],
  sushi: [
    /סוש/i,       // Hebrew
    /sushi/i,     // English/Universal
    /суши/i       // Russian
  ],
  burger: [
    /המבורגר|בורגר/i, // Hebrew
    /burger|hamburger/i, // English
    /бургер/i,    // Russian
    /hambur/i     // French/Spanish
  ],
  vegan: [
    /טבעונ/i,     // Hebrew
    /vegan/i,     // English
    /веганск/i,   // Russian
    /vegan/i      // French/Spanish
  ],
  vegetarian: [
    /צמחונ/i,     // Hebrew
    /vegetarian/i, // English
    /вегетариан/i, // Russian
    /vegetari/i   // French/Spanish
  ],
  kosher: [
    /כשר/i,       // Hebrew
    /kosher/i,    // English
    /кошерн/i,    // Russian
    /casher/i     // French
  ],
  dairy: [
    /חלב/i,       // Hebrew
    /dairy|milk/i, // English
    /молочн/i,    // Russian
    /lait/i       // French
  ],
  meat: [
    /בשר/i,       // Hebrew
    /meat/i,      // English
    /мясн/i,      // Russian
    /viande|carne/i // French/Spanish
  ],
  fish: [
    /דגים|דג/i,   // Hebrew
    /fish/i,      // English
    /рыб/i,       // Russian
    /poisson|pescado/i // French/Spanish
  ],
  breakfast: [
    /ארוחת בוקר/i, // Hebrew
    /breakfast/i, // English
    /завтрак/i,   // Russian
    /petit.?d[ée]j|desayun/i // French/Spanish
  ],
  cafe: [
    /קפה|בית קפה/i, // Hebrew
    /caf[eé]/i,   // English/French/Spanish
    /кафе/i       // Russian
  ],
  bakery: [
    /מאפי/i,      // Hebrew
    /bak/i,       // English
    /пекарн/i,    // Russian
    /boulang|panad/i // French/Spanish
  ],
  dessert: [
    /קינוח/i,     // Hebrew
    /dessert/i,   // English
    /десерт/i,    // Russian
    /dessert|postre/i // French/Spanish
  ],
  fast_food: [
    /מזון מהיר/i,  // Hebrew
    /fast.?food/i, // English
    /фаст.?фуд/i, // Russian
    /comida.?r[aá]pida/i // Spanish
  ],
  fine_dining: [
    /גורמה/i,     // Hebrew
    /fine.?din|gourmet/i, // English
    /изысканн/i,  // Russian
    /gastronom/i  // French/Spanish
  ],
  casual_dining: [
    /מזדמן/i,     // Hebrew
    /casual/i,    // English
    /повседневн/i, // Russian
    /d[ée]contract/i // French/Spanish
  ]
};

/**
 * Extract cuisineKey from query (deterministic, language-independent)
 * Returns cuisineKey if pattern matches, null otherwise
 */
export function extractCuisineKeyFromQuery(query: string): CuisineKey | null {
  const normalizedQuery = query.toLowerCase();

  // Try to match each cuisine pattern
  for (const [cuisineKey, patterns] of Object.entries(CUISINE_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuery)) {
        return cuisineKey as CuisineKey;
      }
    }
  }

  return null; // No cuisine detected
}

/**
 * Extract typeKey from query (for non-cuisine searches)
 */
export function extractTypeKeyFromQuery(query: string): string | null {
  const normalizedQuery = query.toLowerCase();

  const typePatterns: Record<string, RegExp[]> = {
    'restaurant': [/מסעד/i, /restaurant/i, /ресторан/i],
    'cafe': [/קפה|בית קפה/i, /caf[eé]/i, /кафе/i],
    'bar': [/בר/i, /bar|pub/i, /бар/i],
    'bakery': [/מאפי/i, /bak/i, /пекарн/i],
    'fast_food': [/מזון מהיר/i, /fast.?food/i, /фаст.?фуд/i]
  };

  for (const [typeKey, patterns] of Object.entries(typePatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedQuery)) {
        return typeKey;
      }
    }
  }

  return null;
}
