/**
 * Fast Intent Path - Pattern-based intent parsing without LLM
 * Intent Performance Policy: Handles simple queries (cuisine + city) in <50ms
 */

import type { SessionContext } from '../types/search.types.js';
import type { PlacesIntent } from '../../places/intent/places-intent.schema.js';

export type FastIntentResult =
  | { ok: true; intent: PlacesIntent; confidence: number; reason: string }
  | { ok: false; reason: string };

/**
 * Common Israeli cities (Hebrew and English)
 */
const KNOWN_CITIES = new Set([
  // Hebrew
  'תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'אשקלון', 'אשדוד', 'רמת גן', 
  'גדרה', 'פתח תקווה', 'ראשון לציון', 'נתניה', 'חולון', 'בת ים',
  'רעננה', 'הרצליה', 'כפר סבא', 'רמת השרון', 'גבעתיים',
  // English
  'tel aviv', 'jerusalem', 'haifa', 'beer sheva', 'ashkelon', 'ashdod',
  'ramat gan', 'gedera', 'petah tikva', 'rishon lezion', 'netanya',
  'holon', 'bat yam', 'raanana', 'herzliya', 'kfar saba', 'ramat hasharon'
]);

/**
 * Common food/cuisine types (Hebrew and English)
 */
const KNOWN_CUISINES = new Set([
  // Hebrew
  'פיצה', 'המבורגר', 'סושי', 'סינית', 'יפנית', 'איטלקית', 'אסייתית',
  'הודית', 'תאילנדית', 'מקסיקנית', 'בשרים', 'דגים', 'מסעדה',
  // English
  'pizza', 'burger', 'sushi', 'chinese', 'japanese', 'italian', 'asian',
  'indian', 'thai', 'mexican', 'steakhouse', 'seafood', 'restaurant'
]);

/**
 * Complex intent markers that require LLM
 */
const COMPLEX_MARKERS = [
  // Time/status
  'פתוח', 'סגור', 'עכשיו', 'עד מאוחר', 'אחרי חצות', 'open', 'closed', 'now', 'late',
  // Vibe/occasion
  'רומנטי', 'דייט', 'משפחתי', 'romantic', 'date', 'family',
  // Constraints
  'חניה', 'כשר', 'טבעוני', 'ללא גלוטן', 'זול', 'יקר', 'שקט',
  'parking', 'kosher', 'vegan', 'gluten free', 'cheap', 'expensive', 'quiet',
  // Proximity (except basic 'in')
  'ליד', 'בקרבת', 'קרוב', 'near', 'close to', 'nearby'
];

/**
 * Try to parse simple queries without LLM
 * Pattern: [cuisine/food] + [in/ב] + [city]
 */
export function tryFastIntent(
  text: string,
  language: 'he' | 'en',
  context?: SessionContext
): FastIntentResult {
  const normalized = text.trim().toLowerCase();
  
  // Reject if has complex markers
  if (COMPLEX_MARKERS.some(marker => normalized.includes(marker.toLowerCase()))) {
    return { ok: false, reason: 'complex_markers_detected' };
  }
  
  // Extract city
  let city: string | undefined;
  for (const knownCity of KNOWN_CITIES) {
    if (normalized.includes(knownCity.toLowerCase())) {
      city = knownCity;
      break;
    }
  }
  
  if (!city) {
    return { ok: false, reason: 'no_known_city' };
  }
  
  // Extract cuisine/food
  let cuisine: string | undefined;
  for (const knownCuisine of KNOWN_CUISINES) {
    if (normalized.includes(knownCuisine.toLowerCase())) {
      cuisine = knownCuisine;
      break;
    }
  }
  
  if (!cuisine) {
    return { ok: false, reason: 'no_known_cuisine' };
  }
  
  // Success: simple pattern matched
  const intent: PlacesIntent = {
    intent: 'find_food',
    provider: 'google_places',
    search: {
      mode: 'textsearch',
      query: cuisine,
      target: {
        kind: 'city',
        city: city
      },
      filters: {
        language: language
      }
    },
    output: {
      fields: ['place_id', 'name', 'formatted_address', 'geometry', 
               'opening_hours', 'rating', 'user_ratings_total', 'price_level'],
      page_size: 10
    }
  };
  
  return {
    ok: true,
    intent,
    confidence: 0.85, // High confidence for pattern match
    reason: 'fast_path_cuisine_city'
  };
}

