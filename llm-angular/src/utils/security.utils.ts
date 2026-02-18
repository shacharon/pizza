/**
 * Security Utilities
 * Helpers for safe logging and security-sensitive operations
 */

import { createHash } from 'node:crypto';

/**
 * Hash a session ID for safe logging
 * Uses SHA-256 and returns first 12 characters for readability
 * 
 * @param sessionId - Session ID to hash
 * @returns Hashed session ID (12 chars) or 'none' if no session
 */
export function hashSessionId(sessionId: string | undefined | null): string {
  if (!sessionId) return 'none';
  
  return createHash('sha256')
    .update(sessionId)
    .digest('hex')
    .substring(0, 12);
}

/**
 * Sanitize a photo URL to remove API keys
 * Returns photo reference only (no key parameter)
 * 
 * @param url - Photo URL that may contain key=
 * @returns Sanitized URL without key parameter
 */
export function sanitizePhotoUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  
  try {
    const urlObj = new URL(url);
    
    // Remove key parameter if present
    if (urlObj.searchParams.has('key')) {
      urlObj.searchParams.delete('key');
      return urlObj.toString();
    }
    
    return url;
  } catch {
    // If URL parsing fails, return undefined (invalid URL)
    return undefined;
  }
}

/**
 * Sanitize all photo URLs in a results array
 * Removes API keys from photoUrl and photos[] fields
 * 
 * @param results - Array of restaurant results
 * @returns Results with sanitized photo URLs
 */
export function sanitizePhotoUrls(results: any[]): any[] {
  return results.map((result) => ({
    ...result,
    photoUrl: sanitizePhotoUrl(result.photoUrl),
    photos: result.photos?.map((url: string) => sanitizePhotoUrl(url)).filter(Boolean)
  }));
}
