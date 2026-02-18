/**
 * Region Code Validator
 * 
 * Validates region codes against CLDR standard for Google Places API
 * Handles special cases like 'GZ' (Gaza Strip) which is not supported by Google
 */

/**
 * CLDR-compliant region codes supported by Google Places API
 * Source: ISO 3166-1 alpha-2 codes that Google actually accepts
 * 
 * Note: 'GZ' (Gaza Strip) is NOT in this list - Google doesn't support it
 */
const VALID_REGION_CODES = new Set([
  // Common regions
  'IL', // Israel
  'US', // United States
  'GB', // United Kingdom
  'CA', // Canada
  'AU', // Australia
  'NZ', // New Zealand
  'DE', // Germany
  'FR', // France
  'ES', // Spain
  'IT', // Italy
  'NL', // Netherlands
  'BE', // Belgium
  'CH', // Switzerland
  'AT', // Austria
  'SE', // Sweden
  'NO', // Norway
  'DK', // Denmark
  'FI', // Finland
  'PL', // Poland
  'CZ', // Czech Republic
  'HU', // Hungary
  'RO', // Romania
  'BG', // Bulgaria
  'GR', // Greece
  'PT', // Portugal
  'IE', // Ireland
  'RU', // Russia
  'UA', // Ukraine
  'TR', // Turkey
  'SA', // Saudi Arabia
  'AE', // United Arab Emirates
  'EG', // Egypt
  'JO', // Jordan
  'LB', // Lebanon
  'SY', // Syria
  'IQ', // Iraq
  'IN', // India
  'CN', // China
  'JP', // Japan
  'KR', // South Korea
  'TH', // Thailand
  'VN', // Vietnam
  'MY', // Malaysia
  'SG', // Singapore
  'ID', // Indonesia
  'PH', // Philippines
  'BR', // Brazil
  'AR', // Argentina
  'MX', // Mexico
  'CL', // Chile
  'CO', // Colombia
  'PE', // Peru
  'ZA', // South Africa
  'KE', // Kenya
  'NG', // Nigeria
  'MA', // Morocco
  'DZ', // Algeria
  'TN', // Tunisia
  'LY', // Libya
  // Add more as needed
]);

/**
 * Israel bounding box for geographic validation
 * Used to determine if coordinates are within Israel territory
 */
const IL_BBOX = {
  latMin: 29.45,
  latMax: 33.35,
  lngMin: 34.20,
  lngMax: 35.90
};

/**
 * Check if coordinates are within Israel territory
 * 
 * @param lat Latitude
 * @param lng Longitude
 * @returns true if coordinates are inside Israel bbox
 */
export function isInsideIsrael(lat: number, lng: number): boolean {
  return lat >= IL_BBOX.latMin && lat <= IL_BBOX.latMax &&
    lng >= IL_BBOX.lngMin && lng <= IL_BBOX.lngMax;
}

/**
 * Validate region code format and CLDR compliance
 * 
 * @param code Region code to validate (e.g., 'IL', 'US', 'GZ')
 * @returns true if code is valid and supported by Google Places API
 */
export function isValidRegionCode(code: string | undefined | null): boolean {
  if (!code) return false;

  // Must be exactly 2 uppercase letters
  if (!/^[A-Z]{2}$/.test(code)) return false;

  // Must be in CLDR allowlist
  return VALID_REGION_CODES.has(code);
}

/**
 * Sanitize region code for Google Places API
 * 
 * Handles special cases:
 * - 'GZ' (Gaza Strip): Map to 'IL' if user is inside Israel, else null
 * - 'IS': Common LLM mistake for Israel, map to 'IL'
 * - Invalid codes: Return null
 * - Valid codes: Return as-is
 * 
 * @param code Input region code
 * @param userLocation Optional user coordinates for geographic validation
 * @returns Sanitized region code or null
 */
export function sanitizeRegionCode(
  code: string | undefined | null,
  userLocation?: { lat: number; lng: number } | null
): string | null {
  if (!code) return null;

  // Special case: "IS" is a common LLM hallucination for Israel
  // ISO 3166-1 "IS" is actually Iceland, but LLMs sometimes use it for Israel
  // Map to correct code 'IL'
  if (code === 'IS') {
    return 'IL';
  }

  // Special case: Gaza Strip (not supported by Google)
  if (code === 'GZ') {
    // If user is inside Israel geographically, use 'IL'
    if (userLocation && isInsideIsrael(userLocation.lat, userLocation.lng)) {
      return 'IL';
    }
    // Otherwise, don't send regionCode (let Google infer)
    return null;
  }

  // Validate against CLDR allowlist
  if (isValidRegionCode(code)) {
    return code;
  }

  // Invalid code: don't send to Google
  return null;
}

/**
 * Get fallback region code for invalid input
 * 
 * @param invalidCode The invalid region code that was rejected
 * @param userLocation Optional user coordinates
 * @returns 'IL' if inside Israel, else null
 */
export function getFallbackRegion(
  invalidCode: string,
  userLocation?: { lat: number; lng: number } | null
): string | null {
  if (userLocation && isInsideIsrael(userLocation.lat, userLocation.lng)) {
    return 'IL';
  }
  return null;
}

/**
 * Check if a region code is a known unsupported/correctable region
 * Used to reduce log noise for expected cases
 * 
 * @param code Region code to check
 * @returns true if this is a known unsupported/correctable region (e.g., GZ, IS)
 */
export function isKnownUnsupportedRegion(code: string): boolean {
  // Gaza Strip - not supported by Google Places API
  // "IS" - Common LLM mistake (actually Iceland, but LLM uses for Israel)
  // These are expected inputs from intent LLM, so we handle them gracefully
  return code === 'GZ' || code === 'IS';
}
