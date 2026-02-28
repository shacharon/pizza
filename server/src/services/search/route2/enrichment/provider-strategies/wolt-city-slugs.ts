/**
 * Map from normalized city name to Wolt URL path city slug(s).
 * Used to require city match when selecting among top 5 Wolt results.
 */

function n(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9\u0590-\u05ff-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Normalize for lookup: Hebrew and Latin, no spaces for key. */
function key(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

const MAP: Map<string, string[]> = new Map();

function add(keys: string[], slugs: string[]): void {
  for (const k of keys) {
    MAP.set(key(k), slugs);
  }
}

// Tel Aviv
add(['tel aviv', 'תל אביב', 'תל-אביב', 'tel-aviv'], ['tel-aviv']);

// Gush Dan / central
add(['rishon lezion', 'ראשון לציון', 'rishon-lezion'], ['rishon-lezion']);
add(['holon', 'חולון'], ['holon']);
add(['bat yam', 'בת ים', 'bat-yam'], ['bat-yam']);
add(['ramat gan', 'רמת גן', 'ramat-gan'], ['ramat-gan']);
add(['givatayim', 'גבעתיים'], ['givatayim']);
add(['bnei brak', 'בני ברק', 'bnei-brak'], ['bnei-brak']);
add(['petah tikva', 'פתח תקווה', 'petah-tikva'], ['petah-tikva']);
add(['ramat hasharon', 'רמת השרון'], ['ramat-hasharon']);
add(['hertzliya', 'הרצליה', 'herzliya'], ['hertzliya', 'herzliya']);
add(['kfar saba', 'כפר סבא', 'kfar-saba'], ['kfar-saba']);
add(['raanana', 'רעננה'], ['raanana']);
add(['netanya', 'נתניה'], ['netanya']);

// Hashfela (Gedera area)
add(['gedera', 'גדרה'], ['rishon-lezion-hashfela-area', 'gedera']);
add(['yavne', 'יבנה'], ['rishon-lezion-hashfela-area']);
add(['ashdod', 'אשדוד'], ['ashdod-and-lachish-area', 'ashdod']);
add(['ashkelon', 'אשקלון'], ['ashkelon-and-surroundings']);
add(['beer sheva', 'באר שבע', 'beer-sheva', 'באר-שבע'], ['beer-sheva']);
add(['jerusalem', 'ירושלים', 'jeru'], ['jerusalem']);
add(['haifa', 'חיפה'], ['haifa']);
add(['eilat', 'אילת'], ['eilat']);

/**
 * Return Wolt path city slug(s) that are valid for the given city name.
 * Returns null if city is unknown (caller may treat as no constraint).
 */
export function getWoltSlugsForCity(cityText: string | null): string[] | null {
  if (!cityText || !cityText.trim()) {
    return null;
  }
  const k = key(cityText);
  const slugs = MAP.get(k);
  if (slugs) {
    return slugs;
  }
  // Fallback: single slug from normalizing the city (e.g. "Tel Aviv" -> "tel-aviv")
  const single = n(cityText).replace(/[^a-z0-9-]/g, '');
  if (single) {
    return [single];
  }
  return null;
}
