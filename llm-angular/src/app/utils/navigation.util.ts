/**
 * Navigation Utilities
 * Handles external navigation to maps/directions
 */

import type { Coordinates } from '../domain/types/search.types';

/**
 * Navigation destination input
 * Provide either coordinates OR placeId (or both for best results)
 */
export interface NavigationDestination {
  /** Coordinates (required if placeId not provided) */
  lat?: number;
  lng?: number;
  /** Google Place ID (preferred, more accurate) */
  placeId?: string;
}

/**
 * Build universal Google Maps navigation URL
 * 
 * Creates a single URL that works on:
 * - Desktop browsers (opens Google Maps web)
 * - Mobile browsers (opens native maps app via deep-link)
 * - All devices without device detection
 * 
 * Priority:
 * 1. Uses placeId if provided (most accurate)
 * 2. Falls back to coordinates if no placeId
 * 3. Throws error if neither provided
 * 
 * Format: https://maps.google.com/?q=<destination>
 * 
 * @param destination Coordinates and/or placeId
 * @returns Universal Google Maps URL (no API key required, no billing)
 * 
 * @example
 * // With place ID (preferred):
 * buildNavigationUrl({ placeId: 'ChIJH3w7GaZMHRURkD-WwKJy-8E' })
 * // Returns: https://maps.google.com/?q=place_id:ChIJH3w7GaZMHRURkD-WwKJy-8E
 * 
 * @example
 * // With coordinates:
 * buildNavigationUrl({ lat: 32.0853, lng: 34.7818 })
 * // Returns: https://maps.google.com/?q=32.0853,34.7818
 * 
 * @example
 * // With both (placeId takes priority):
 * buildNavigationUrl({ 
 *   lat: 32.0853, 
 *   lng: 34.7818, 
 *   placeId: 'ChIJ...' 
 * })
 * // Returns: https://maps.google.com/?q=place_id:ChIJ...
 */
export function buildNavigationUrl(destination: NavigationDestination): string {
  // Validate input
  if (!destination.placeId && (destination.lat === undefined || destination.lng === undefined)) {
    throw new Error('NavigationUtil: Must provide either placeId or coordinates (lat/lng)');
  }

  // Use place_id if available (most accurate, includes name/address)
  if (destination.placeId) {
    return `https://maps.google.com/?q=place_id:${destination.placeId}`;
  }

  // Fallback to coordinates
  return `https://maps.google.com/?q=${destination.lat},${destination.lng}`;
}

/**
 * Check if user is on mobile device
 * Used to determine whether to use deep-links or web URLs
 */
export function isMobileDevice(): boolean {
  // Check for mobile user agent
  const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;

  // Mobile device patterns
  const mobilePatterns = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;

  return mobilePatterns.test(userAgent.toLowerCase());
}

/**
 * Build Google Maps URL for directions (LEGACY - use buildNavigationUrl instead)
 * 
 * @deprecated Use buildNavigationUrl() for simpler, universal URLs
 */
export function buildDirectionsUrl(
  location: Coordinates,
  placeId?: string,
  useMobileDeepLink: boolean = false
): string {
  // Mobile deep-link (opens Google Maps app if installed)
  if (useMobileDeepLink) {
    // Use place_id if available (most accurate)
    if (placeId) {
      return `https://maps.google.com/?q=place_id:${placeId}`;
    }
    // Fallback to coordinates
    return `https://maps.google.com/?q=${location.lat},${location.lng}`;
  }

  // Desktop web URL (Google Maps Directions API)
  // Opens in browser with "Get directions" flow
  const params = new URLSearchParams({
    api: '1',
    destination: `${location.lat},${location.lng}`
  });

  // Add place_id if available (more accurate, includes name/address)
  if (placeId) {
    params.set('destination_place_id', placeId);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Open navigation in external maps app
 * 
 * Behavior:
 * - Desktop: Opens Google Maps web in NEW TAB
 * - Mobile: Opens native maps app via deep-link
 * - NEVER replaces current page
 * - NO iframe, NO popup, NO SPA navigation
 * - Failure-safe: If deep-link fails → falls back to Google Maps web
 * 
 * Implementation:
 * 1. Desktop: window.open() with _blank → new tab
 * 2. Mobile: Deep-link URL → native app opens
 * 3. Fallback: If app not installed → Google Maps web
 * 4. Current page NEVER replaced (even on mobile)
 * 
 * @param destination Coordinates and/or placeId
 * @param options Optional settings (name for logging)
 * 
 * @example
 * // Simple usage:
 * openNavigation({ placeId: 'ChIJ...' })
 * 
 * @example
 * // With fallback data:
 * openNavigation(
 *   { placeId: 'ChIJ...', lat: 32.08, lng: 34.78 },
 *   { name: 'Restaurant Name' }
 * )
 */
export function openNavigation(
  destination: NavigationDestination,
  options?: { name?: string }
): void {
  const url = buildNavigationUrl(destination);

  // Log navigation attempt
  console.log('[Navigation] Opening maps', {
    name: options?.name,
    placeId: destination.placeId,
    location: destination.lat && destination.lng ? { lat: destination.lat, lng: destination.lng } : undefined,
    url: url.substring(0, 80),
    userAgent: navigator.userAgent.substring(0, 50)
  });

  // Check if mobile device (for analytics/logging only)
  const isMobile = isMobileDevice();

  // DESKTOP + MOBILE: Always use window.open() with _blank
  // - Desktop: Opens new tab
  // - Mobile: Triggers deep-link, opens native app
  // - Security: noopener + noreferrer flags
  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');

  // Handle success
  if (newWindow) {
    console.log('[Navigation] Successfully opened', {
      isMobile,
      method: 'window.open',
      target: '_blank'
    });
    return;
  }

  // FALLBACK 1: Popup blocked (desktop) or window.open failed
  console.warn('[Navigation] window.open blocked or failed, trying fallback');

  // On mobile: Try direct assignment (last resort, may replace page)
  // On desktop: This shouldn't happen, but fallback anyway
  if (isMobile) {
    // Mobile fallback: Direct assignment
    // User will need to use back button to return
    console.warn('[Navigation] Using location.href fallback (mobile)');
    window.location.href = url;
  } else {
    // Desktop fallback: Create invisible link and click it
    // This bypasses popup blockers in some browsers
    console.warn('[Navigation] Creating fallback link (desktop)');
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // If still failed, warn user
    setTimeout(() => {
      console.error('[Navigation] All methods failed. Please check popup blocker settings.');
    }, 100);
  }
}

/**
 * Open directions in external navigation app (LEGACY)
 * 
 * @deprecated Use openNavigation() for simpler API
 */
export function openDirections(
  location: Coordinates,
  placeId?: string,
  restaurantName?: string
): void {
  openNavigation(
    { lat: location.lat, lng: location.lng, placeId },
    { name: restaurantName }
  );
}

/**
 * Build Google Maps place URL (for viewing place details, not directions)
 * 
 * @param placeId Google Place ID
 * @returns Google Maps place URL
 */
export function buildPlaceUrl(placeId: string): string {
  return `https://www.google.com/maps/place/?q=place_id:${placeId}`;
}

/**
 * Build phone call URL (tel: protocol)
 * 
 * @param phoneNumber Phone number (any format)
 * @returns tel: URL for direct calling
 */
export function buildPhoneUrl(phoneNumber: string): string {
  // Remove non-numeric characters except + and spaces
  const cleaned = phoneNumber.replace(/[^\d+\s]/g, '');
  return `tel:${cleaned}`;
}

/**
 * Open phone dialer
 * 
 * @param phoneNumber Phone number
 */
export function openPhoneDialer(phoneNumber: string): void {
  const url = buildPhoneUrl(phoneNumber);
  window.location.href = url;
}
