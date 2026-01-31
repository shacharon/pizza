/**
 * Landmark Normalizer - Language-Independent Landmark Resolution
 * 
 * Maps multilingual landmark names to canonical landmarkIds
 * Ensures same landmark in different languages → same ID → cache sharing
 */

/**
 * Canonical landmark entry
 */
export interface CanonicalLandmark {
  /** Unique canonical ID (stable, never changes) */
  landmarkId: string;
  
  /** Primary name (English, for geocoding fallback) */
  primaryName: string;
  
  /** Multilingual aliases */
  aliases: {
    he?: string[];
    en?: string[];
    ru?: string[];
    ar?: string[];
    fr?: string[];
    es?: string[];
  };
  
  /** Expected region (for geocoding disambiguation) */
  region?: string;
  
  /** Known coordinates (optional, for cache warmup) */
  knownLatLng?: { lat: number; lng: number };
}

/**
 * Famous landmarks registry (expandable)
 * START with most common Israeli + international landmarks
 */
export const LANDMARK_REGISTRY: CanonicalLandmark[] = [
  // Tel Aviv
  {
    landmarkId: 'dizengoff-center-tlv',
    primaryName: 'Dizengoff Center Tel Aviv',
    aliases: {
      he: ['דיזנגוף סנטר', 'מרכז דיזנגוף', 'דיזנגוף מרכז'],
      en: ['Dizengoff Center', 'Dizengoff Mall', 'Dizengoff Shopping Center'],
      ru: ['Дизенгоф центр', 'Дизенгофф центр']
    },
    region: 'IL',
    knownLatLng: { lat: 32.0853, lng: 34.7818 }
  },
  {
    landmarkId: 'azrieli-center-tlv',
    primaryName: 'Azrieli Center Tel Aviv',
    aliases: {
      he: ['עזריאלי', 'מרכז עזריאלי', 'מגדלי עזריאלי', 'אזריאלי'],
      en: ['Azrieli Center', 'Azrieli Towers', 'Azrieli Mall'],
      ru: ['Азриэли', 'Центр Азриэли']
    },
    region: 'IL',
    knownLatLng: { lat: 32.0744, lng: 34.7925 }
  },
  {
    landmarkId: 'sarona-market-tlv',
    primaryName: 'Sarona Market Tel Aviv',
    aliases: {
      he: ['שרונה', 'שוק שרונה', 'סרונה'],
      en: ['Sarona Market', 'Sarona Complex', 'Sarona'],
      ru: ['Сарона', 'Рынок Сарона']
    },
    region: 'IL',
    knownLatLng: { lat: 32.0719, lng: 34.7871 }
  },
  {
    landmarkId: 'tlv-port',
    primaryName: 'Tel Aviv Port',
    aliases: {
      he: ['נמל תל אביב', 'הנמל', 'נמל יפו', 'נמל'],
      en: ['Tel Aviv Port', 'TLV Port', 'Namal Tel Aviv'],
      ru: ['Порт Тель-Авива', 'Намаль']
    },
    region: 'IL',
    knownLatLng: { lat: 32.1068, lng: 34.7974 }
  },
  
  // Jerusalem
  {
    landmarkId: 'mamilla-mall-jlm',
    primaryName: 'Mamilla Mall Jerusalem',
    aliases: {
      he: ['ממילא', 'מרכז ממילא', 'קניון ממילא'],
      en: ['Mamilla Mall', 'Mamilla Center', 'Alrov Mamilla'],
      ru: ['Мамила', 'Мамилла']
    },
    region: 'IL',
    knownLatLng: { lat: 31.7767, lng: 35.2259 }
  },
  {
    landmarkId: 'machane-yehuda-jlm',
    primaryName: 'Mahane Yehuda Market Jerusalem',
    aliases: {
      he: ['מחנה יהודה', 'שוק מחנה יהודה', 'השוק'],
      en: ['Mahane Yehuda', 'Machane Yehuda Market', 'The Shuk'],
      ru: ['Махане Иегуда', 'Рынок Махане Иегуда']
    },
    region: 'IL',
    knownLatLng: { lat: 31.7858, lng: 35.2125 }
  },
  
  // Herzliya
  {
    landmarkId: 'marina-herzliya',
    primaryName: 'Marina Herzliya',
    aliases: {
      he: ['מרינה הרצליה', 'הרצליה מרינה', 'מרינה'],
      en: ['Herzliya Marina', 'Marina Herzliya'],
      ru: ['Марина Герцлия', 'Марина Херцлия']
    },
    region: 'IL',
    knownLatLng: { lat: 32.1656, lng: 34.8058 }
  },
  
  // International - Paris
  {
    landmarkId: 'eiffel-tower-paris',
    primaryName: 'Eiffel Tower',
    aliases: {
      he: ['מגדל אייפל', 'אייפל'],
      en: ['Eiffel Tower', 'Tour Eiffel', 'La Tour Eiffel'],
      fr: ['Tour Eiffel', 'La Tour Eiffel'],
      ru: ['Эйфелева башня', 'Башня Эйфеля'],
      ar: ['برج إيفل']
    },
    region: 'FR',
    knownLatLng: { lat: 48.8584, lng: 2.2945 }
  },
  {
    landmarkId: 'louvre-paris',
    primaryName: 'Louvre Museum',
    aliases: {
      he: ['הלובר', 'מוזיאון הלובר'],
      en: ['Louvre', 'Louvre Museum', 'The Louvre'],
      fr: ['Musée du Louvre', 'Le Louvre'],
      ru: ['Лувр', 'Музей Лувра'],
      ar: ['متحف اللوفر']
    },
    region: 'FR',
    knownLatLng: { lat: 48.8606, lng: 2.3376 }
  },
  {
    landmarkId: 'arc-triomphe-paris',
    primaryName: 'Arc de Triomphe',
    aliases: {
      he: ['שער הניצחון', 'קשת הניצחון'],
      en: ['Arc de Triomphe', 'Triumphal Arch'],
      fr: ['Arc de Triomphe'],
      ru: ['Триумфальная арка'],
      ar: ['قوس النصر']
    },
    region: 'FR',
    knownLatLng: { lat: 48.8738, lng: 2.2950 }
  },
  
  // International - New York
  {
    landmarkId: 'times-square-nyc',
    primaryName: 'Times Square',
    aliases: {
      he: ['טיימס סקוור', 'כיכר טיימס'],
      en: ['Times Square', 'Times Sq'],
      ru: ['Таймс-сквер', 'Таймс сквер'],
      ar: ['تايمز سكوير']
    },
    region: 'US',
    knownLatLng: { lat: 40.7580, lng: -73.9855 }
  },
  {
    landmarkId: 'central-park-nyc',
    primaryName: 'Central Park',
    aliases: {
      he: ['סנטרל פארק', 'הפארק המרכזי'],
      en: ['Central Park', 'Central Park NYC'],
      ru: ['Центральный парк'],
      ar: ['سنترال بارك']
    },
    region: 'US',
    knownLatLng: { lat: 40.7829, lng: -73.9654 }
  },
  
  // International - London
  {
    landmarkId: 'big-ben-london',
    primaryName: 'Big Ben',
    aliases: {
      he: ['ביג בן', 'המגדל הגדול'],
      en: ['Big Ben', 'Elizabeth Tower'],
      ru: ['Биг-Бен', 'Биг Бен'],
      ar: ['بيج بن']
    },
    region: 'GB',
    knownLatLng: { lat: 51.5007, lng: -0.1246 }
  },
  {
    landmarkId: 'tower-bridge-london',
    primaryName: 'Tower Bridge',
    aliases: {
      he: ['טאוור ברידג', 'גשר המגדל'],
      en: ['Tower Bridge', 'London Bridge'],
      ru: ['Тауэрский мост'],
      ar: ['جسر البرج']
    },
    region: 'GB',
    knownLatLng: { lat: 51.5055, lng: -0.0754 }
  }
];

/**
 * Normalize landmark text to canonical landmarkId
 * Returns landmarkId + primaryName if matched, null otherwise
 */
export function normalizeLandmark(
  geocodeQuery: string,
  region?: string
): { landmarkId: string; primaryName: string; knownLatLng?: { lat: number; lng: number } } | null {
  const normalized = geocodeQuery.toLowerCase().trim();
  
  // Try to match against registry
  for (const landmark of LANDMARK_REGISTRY) {
    // Prefer landmarks in same region
    if (region && landmark.region && landmark.region !== region) {
      continue;
    }
    
    // Check all aliases
    for (const [lang, aliases] of Object.entries(landmark.aliases)) {
      for (const alias of aliases) {
        if (normalized.includes(alias.toLowerCase())) {
          return {
            landmarkId: landmark.landmarkId,
            primaryName: landmark.primaryName,
            knownLatLng: landmark.knownLatLng
          };
        }
      }
    }
    
    // Check primary name
    if (normalized.includes(landmark.primaryName.toLowerCase())) {
      return {
        landmarkId: landmark.landmarkId,
        primaryName: landmark.primaryName,
        knownLatLng: landmark.knownLatLng
      };
    }
  }
  
  // If no match in registry, fall back to region-first search
  if (!region) {
    return null;
  }
  
  // Try again without region restriction
  for (const landmark of LANDMARK_REGISTRY) {
    // Check all aliases
    for (const [lang, aliases] of Object.entries(landmark.aliases)) {
      for (const alias of aliases) {
        if (normalized.includes(alias.toLowerCase())) {
          return {
            landmarkId: landmark.landmarkId,
            primaryName: landmark.primaryName,
            knownLatLng: landmark.knownLatLng
          };
        }
      }
    }
  }
  
  return null;
}

/**
 * Create a normalized cache key for landmark resolution
 * Uses normalized text + region to enable cache sharing across languages
 */
export function createLandmarkResolutionCacheKey(
  geocodeQuery: string,
  region?: string
): string {
  // Try to get canonical landmark
  const canonical = normalizeLandmark(geocodeQuery, region);
  
  if (canonical) {
    // Use landmarkId as cache key (perfect cache sharing)
    return `landmark:${canonical.landmarkId}`;
  }
  
  // Fallback: normalize text for cache key
  const normalized = geocodeQuery
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, '_')    // Replace spaces with underscore
    .substring(0, 50);        // Limit length
  
  return `landmark:${normalized}:${region || 'unknown'}`;
}

/**
 * Create a cache key for landmark search (after resolution)
 * Uses landmarkId + cuisineKey for perfect cache sharing
 */
export function createLandmarkSearchCacheKey(
  landmarkId: string,
  radius: number,
  cuisineKey?: string,
  typeKey?: string,
  regionCode?: string
): string {
  const category = cuisineKey || typeKey || 'restaurant';
  return `landmark_search:${landmarkId}:${radius}:${category}:${regionCode || 'unknown'}`;
}
