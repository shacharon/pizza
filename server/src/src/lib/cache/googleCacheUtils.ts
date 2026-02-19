/**
 * Google Places API Cache Key Generation
 * 
 * Implements smart bucketing strategies to balance cache hit rate vs. key explosion:
 * - Geo-bucketing: rounds coordinates to ~110m precision (3 decimals)
 * - Radius-bucketing: rounds up to nearest 500m to group similar searches
 * - Category normalization: case-insensitive matching
 * 
 * This reduces cache key variations by ~90% while maintaining acceptable precision.
 */

import { createHash } from 'crypto';

export interface CacheKeyParams {
    category: string;      // הקטגוריה הראשית (למשל pizza)
    filters?: string[];    // מערך תגים/אילוצים (למשל ["kosher", "open_now"])
    locationText?: string; // טקסט המיקום (למשל "גדרה")
    lat: number;
    lng: number;
    radius: number;
    region: string;
    language: string;
}

/**
 * Generate cache key for Google Places search results
 * 
 * Uses bucketing to increase cache hit rate:
 * - Coordinates rounded to 3 decimals (~110m precision)
 * - Radius rounded up to nearest 500m
 * - Category normalized (trimmed + lowercase)
 * 
 * Example:
 * - Input: { category: "Pizza ", lat: 32.08044, lng: 34.78076, radius: 1200, region: "IL", language: "he" }
 * - Output: "g:search:a1b2c3d4..." (MD5 of normalized params)
 * 
 * @param params Search parameters
 * @returns Compact cache key (MD5 hash for Redis efficiency)
 */
export function generateSearchCacheKey(params: CacheKeyParams): string {
    // 1. נרמול קטגוריה
    const cat = params.category.trim().toLowerCase();

    // 2. נרמול וסידור פילטרים (מבטיח ש-"כשר, פתוח" זהה ל-"פתוח, כשר")
    const sortedFilters = params.filters
        ? params.filters
            .map(f => f.trim().toLowerCase())
            .filter(f => f.length > 0)
            .sort()
            .join(',')
        : '';

    // 3. נרמול מיקום טקסטואלי
    const loc = params.locationText?.trim().toLowerCase() || '';

    // 4. Geo-Bucketing (דיוק של ~110 מטר)
    const latR = Math.round(params.lat * 1000) / 1000;
    const lngR = Math.round(params.lng * 1000) / 1000;

    // 5. Radius-Bucketing (עיגול ל-500 מטר הקרובים כלפי מעלה)
    const radR = Math.ceil(params.radius / 500) * 500;

    // בניית המחרוזת הגולמית למפתח
    const rawKey = `v1:${params.region}:${params.language}:${cat}:${sortedFilters}:${loc}:${latR}:${lngR}:${radR}`;

    // יצירת MD5 למפתח קומפקטי ב-Redis
    const hash = createHash('md5').update(rawKey).digest('hex');

    return `g:search:${hash}`;
}

/**
 * Generate cache key for Google Places Text Search (New API)
 * 
 * Includes all parameters that affect the API response:
 * - provider, method, textQuery, languageCode, regionCode
 * - bias (location bias if present)
 * - fieldMask (determines what fields are returned)
 * - pipelineVersion (to avoid stale schema mismatches)
 * 
 * @param params Text Search specific parameters
 * @returns Cache key
 */
export function generateTextSearchCacheKey(params: {
    textQuery: string;
    languageCode: string;
    regionCode: string;
    bias: { lat: number; lng: number; radiusMeters: number } | null;
    fieldMask: string;
    pipelineVersion?: string;
}): string {
    // Normalize textQuery: trim + collapse multiple spaces
    const normalizedQuery = params.textQuery
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();

    // Bias: round coordinates and radius for bucketing (same as search key)
    let biasStr = 'null';
    if (params.bias) {
        const latR = Math.round(params.bias.lat * 1000) / 1000;
        const lngR = Math.round(params.bias.lng * 1000) / 1000;
        const radR = Math.ceil(params.bias.radiusMeters / 500) * 500;
        biasStr = `${latR}:${lngR}:${radR}`;
    }

    // Field mask hash (compact representation)
    const fieldMaskHash = createHash('md5')
        .update(params.fieldMask)
        .digest('hex')
        .slice(0, 8);

    const pipelineVer = params.pipelineVersion || 'v2';

    // Build raw key with all discriminating parameters
    const rawKey = `${pipelineVer}:google_places_new:searchText:${params.regionCode}:${params.languageCode}:${normalizedQuery}:${biasStr}:${fieldMaskHash}`;

    // Hash for compact Redis key
    const hash = createHash('md5').update(rawKey).digest('hex');

    return `g:textsearch:${hash}`;
}

/**
 * Generate cache key for Google Place Details
 * 
 * Place details are keyed by placeId + fieldMask combination.
 * Different field masks produce different cache entries (cost vs. freshness trade-off).
 * 
 * Example:
 * - Input: placeId="ChIJ...", fieldMask="places.displayName,places.location"
 * - Output: "g:place:ChIJ...:e7f8g9h0..."
 * 
 * @param placeId Google Place ID
 * @param fieldMask Comma-separated field mask (determines what data is cached)
 * @returns Cache key
 */
export function generatePlaceDetailsKey(placeId: string, fieldMask: string): string {
    // Hash field mask to keep key compact (field masks can be very long)
    const fieldHash = createHash('md5').update(fieldMask).digest('hex');

    return `g:place:${placeId}:${fieldHash}`;
}
