/**
 * Gate2 Service
 * 
 * Standalone deterministic pre-filter stage
 * Target: <50ms latency, ZERO LLM usage
 * 
 * Validates input and performs basic language/region detection
 */

import { logger } from '../../../lib/logger/structured-logger.js';
import { LanguageDetector } from '../utils/language-detector.js';

/**
 * Gate2 Result
 */
export interface Gate2Result {
  passed: boolean;
  language: string | "unknown";
  region: string | "unknown";
  reason: "valid" | "empty_text" | "non_food_query";
}

/**
 * Food keywords in multiple languages for basic heuristics
 */
const FOOD_KEYWORDS = {
  en: ['pizza', 'burger', 'sushi', 'restaurant', 'food', 'eat', 'dining', 'cafe', 'bar', 'grill', 'kitchen', 'bistro', 'deli', 'bakery', 'pastry', 'coffee', 'tea', 'lunch', 'dinner', 'breakfast', 'brunch', 'steak', 'chicken', 'fish', 'seafood', 'vegan', 'vegetarian', 'gluten', 'kosher', 'halal', 'noodle', 'pasta', 'sandwich', 'salad', 'soup', 'dessert', 'ice cream', 'taco', 'burrito', 'ramen', 'pho', 'curry', 'bbq', 'barbecue', 'wings', 'fries', 'shawarma', 'falafel', 'hummus'],
  he: ['פיצה', 'המבורגר', 'סושי', 'מסעדה', 'אוכל', 'לאכול', 'ארוחה', 'בית קפה', 'בר', 'גריל', 'מטבח', 'ביסטרו', 'דלי', 'מאפייה', 'קפה', 'תה', 'צהריים', 'ערב', 'בוקר', 'בראנץ', 'סטייק', 'עוף', 'דג', 'ים', 'טבעוני', 'צמחוני', 'גלוטן', 'כשר', 'חלאל', 'אטריות', 'פסטה', 'כריך', 'סלט', 'מרק', 'קינוח', 'גלידה', 'טאקו', 'בוריטו', 'ראמן', 'פו', 'קארי', 'שווארמה', 'פלאפל', 'חומוס', 'שניצל', 'קבב', 'לאפה', 'פיתה'],
  ar: ['بيتزا', 'برغر', 'سوشي', 'مطعم', 'طعام', 'أكل', 'مقهى', 'كافيه', 'مشوي', 'مطبخ', 'حلويات', 'قهوة', 'شاي', 'غداء', 'عشاء', 'فطور', 'ستيك', 'دجاج', 'سمك', 'نباتي', 'حلال', 'كوشر', 'معكرونة', 'سندويش', 'سلطة', 'شوربة', 'آيس كريم', 'تاكو', 'كاري', 'شاورما', 'فلافل', 'حمص'],
  fr: ['pizza', 'burger', 'sushi', 'restaurant', 'nourriture', 'manger', 'café', 'bar', 'grill', 'cuisine', 'bistro', 'boulangerie', 'pâtisserie', 'déjeuner', 'dîner', 'petit-déjeuner', 'steak', 'poulet', 'poisson', 'végétarien', 'végétalien', 'pâtes', 'sandwich', 'salade', 'soupe', 'dessert', 'glace', 'taco', 'curry', 'kebab', 'falafel'],
  es: ['pizza', 'hamburguesa', 'sushi', 'restaurante', 'comida', 'comer', 'café', 'bar', 'parrilla', 'cocina', 'bistró', 'panadería', 'pastelería', 'almuerzo', 'cena', 'desayuno', 'bistec', 'pollo', 'pescado', 'vegetariano', 'vegano', 'pasta', 'sándwich', 'ensalada', 'sopa', 'postre', 'helado', 'taco', 'burrito', 'curry', 'kebab', 'falafel'],
  de: ['pizza', 'burger', 'sushi', 'restaurant', 'essen', 'café', 'bar', 'grill', 'küche', 'bistro', 'bäckerei', 'konditorei', 'mittagessen', 'abendessen', 'frühstück', 'steak', 'hähnchen', 'fisch', 'vegetarisch', 'vegan', 'pasta', 'sandwich', 'salat', 'suppe', 'dessert', 'eis', 'taco', 'curry', 'kebab', 'falafel'],
  ru: ['пицца', 'бургер', 'суши', 'ресторан', 'еда', 'кафе', 'бар', 'гриль', 'кухня', 'бистро', 'пекарня', 'обед', 'ужин', 'завтрак', 'стейк', 'курица', 'рыба', 'вегетарианский', 'веган', 'паста', 'сандвич', 'салат', 'суп', 'десерт', 'мороженое', 'тако', 'карри', 'кебаб', 'фалафель']
};

/**
 * Check if text contains food-related keywords
 * @param text - Input text (normalized to lowercase)
 * @returns true if food-related
 */
function isFoodRelated(text: string): boolean {
  const normalized = text.toLowerCase();
  
  // Check all language keyword sets
  for (const keywords of Object.values(FOOD_KEYWORDS)) {
    for (const keyword of keywords) {
      if (normalized.includes(keyword.toLowerCase())) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Execute Gate2 pre-filter
 * 
 * DETERMINISTIC ONLY - no LLM, no prompts, no JSON schemas
 * Target latency: <50ms
 * 
 * @param rawText - User input text
 * @returns Gate2Result with passed status, language, region, and reason
 */
export function executeGate2(rawText: string): Gate2Result {
  const startTime = Date.now();
  
  // Log start
  logger.info({
    stage: 'gate2',
    event: 'started',
    rawText: rawText?.substring(0, 100) // Truncate for logging
  }, '[Gate2] Started');
  
  try {
    // Validate input - empty or whitespace only
    if (!rawText || rawText.trim().length === 0) {
      const result: Gate2Result = {
        passed: false,
        language: 'unknown',
        region: 'unknown',
        reason: 'empty_text'
      };
      
      const durationMs = Date.now() - startTime;
      logger.info({
        stage: 'gate2',
        event: 'completed',
        durationMs,
        result
      }, '[Gate2] Completed');
      
      return result;
    }
    
    // Detect language using existing LanguageDetector
    const detectedLang = LanguageDetector.detect(rawText);
    const language = detectedLang || 'unknown';
    
    // Region determination: always "unknown" (deterministic, no guessing without coords)
    const region = 'unknown';
    
    // Food-related heuristic check
    const foodRelated = isFoodRelated(rawText);
    
    const result: Gate2Result = {
      passed: foodRelated,
      language,
      region,
      reason: foodRelated ? 'valid' : 'non_food_query'
    };
    
    const durationMs = Date.now() - startTime;
    
    // Log completion
    logger.info({
      stage: 'gate2',
      event: 'completed',
      durationMs,
      result
    }, '[Gate2] Completed');
    
    return result;
    
  } catch (error) {
    const durationMs = Date.now() - startTime;
    
    logger.error({
      stage: 'gate2',
      event: 'failed',
      durationMs,
      error: error instanceof Error ? error.message : 'unknown'
    }, '[Gate2] Failed');
    
    // On error, fail safe: don't pass
    return {
      passed: false,
      language: 'unknown',
      region: 'unknown',
      reason: 'empty_text'
    };
  }
}
