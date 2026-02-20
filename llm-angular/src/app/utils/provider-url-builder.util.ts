/**
 * Provider URL Builder Utility
 * 
 * Builds search URLs for delivery providers (Wolt, 10bis, Mishloha)
 * when no direct deep link is available (NOT_FOUND status).
 */

import { appendWoltTrackingParams, appendTenbisTrackingParams, appendMishlohaTrackingParams } from './wolt-deeplink.util';

/**
 * Extract city slug from address
 * Supports Hebrew and English city names
 */
function extractCitySlug(address: string): string {
  const cityMap: Record<string, string> = {
    // Hebrew cities
    'תל אביב': 'tel-aviv',
    'ירושלים': 'jerusalem',
    'חיפה': 'haifa',
    'באר שבע': 'beer-sheva',
    'פתח תקווה': 'petah-tikva',
    'ראשון לציון': 'rishon-lezion',
    'נתניה': 'netanya',
    'אשדוד': 'ashdod',
    'אשקלון': 'ashkelon',
    'חולון': 'holon',
    'בת ים': 'bat-yam',
    'רמת גן': 'ramat-gan',
    'בני ברק': 'bnei-brak',
    'הרצליה': 'herzliya',
    'כפר סבא': 'kfar-saba',
    'רעננה': 'raanana',
    'רחובות': 'rehovot',
    'מודיעין': 'modiin',
    'נס ציונה': 'nes-ziona',
    'יבנה': 'yavne',
    
    // English cities
    'Tel Aviv': 'tel-aviv',
    'Jerusalem': 'jerusalem',
    'Haifa': 'haifa',
    'Beer Sheva': 'beer-sheva',
    'Petah Tikva': 'petah-tikva',
    'Rishon LeZion': 'rishon-lezion',
    'Netanya': 'netanya',
    'Ashdod': 'ashdod',
    'Ashkelon': 'ashkelon',
    'Holon': 'holon',
    'Bat Yam': 'bat-yam',
    'Ramat Gan': 'ramat-gan',
    'Bnei Brak': 'bnei-brak',
    'Herzliya': 'herzliya',
    'Kfar Saba': 'kfar-saba',
    'Raanana': 'raanana',
    'Rehovot': 'rehovot',
    'Modiin': 'modiin',
    'Nes Ziona': 'nes-ziona',
    'Yavne': 'yavne',
  };

  // Try to find city in address
  for (const [city, slug] of Object.entries(cityMap)) {
    if (address.includes(city)) {
      return slug;
    }
  }

  // Default to tel-aviv
  return 'tel-aviv';
}

/**
 * Build Wolt search URL
 * Format: https://wolt.com/he/isr/{city}/search?q={query} with UTM + ref params
 */
export function buildWoltSearchUrl(restaurantName: string, address: string, lang: 'he' | 'en' = 'he'): string {
  const citySlug = extractCitySlug(address);
  const query = encodeURIComponent(restaurantName);
  const baseUrl = `https://wolt.com/${lang}/isr/${citySlug}/search?q=${query}`;
  return appendWoltTrackingParams(baseUrl);
}

/**
 * Build 10bis search URL with tracking params
 * Format: https://www.10bis.co.il/next/restaurants/search/SearchRestaurantsBy?query={query}&area={city}
 */
export function buildTenbisSearchUrl(restaurantName: string, address: string): string {
  const query = encodeURIComponent(restaurantName);
  const city = extractCityName(address);
  const area = city ? `&area=${encodeURIComponent(city)}` : '';
  const baseUrl = `https://www.10bis.co.il/next/restaurants/search/SearchRestaurantsBy?query=${query}${area}`;
  return appendTenbisTrackingParams(baseUrl);
}

/**
 * Build Mishloha search URL with tracking params
 * Format: https://www.mishloha.co.il/search?q={query}
 */
export function buildMishlohaSearchUrl(restaurantName: string, address: string): string {
  const query = encodeURIComponent(restaurantName);
  const baseUrl = `https://www.mishloha.co.il/search?q=${query}`;
  return appendMishlohaTrackingParams(baseUrl);
}

/**
 * Extract city name from address (for display)
 */
function extractCityName(address: string): string | null {
  const cityNames = [
    'תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'פתח תקווה', 
    'ראשון לציון', 'נתניה', 'אשדוד', 'אשקלון', 'חולון',
    'בת ים', 'רמת גן', 'בני ברק', 'הרצליה', 'כפר סבא',
    'רעננה', 'רחובות', 'מודיעין', 'נס ציונה', 'יבנה',
    'Tel Aviv', 'Jerusalem', 'Haifa', 'Beer Sheva', 'Petah Tikva',
    'Rishon LeZion', 'Netanya', 'Ashdod', 'Ashkelon', 'Holon',
    'Bat Yam', 'Ramat Gan', 'Bnei Brak', 'Herzliya', 'Kfar Saba',
    'Raanana', 'Rehovot', 'Modiin', 'Nes Ziona', 'Yavne'
  ];

  for (const city of cityNames) {
    if (address.includes(city)) {
      return city;
    }
  }

  return null;
}
