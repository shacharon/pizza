/**
 * Cuisine Tokens - Canonical Cuisine Model
 * 
 * Provides stable, language-independent cuisine identifiers to prevent
 * language leakage in TEXTSEARCH mapper and cuisine enforcement.
 * 
 * INVARIANTS:
 * 1. cuisineKey is the canonical internal identifier (never changes)
 * 2. Search terms derived from cuisineKey + searchLanguage (not query language)
 * 3. Same cuisine intent → same cuisineKey → same requiredTerms → stable enforcement
 */

/**
 * Canonical cuisine categories (internal keys)
 * These are stable, language-independent identifiers
 */
export type CuisineKey =
  | 'italian'
  | 'asian'
  | 'japanese'
  | 'chinese'
  | 'thai'
  | 'indian'
  | 'mediterranean'
  | 'middle_eastern'
  | 'american'
  | 'mexican'
  | 'french'
  | 'seafood'
  | 'steakhouse'
  | 'pizza'
  | 'sushi'
  | 'burger'
  | 'vegan'
  | 'vegetarian'
  | 'kosher'
  | 'dairy'
  | 'meat'
  | 'fish'
  | 'breakfast'
  | 'cafe'
  | 'bakery'
  | 'dessert'
  | 'fast_food'
  | 'fine_dining'
  | 'casual_dining';

/**
 * Cuisine token with multilingual labels
 */
export interface CuisineToken {
  /** Canonical key (internal) */
  cuisineKey: CuisineKey;
  
  /** Display names for UI (optional, not used for search) */
  displayNames?: {
    he?: string;
    en?: string;
  };
  
  /** Search terms for each language (used in requiredTerms/preferredTerms) */
  searchTerms: {
    he: string[];
    en: string[];
  };
  
  /** Restaurant type label for textQuery generation */
  restaurantLabel: {
    he: string;
    en: string;
  };
  
  /** Related/preferred terms for relaxation */
  preferredTerms?: {
    he: string[];
    en: string[];
  };
}

/**
 * Cuisine Registry - Maps canonical keys to multilingual tokens
 * 
 * CRITICAL: This is the single source of truth for cuisine-to-terms mapping
 * NEVER derive terms from user query language - always use this registry + searchLanguage
 */
export const CUISINE_REGISTRY: Record<CuisineKey, CuisineToken> = {
  italian: {
    cuisineKey: 'italian',
    displayNames: { he: 'איטלקית', en: 'Italian' },
    searchTerms: {
      he: ['איטלקית', 'איטלקי'],
      en: ['italian', 'Italy']
    },
    restaurantLabel: {
      he: 'מסעדה איטלקית',
      en: 'Italian restaurant'
    },
    preferredTerms: {
      he: ['פסטה', 'פיצה', 'ריזוטו'],
      en: ['pasta', 'pizza', 'risotto']
    }
  },
  
  asian: {
    cuisineKey: 'asian',
    displayNames: { he: 'אסייתית', en: 'Asian' },
    searchTerms: {
      he: ['אסייתית', 'אסיה'],
      en: ['asian', 'Asia']
    },
    restaurantLabel: {
      he: 'מסעדה אסייתית',
      en: 'Asian restaurant'
    },
    preferredTerms: {
      he: ['סיני', 'תאילנדי', 'יפני'],
      en: ['Chinese', 'Thai', 'Japanese']
    }
  },
  
  japanese: {
    cuisineKey: 'japanese',
    displayNames: { he: 'יפנית', en: 'Japanese' },
    searchTerms: {
      he: ['יפנית', 'יפני'],
      en: ['japanese', 'Japan']
    },
    restaurantLabel: {
      he: 'מסעדה יפנית',
      en: 'Japanese restaurant'
    },
    preferredTerms: {
      he: ['סושי', 'ראמן', 'טמפורה'],
      en: ['sushi', 'ramen', 'tempura']
    }
  },
  
  chinese: {
    cuisineKey: 'chinese',
    displayNames: { he: 'סינית', en: 'Chinese' },
    searchTerms: {
      he: ['סינית', 'סיני'],
      en: ['chinese', 'China']
    },
    restaurantLabel: {
      he: 'מסעדה סינית',
      en: 'Chinese restaurant'
    },
    preferredTerms: {
      he: ['דים סאם', 'נודלס'],
      en: ['dim sum', 'noodles']
    }
  },
  
  thai: {
    cuisineKey: 'thai',
    displayNames: { he: 'תאילנדית', en: 'Thai' },
    searchTerms: {
      he: ['תאילנדית', 'תאילנדי'],
      en: ['thai', 'Thailand']
    },
    restaurantLabel: {
      he: 'מסעדה תאילנדית',
      en: 'Thai restaurant'
    },
    preferredTerms: {
      he: ['פאד תאי', 'קארי'],
      en: ['pad thai', 'curry']
    }
  },
  
  indian: {
    cuisineKey: 'indian',
    displayNames: { he: 'הודית', en: 'Indian' },
    searchTerms: {
      he: ['הודית', 'הודי'],
      en: ['indian', 'India']
    },
    restaurantLabel: {
      he: 'מסעדה הודית',
      en: 'Indian restaurant'
    },
    preferredTerms: {
      he: ['קארי', 'טנדורי', 'נאן'],
      en: ['curry', 'tandoori', 'naan']
    }
  },
  
  mediterranean: {
    cuisineKey: 'mediterranean',
    displayNames: { he: 'ים תיכונית', en: 'Mediterranean' },
    searchTerms: {
      he: ['ים תיכונית', 'ים תיכוני'],
      en: ['mediterranean', 'Med']
    },
    restaurantLabel: {
      he: 'מסעדה ים תיכונית',
      en: 'Mediterranean restaurant'
    },
    preferredTerms: {
      he: ['חומוס', 'פלאפל', 'שקשוקה'],
      en: ['hummus', 'falafel', 'shakshuka']
    }
  },
  
  middle_eastern: {
    cuisineKey: 'middle_eastern',
    displayNames: { he: 'מזרח תיכונית', en: 'Middle Eastern' },
    searchTerms: {
      he: ['מזרח תיכונית', 'מזרחי'],
      en: ['middle eastern', 'Middle East']
    },
    restaurantLabel: {
      he: 'מסעדה מזרח תיכונית',
      en: 'Middle Eastern restaurant'
    },
    preferredTerms: {
      he: ['חומוס', 'פלאפל', 'שווארמה'],
      en: ['hummus', 'falafel', 'shawarma']
    }
  },
  
  american: {
    cuisineKey: 'american',
    displayNames: { he: 'אמריקאית', en: 'American' },
    searchTerms: {
      he: ['אמריקאית', 'אמריקאי'],
      en: ['american', 'USA']
    },
    restaurantLabel: {
      he: 'מסעדה אמריקאית',
      en: 'American restaurant'
    },
    preferredTerms: {
      he: ['המבורגר', 'סטייק', 'צ\'יפס'],
      en: ['burger', 'steak', 'fries']
    }
  },
  
  mexican: {
    cuisineKey: 'mexican',
    displayNames: { he: 'מקסיקנית', en: 'Mexican' },
    searchTerms: {
      he: ['מקסיקנית', 'מקסיקני'],
      en: ['mexican', 'Mexico']
    },
    restaurantLabel: {
      he: 'מסעדה מקסיקנית',
      en: 'Mexican restaurant'
    },
    preferredTerms: {
      he: ['טאקו', 'בוריטו', 'נאצ\'וס'],
      en: ['taco', 'burrito', 'nachos']
    }
  },
  
  french: {
    cuisineKey: 'french',
    displayNames: { he: 'צרפתית', en: 'French' },
    searchTerms: {
      he: ['צרפתית', 'צרפתי'],
      en: ['french', 'France']
    },
    restaurantLabel: {
      he: 'מסעדה צרפתית',
      en: 'French restaurant'
    },
    preferredTerms: {
      he: ['קרואסון', 'אסקרגו', 'קוק או ויין'],
      en: ['croissant', 'escargot', 'coq au vin']
    }
  },
  
  seafood: {
    cuisineKey: 'seafood',
    displayNames: { he: 'פירות ים', en: 'Seafood' },
    searchTerms: {
      he: ['פירות ים', 'דגים', 'דג'],
      en: ['seafood', 'fish']
    },
    restaurantLabel: {
      he: 'מסעדת דגים',
      en: 'Seafood restaurant'
    },
    preferredTerms: {
      he: ['סלמון', 'דניס', 'סי בס'],
      en: ['salmon', 'sea bass', 'tuna']
    }
  },
  
  steakhouse: {
    cuisineKey: 'steakhouse',
    displayNames: { he: 'בשרים', en: 'Steakhouse' },
    searchTerms: {
      he: ['בשרים', 'בשר', 'סטייק'],
      en: ['steakhouse', 'steak', 'meat']
    },
    restaurantLabel: {
      he: 'מסעדת בשרים',
      en: 'Steakhouse'
    },
    preferredTerms: {
      he: ['אנטריקוט', 'פילה', 'אסאדו'],
      en: ['ribeye', 'filet', 'T-bone']
    }
  },
  
  pizza: {
    cuisineKey: 'pizza',
    displayNames: { he: 'פיצה', en: 'Pizza' },
    searchTerms: {
      he: ['פיצה', 'פיצריה'],
      en: ['pizza', 'pizzeria']
    },
    restaurantLabel: {
      he: 'פיצריה',
      en: 'Pizzeria'
    },
    preferredTerms: {
      he: ['מרגריטה', 'פפרוני'],
      en: ['margherita', 'pepperoni']
    }
  },
  
  sushi: {
    cuisineKey: 'sushi',
    displayNames: { he: 'סושי', en: 'Sushi' },
    searchTerms: {
      he: ['סושי'],
      en: ['sushi']
    },
    restaurantLabel: {
      he: 'סושי בר',
      en: 'Sushi bar'
    },
    preferredTerms: {
      he: ['סשימי', 'מאקי', 'נוריטו'],
      en: ['sashimi', 'maki', 'roll']
    }
  },
  
  burger: {
    cuisineKey: 'burger',
    displayNames: { he: 'המבורגר', en: 'Burger' },
    searchTerms: {
      he: ['המבורגר', 'בורגר'],
      en: ['burger', 'hamburger']
    },
    restaurantLabel: {
      he: 'המבורגריה',
      en: 'Burger joint'
    },
    preferredTerms: {
      he: ['צ\'יזבורגר', 'צ\'יפס'],
      en: ['cheeseburger', 'fries']
    }
  },
  
  vegan: {
    cuisineKey: 'vegan',
    displayNames: { he: 'טבעוני', en: 'Vegan' },
    searchTerms: {
      he: ['טבעוני', 'טבעונית'],
      en: ['vegan', 'plant-based']
    },
    restaurantLabel: {
      he: 'מסעדה טבעונית',
      en: 'Vegan restaurant'
    },
    preferredTerms: {
      he: ['סייטן', 'טופו', 'צמחוני'],
      en: ['seitan', 'tofu', 'plant-based']
    }
  },
  
  vegetarian: {
    cuisineKey: 'vegetarian',
    displayNames: { he: 'צמחוני', en: 'Vegetarian' },
    searchTerms: {
      he: ['צמחוני', 'צמחונית'],
      en: ['vegetarian', 'veggie']
    },
    restaurantLabel: {
      he: 'מסעדה צמחונית',
      en: 'Vegetarian restaurant'
    },
    preferredTerms: {
      he: ['סלט', 'פסטה', 'ירקות'],
      en: ['salad', 'pasta', 'vegetables']
    }
  },
  
  kosher: {
    cuisineKey: 'kosher',
    displayNames: { he: 'כשר', en: 'Kosher' },
    searchTerms: {
      he: ['כשר', 'כשרה'],
      en: ['kosher']
    },
    restaurantLabel: {
      he: 'מסעדה כשרה',
      en: 'Kosher restaurant'
    }
  },
  
  dairy: {
    cuisineKey: 'dairy',
    displayNames: { he: 'חלבי', en: 'Dairy' },
    searchTerms: {
      he: ['חלבי', 'חלבית'],
      en: ['dairy', 'milk']
    },
    restaurantLabel: {
      he: 'מסעדה חלבית',
      en: 'Dairy restaurant'
    },
    preferredTerms: {
      he: ['פיצה', 'פסטה', 'סלט'],
      en: ['pizza', 'pasta', 'salad']
    }
  },
  
  meat: {
    cuisineKey: 'meat',
    displayNames: { he: 'בשרי', en: 'Meat' },
    searchTerms: {
      he: ['בשרי', 'בשרית'],
      en: ['meat', 'carnivore']
    },
    restaurantLabel: {
      he: 'מסעדה בשרית',
      en: 'Meat restaurant'
    },
    preferredTerms: {
      he: ['סטייק', 'צלי', 'קבב'],
      en: ['steak', 'roast', 'kebab']
    }
  },
  
  fish: {
    cuisineKey: 'fish',
    displayNames: { he: 'דגים', en: 'Fish' },
    searchTerms: {
      he: ['דגים', 'דג'],
      en: ['fish', 'seafood']
    },
    restaurantLabel: {
      he: 'מסעדת דגים',
      en: 'Fish restaurant'
    },
    preferredTerms: {
      he: ['סלמון', 'דניס', 'לברק'],
      en: ['salmon', 'sea bream', 'sea bass']
    }
  },
  
  breakfast: {
    cuisineKey: 'breakfast',
    displayNames: { he: 'ארוחת בוקר', en: 'Breakfast' },
    searchTerms: {
      he: ['ארוחת בוקר', 'בוקר'],
      en: ['breakfast', 'brunch']
    },
    restaurantLabel: {
      he: 'ארוחת בוקר',
      en: 'Breakfast place'
    },
    preferredTerms: {
      he: ['שקשוקה', 'פנקייק', 'אומלט'],
      en: ['shakshuka', 'pancakes', 'omelet']
    }
  },
  
  cafe: {
    cuisineKey: 'cafe',
    displayNames: { he: 'בית קפה', en: 'Cafe' },
    searchTerms: {
      he: ['בית קפה', 'קפה'],
      en: ['cafe', 'coffee shop']
    },
    restaurantLabel: {
      he: 'בית קפה',
      en: 'Cafe'
    },
    preferredTerms: {
      he: ['קפה', 'עוגה', 'סנדוויץ'],
      en: ['coffee', 'cake', 'sandwich']
    }
  },
  
  bakery: {
    cuisineKey: 'bakery',
    displayNames: { he: 'מאפיה', en: 'Bakery' },
    searchTerms: {
      he: ['מאפיה', 'לחם'],
      en: ['bakery', 'bread']
    },
    restaurantLabel: {
      he: 'מאפיה',
      en: 'Bakery'
    },
    preferredTerms: {
      he: ['חלה', 'קרואסון', 'בורקס'],
      en: ['challah', 'croissant', 'pastry']
    }
  },
  
  dessert: {
    cuisineKey: 'dessert',
    displayNames: { he: 'קינוחים', en: 'Dessert' },
    searchTerms: {
      he: ['קינוחים', 'קינוח'],
      en: ['dessert', 'sweets']
    },
    restaurantLabel: {
      he: 'קינוחים',
      en: 'Dessert place'
    },
    preferredTerms: {
      he: ['עוגה', 'גלידה', 'טירמיסו'],
      en: ['cake', 'ice cream', 'tiramisu']
    }
  },
  
  fast_food: {
    cuisineKey: 'fast_food',
    displayNames: { he: 'מזון מהיר', en: 'Fast Food' },
    searchTerms: {
      he: ['מזון מהיר', 'פאסט פוד'],
      en: ['fast food', 'quick service']
    },
    restaurantLabel: {
      he: 'מזון מהיר',
      en: 'Fast food'
    },
    preferredTerms: {
      he: ['המבורגר', 'פיצה', 'צ\'יפס'],
      en: ['burger', 'pizza', 'fries']
    }
  },
  
  fine_dining: {
    cuisineKey: 'fine_dining',
    displayNames: { he: 'גורמה', en: 'Fine Dining' },
    searchTerms: {
      he: ['גורמה', 'יוקרתי'],
      en: ['fine dining', 'gourmet', 'upscale']
    },
    restaurantLabel: {
      he: 'מסעדה יוקרתית',
      en: 'Fine dining restaurant'
    },
    preferredTerms: {
      he: ['שף', 'מעולה'],
      en: ['chef', 'haute cuisine']
    }
  },
  
  casual_dining: {
    cuisineKey: 'casual_dining',
    displayNames: { he: 'מזדמן', en: 'Casual Dining' },
    searchTerms: {
      he: ['מזדמן', 'נינוח'],
      en: ['casual', 'relaxed']
    },
    restaurantLabel: {
      he: 'מסעדה נינוחה',
      en: 'Casual restaurant'
    }
  }
};

/**
 * Get cuisine token by canonical key
 */
export function getCuisineToken(cuisineKey: CuisineKey): CuisineToken {
  return CUISINE_REGISTRY[cuisineKey];
}

/**
 * Get search terms for a cuisine in specified language
 * CRITICAL: Always use this function + searchLanguage (never query language)
 */
export function getCuisineSearchTerms(
  cuisineKey: CuisineKey,
  searchLanguage: 'he' | 'en'
): string[] {
  const token = CUISINE_REGISTRY[cuisineKey];
  return token.searchTerms[searchLanguage];
}

/**
 * Get preferred terms for a cuisine in specified language
 * Used for cuisine enforcement relaxation
 */
export function getCuisinePreferredTerms(
  cuisineKey: CuisineKey,
  searchLanguage: 'he' | 'en'
): string[] {
  const token = CUISINE_REGISTRY[cuisineKey];
  return token.preferredTerms?.[searchLanguage] ?? [];
}

/**
 * Get restaurant label for textQuery generation
 * CRITICAL: Always use this function + searchLanguage (never query language)
 */
export function getCuisineRestaurantLabel(
  cuisineKey: CuisineKey,
  searchLanguage: 'he' | 'en'
): string {
  const token = CUISINE_REGISTRY[cuisineKey];
  return token.restaurantLabel[searchLanguage];
}

/**
 * Validate cuisine key
 */
export function isValidCuisineKey(key: string): key is CuisineKey {
  return key in CUISINE_REGISTRY;
}

/**
 * Get all cuisine keys (for LLM prompts, testing)
 */
export function getAllCuisineKeys(): CuisineKey[] {
  return Object.keys(CUISINE_REGISTRY) as CuisineKey[];
}
