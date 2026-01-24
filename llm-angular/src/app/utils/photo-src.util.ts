/**
 * Photo Source Utility
 * P0 Security: Build secure photo URLs using backend proxy
 * 
 * NEVER exposes Google API keys to client
 * All images loaded through internal proxy: /api/v1/photos
 */

import { environment } from '../../environments/environment';
import type { Restaurant } from '../domain/types/search.types';

/**
 * Build secure photo URL for a restaurant
 * 
 * Priority:
 * 1. If photoUrl exists and is internal (starts with /api), use it
 * 2. If photoReference exists, build internal proxy URL
 * 3. Otherwise, return null (use placeholder)
 * 
 * @param restaurant - Restaurant object from search results
 * @param maxWidthPx - Desired image width (default 800)
 * @returns Secure photo URL or null
 */
export function buildPhotoSrc(restaurant: Restaurant, maxWidthPx: number = 800): string | null {
  // P0 Security: Dev-mode assertion to catch API key leaks
  if (!environment.production && restaurant.photoUrl) {
    assertNoApiKeyLeak(restaurant.photoUrl);
  }

  // Priority 1: Internal proxy URL (already sanitized by backend)
  if (restaurant.photoUrl && isInternalUrl(restaurant.photoUrl)) {
    return restaurant.photoUrl;
  }

  // Priority 2: Photo reference (build proxy URL)
  if (restaurant.photoReference) {
    return buildProxyUrl(restaurant.photoReference, maxWidthPx);
  }

  // Priority 3: Legacy photoUrl that should have been sanitized
  // This should not happen in production, but handle gracefully
  if (restaurant.photoUrl && !containsApiKey(restaurant.photoUrl)) {
    console.warn('[PhotoSrc] Using legacy photoUrl - should be migrated to photoReference', {
      placeId: restaurant.placeId,
      name: restaurant.name
    });
    return restaurant.photoUrl;
  }

  // No photo available
  return null;
}

/**
 * Build internal proxy URL from photo reference
 * Format: /api/v1/photos/{photoReference}?maxWidthPx=800
 */
function buildProxyUrl(photoReference: string, maxWidthPx: number): string {
  const baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;
  
  // Photo reference format: places/{placeId}/photos/{photoId}
  // Already URL-safe, no need to encode
  return `${baseUrl}/photos/${photoReference}?maxWidthPx=${maxWidthPx}`;
}

/**
 * Check if URL is internal (points to our API)
 */
function isInternalUrl(url: string): boolean {
  return url.startsWith('/api') || 
         url.includes(environment.apiUrl) ||
         url.startsWith('http://localhost') ||
         url.startsWith('https://api.going2eat.food');
}

/**
 * Check if URL contains API key (security check)
 */
function containsApiKey(url: string): boolean {
  return url.includes('key=') || 
         url.includes('AIza') ||
         url.includes('places.googleapis.com');
}

/**
 * Dev-mode assertion to catch API key leaks
 * Throws error in development if API key detected
 */
function assertNoApiKeyLeak(url: string): void {
  if (containsApiKey(url)) {
    console.error('🚨 SECURITY VIOLATION: API key detected in photo URL!', {
      url: url.substring(0, 100) + '...',
      detected: 'Google API key or direct googleapis.com URL'
    });
    
    // In development, throw to fail fast
    if (!environment.production) {
      throw new Error('P0 Security: API key detected in photo URL. Backend must sanitize all URLs.');
    }
  }
}

/**
 * Get placeholder image path
 * Used when no photo is available
 */
export function getPhotoPlaceholder(): string {
  // Return inline SVG data URI for better performance
  return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBmb250LXNpemU9IjYwIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+8J+NvO+4jzwvdGV4dD48L3N2Zz4=';
}

/**
 * Build srcset for responsive images
 * Generates multiple sizes for different screen densities
 * 
 * @param restaurant - Restaurant object
 * @returns srcset string or null
 */
export function buildPhotoSrcset(restaurant: Restaurant): string | null {
  const photoRef = restaurant.photoReference;
  if (!photoRef) return null;

  const baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;
  const sizes = [400, 800, 1200];
  
  return sizes
    .map(size => `${baseUrl}/photos/${photoRef}?maxWidthPx=${size} ${size}w`)
    .join(', ');
}
