/**
 * Wolt Deep-Link Utility
 * Pure functions to build Wolt search deep-links from restaurant data
 * 
 * This replaces backend CSE enrichment with client-side URL construction.
 * Uses Wolt's search URL format: https://wolt.com/{lang}/isr/{city}/search?query={encoded}
 */

/** UTM + ref params for provider deep links (going2eat referral) */
const TRACKING_PARAMS: Readonly<[string, string][]> = [
  ['utm_source', 'going2eat'],
  ['utm_medium', 'referral'],
  ['utm_campaign', 'provider_link'],
  ['ref', 'going2eat'],
];

/** @deprecated Use TRACKING_PARAMS instead */
const WOLT_TRACKING_PARAMS = TRACKING_PARAMS;

/**
 * Append UTM and ref tracking params to Wolt URLs only.
 * Pure, reusable. Does not break existing query params; uses & when query exists.
 * Does not duplicate params if already present.
 *
 * @param url - Any URL (only wolt.com URLs are modified)
 * @returns Modified URL with tracking params, or original URL unchanged
 */
export function appendWoltTrackingParams(url: string): string {
  if (!url || typeof url !== 'string' || !url.includes('wolt.com')) {
    return url;
  }
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    for (const [key, value] of WOLT_TRACKING_PARAMS) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
    u.search = params.toString();
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Build Wolt URL with tracking params appended.
 * Preserves existing query string; does not modify non-Wolt domains.
 *
 * @param baseUrl - Wolt or any URL (only wolt.com URLs are modified)
 * @returns URL with utm_source, utm_medium, utm_campaign, ref appended when missing
 */
export function buildWoltUrl(baseUrl: string): string {
  return appendWoltTrackingParams(baseUrl);
}

/**
 * Append UTM and ref tracking params to 10bis URLs only.
 * Pure, reusable. Preserves existing query params; uses & when query exists.
 * Avoids duplicate params if already present.
 *
 * @param url - Any URL (only 10bis.co.il URLs are modified)
 * @returns Modified URL with tracking params, or original URL unchanged
 */
export function appendTenbisTrackingParams(url: string): string {
  if (!url || typeof url !== 'string' || !url.includes('10bis.co.il')) {
    return url;
  }
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    for (const [key, value] of TRACKING_PARAMS) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
    u.search = params.toString();
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Build 10bis URL with tracking params appended.
 * Preserves existing query string; does not modify non-10bis domains.
 *
 * @param baseUrl - 10bis or any URL (only 10bis.co.il URLs are modified)
 * @returns URL with utm_source, utm_medium, utm_campaign, ref appended when missing
 */
export function buildTenbisUrl(baseUrl: string): string {
  return appendTenbisTrackingParams(baseUrl);
}

/**
 * Append UTM and ref tracking params to Mishloha URLs only.
 * Pure, reusable. Preserves existing query params; uses & when query exists.
 * Avoids duplicate params if already present.
 *
 * @param url - Any URL (only mishloha.co.il URLs are modified)
 * @returns Modified URL with tracking params, or original URL unchanged
 */
export function appendMishlohaTrackingParams(url: string): string {
  if (!url || typeof url !== 'string' || !url.includes('mishloha.co.il')) {
    return url;
  }
  try {
    const u = new URL(url);
    const params = new URLSearchParams(u.search);
    for (const [key, value] of TRACKING_PARAMS) {
      if (!params.has(key)) {
        params.set(key, value);
      }
    }
    u.search = params.toString();
    return u.toString();
  } catch {
    return url;
  }
}

/**
 * Build Mishloha URL with tracking params appended.
 * Preserves existing query string; does not modify non-Mishloha domains.
 *
 * @param baseUrl - Mishloha or any URL (only mishloha.co.il URLs are modified)
 * @returns URL with utm_source, utm_medium, utm_campaign, ref appended when missing
 */
export function buildMishlohaUrl(baseUrl: string): string {
  return appendMishlohaTrackingParams(baseUrl);
}

/**
 * Validate 10bis URL structure
 * 
 * Requirements:
 * - Domain must be 10bis.co.il
 * - Path must start with /restaurant or /next/r
 * 
 * @param url - URL to validate
 * @returns true if valid 10bis URL, false otherwise
 */
export function isValid10bisUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Must contain 10bis.co.il domain
  if (!url.includes('10bis.co.il')) {
    return false;
  }

  try {
    const u = new URL(url);
    
    // Verify domain exactly
    if (!u.hostname.endsWith('10bis.co.il')) {
      return false;
    }

    // Path must start with /restaurant or /next/r
    const validPaths = ['/restaurant', '/next/r'];
    const hasValidPath = validPaths.some(prefix => u.pathname.startsWith(prefix));
    
    return hasValidPath;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * Validate Mishloha URL structure
 * 
 * Requirements:
 * - Domain must be mishloha.co.il
 * - Must be valid URL format
 * 
 * @param url - URL to validate
 * @returns true if valid Mishloha URL, false otherwise
 */
export function isValidMishlohaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Must contain mishloha.co.il domain
  if (!url.includes('mishloha.co.il')) {
    return false;
  }

  try {
    const u = new URL(url);
    
    // Verify domain exactly
    if (!u.hostname.endsWith('mishloha.co.il')) {
      return false;
    }

    return true;
  } catch {
    // Invalid URL format
    return false;
  }
}

/**
 * City slug mapping for common Israeli cities
 * Fallback to 'tel-aviv' if city is not found
 */
const CITY_SLUG_MAP: Record<string, string> = {
  // Major cities
  'tel aviv': 'tel-aviv',
  'tel-aviv': 'tel-aviv',
  'תל אביב': 'tel-aviv',
  'jerusalem': 'jerusalem',
  'ירושלים': 'jerusalem',
  'haifa': 'haifa',
  'חיפה': 'haifa',
  'beer sheva': 'beer-sheva',
  'באר שבע': 'beer-sheva',
  'rishon lezion': 'rishon-lezion',
  'ראשון לציון': 'rishon-lezion',
  'petah tikva': 'petah-tikva',
  'פתח תקווה': 'petah-tikva',
  'ashdod': 'ashdod',
  'אשדוד': 'ashdod',
  'netanya': 'netanya',
  'נתניה': 'netanya',
  'herzliya': 'herzliya',
  'הרצליה': 'herzliya',
  'ramat gan': 'ramat-gan',
  'רמת גן': 'ramat-gan',
  'holon': 'holon',
  'חולון': 'holon',
  'bat yam': 'bat-yam',
  'בת ים': 'bat-yam',
  'rehovot': 'rehovot',
  'רחובות': 'rehovot',
  'ashkelon': 'ashkelon',
  'אשקלון': 'ashkelon',
  'kfar saba': 'kfar-saba',
  'כפר סבא': 'kfar-saba',
  'raanana': 'raanana',
  'רעננה': 'raanana',
  'modiin': 'modiin-maccabim-reut',
  'מודיעין': 'modiin-maccabim-reut',
  'hadera': 'hadera',
  'חדרה': 'hadera',
};

/**
 * Extract city slug from address string
 * Uses simple heuristics to extract city name and map to Wolt slug
 * 
 * @param address - Full address string (e.g., "123 Main St, Tel Aviv, Israel")
 * @returns City slug for Wolt URL, or 'tel-aviv' as fallback
 */
export function extractCitySlug(address: string | undefined): string {
  if (!address) {
    return 'tel-aviv'; // Default fallback
  }

  // Split by comma and take potential city parts
  const parts = address.split(',').map(p => p.trim().toLowerCase());
  
  // Try each part to find a match in our city map
  for (const part of parts) {
    // Direct match
    if (CITY_SLUG_MAP[part]) {
      return CITY_SLUG_MAP[part];
    }
    
    // Partial match (e.g., "tel aviv-yafo" contains "tel aviv")
    for (const [cityName, slug] of Object.entries(CITY_SLUG_MAP)) {
      if (part.includes(cityName)) {
        return slug;
      }
    }
  }

  // Fallback to tel-aviv if no match found
  return 'tel-aviv';
}

/**
 * Extract city text from address for search query
 * Returns the second-to-last part of address (usually the city)
 * 
 * @param address - Full address string
 * @returns City text or null if cannot be determined
 */
export function extractCityText(address: string | undefined): string | null {
  if (!address) {
    return null;
  }

  // Simple heuristic: Split by comma, take second-to-last part
  // Example: "123 Main St, Tel Aviv, Israel" → "Tel Aviv"
  const parts = address.split(',').map(p => p.trim());
  if (parts.length >= 2) {
    return parts[parts.length - 2]; // Second-to-last part
  }

  return null;
}

/**
 * Build Wolt search deep-link URL from restaurant data
 * 
 * Format: https://wolt.com/{lang}/isr/{citySlug}/search?query={encoded}
 * Query: "{restaurantName} {cityText}" (cityText optional)
 * 
 * @param restaurantName - Name of the restaurant (required)
 * @param citySlug - City slug for URL path (defaults to 'tel-aviv')
 * @param cityText - Optional city text to append to search query
 * @param lang - UI language ('he' or 'en', defaults to 'he')
 * @returns Wolt search URL, or null if restaurantName is missing
 * 
 * @example
 * buildWoltSearchUrl('Pizza Place', 'tel-aviv', 'Tel Aviv', 'he')
 * // Returns: "https://wolt.com/he/isr/tel-aviv/search?query=Pizza%20Place%20Tel%20Aviv"
 * 
 * @example
 * buildWoltSearchUrl('Burger Joint', undefined, undefined, 'en')
 * // Returns: "https://wolt.com/en/isr/tel-aviv/search?query=Burger%20Joint"
 */
export function buildWoltSearchUrl(
  restaurantName: string | undefined,
  citySlug?: string,
  cityText?: string,
  lang: 'he' | 'en' = 'he'
): string | null {
  // GUARD: Restaurant name is required
  if (!restaurantName || restaurantName.trim() === '') {
    return null;
  }

  // Use provided citySlug or fallback to tel-aviv
  const slug = citySlug || 'tel-aviv';

  // Build search query: restaurantName + optional cityText
  const searchQuery = cityText
    ? `${restaurantName} ${cityText}`
    : restaurantName;

  // Encode search query for URL
  const encoded = encodeURIComponent(searchQuery);

  // Build final URL and append tracking params (utm_source, utm_medium, utm_campaign, ref)
  const baseUrl = `https://wolt.com/${lang}/isr/${slug}/search?query=${encoded}`;
  return appendWoltTrackingParams(baseUrl);
}
