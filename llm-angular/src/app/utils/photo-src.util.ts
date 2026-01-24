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
 * CRITICAL: ONLY uses backend proxy - NO direct Google URLs
 * 
 * Priority:
 * 1. If photoReference exists, build internal proxy URL
 * 2. Otherwise, return null (use placeholder)
 * 
 * @param restaurant - Restaurant object from search results
 * @param maxWidthPx - Desired image width (default 400 for mobile-first)
 * @returns Secure photo URL or null
 */
export function buildPhotoSrc(restaurant: Restaurant, maxWidthPx: number = 400): string | null {
  // CRITICAL: Use photoReference ONLY - ignore photoUrl to prevent CORS
  if (restaurant.photoReference) {
    const photoRef = restaurant.photoReference;
    
    // HARD GUARD: Block if photoReference is actually a full Google URL
    if (isGoogleUrl(photoRef)) {
      console.error('[PhotoSrc] BLOCKED - photoReference contains Google URL', {
        placeId: restaurant.placeId,
        refPrefix: photoRef.substring(0, 100)
      });
      return null;
    }
    
    // VALIDATION: Ensure photoReference is in correct format (places/xxx/photos/xxx)
    if (!photoRef.startsWith('places/')) {
      console.error('[PhotoSrc] INVALID photoReference format - must start with "places/"', {
        placeId: restaurant.placeId,
        refPrefix: photoRef.substring(0, 50)
      });
      return null;
    }
    
    const proxyUrl = buildProxyUrl(photoRef, maxWidthPx);
    
    // DOUBLE GUARD: If somehow a Google URL got through, return null
    if (isGoogleUrl(proxyUrl)) {
      console.error('[PhotoSrc] BLOCKED Google URL in final proxy URL', {
        placeId: restaurant.placeId,
        urlPrefix: proxyUrl.substring(0, 100)
      });
      return null;
    }
    
    return proxyUrl;
  }

  // Dev-mode warning if photoUrl exists but no photoReference
  if (!environment.production && restaurant.photoUrl) {
    console.warn('[PhotoSrc] photoUrl present but no photoReference - images will not load', {
      placeId: restaurant.placeId,
      name: restaurant.name,
      photoUrlPrefix: restaurant.photoUrl?.substring(0, 50)
    });
  }

  // No photo available
  return null;
}

/**
 * Build internal proxy URL from photo reference
 * Format: /api/v1/photos/{photoReference}?maxWidthPx=400
 * CRITICAL: Backend proxy endpoint - prevents CORS and API key exposure
 */
function buildProxyUrl(photoReference: string, maxWidthPx: number): string {
  const baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;
  
  // Photo reference format: places/{placeId}/photos/{photoId}
  // Backend route: GET /photos/places/:placeId/photos/:photoId
  // DO NOT encode - backend expects path parameters, not encoded string
  return `${baseUrl}/photos/${photoReference}?maxWidthPx=${maxWidthPx}`;
}

/**
 * HARD GUARD: Check if URL is a Google URL that would cause CORS
 * Returns true if URL should be blocked
 */
function isGoogleUrl(url: string): boolean {
  return url.includes('googleusercontent.com') ||
         url.includes('gstatic.com') ||
         url.includes('googleapis.com') ||
         url.includes('maps.googleapis.com') ||
         url.includes('places.googleapis.com');
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
 * CRITICAL: ONLY uses backend proxy with photoReference
 * 
 * @param restaurant - Restaurant object
 * @returns srcset string or null
 */
export function buildPhotoSrcset(restaurant: Restaurant): string | null {
  // CRITICAL: Use photoReference ONLY - ignore photoUrl to prevent CORS
  const photoRef = restaurant.photoReference;
  if (!photoRef) return null;

  // HARD GUARD: Block if photoReference is actually a full Google URL
  if (isGoogleUrl(photoRef)) {
    console.error('[PhotoSrcset] BLOCKED - photoReference contains Google URL', {
      placeId: restaurant.placeId
    });
    return null;
  }

  // VALIDATION: Ensure photoReference is in correct format
  if (!photoRef.startsWith('places/')) {
    console.error('[PhotoSrcset] INVALID photoReference format', {
      placeId: restaurant.placeId
    });
    return null;
  }

  const baseUrl = `${environment.apiUrl}${environment.apiBasePath}`;
  const sizes = [400, 800, 1200];
  
  return sizes
    .map(size => `${baseUrl}/photos/${photoRef}?maxWidthPx=${size} ${size}w`)
    .join(', ');
}
