/**
 * Google Maps Result Mapper
 * Maps Google Place API responses to internal format
 */

/**
 * Map Google Place result (New API) to internal RestaurantResult shape
 * P0 Security Fix: Returns photo references only (no API keys)
 * 
 * New API response structure:
 * {
 *   id: "places/ChIJ...",
 *   displayName: { text: "...", languageCode: "..." },
 *   formattedAddress: "...",
 *   location: { latitude: ..., longitude: ... },
 *   rating: ...,
 *   userRatingCount: ...,
 *   priceLevel: "PRICE_LEVEL_...",
 *   currentOpeningHours: { openNow: true/false },
 *   photos: [{ name: "places/.../photos/..." }],
 *   types: [...],
 *   googleMapsUri: "..."
 * }
 */
export function mapGooglePlaceToResult(place: any): any {
  // Extract place ID from resource name (places/ChIJxxx -> ChIJxxx)
  const placeId = place.id ? place.id.split('/').pop() || place.id : 'unknown';

  return {
    id: placeId, // Use place_id as internal ID
    placeId: placeId,
    source: 'google_places' as const,
    name: place.displayName?.text || 'Unknown',
    address: place.formattedAddress || '',
    location: {
      lat: place.location?.latitude || 0,
      lng: place.location?.longitude || 0
    },
    rating: place.rating,
    userRatingsTotal: place.userRatingCount,
    priceLevel: parsePriceLevel(place.priceLevel),
    openNow: place.currentOpeningHours?.openNow !== undefined
      ? place.currentOpeningHours.openNow
      : 'UNKNOWN',
    // P0 Security: Return photo reference only (no key)
    photoReference: place.photos?.[0]
      ? buildPhotoReference(place.photos[0].name)
      : undefined,
    photoReferences: place.photos?.slice(0, 5).map((photo: any) =>
      buildPhotoReference(photo.name)
    ) || [],
    googleMapsUrl: place.googleMapsUri || `https://www.google.com/maps/place/?q=place_id:${placeId}`,
    tags: place.types || []
  };
}

/**
 * Build photo reference for New Places API
 * P0 Security Fix: Returns photo reference only (no API key)
 * Client must use backend proxy endpoint to fetch actual photo
 * Uses resource name format: places/{placeId}/photos/{photoId}
 */
function buildPhotoReference(photoName: string): string {
  // P0 Security: Return reference only, no key parameter
  // Format: places/{placeId}/photos/{photoId}
  return photoName;
}

/**
 * Parse price level from New API format
 * New API uses enum: "PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"
 * Legacy API uses numbers: 0, 1, 2, 3, 4
 */
function parsePriceLevel(priceLevel: string | undefined): number | undefined {
  if (!priceLevel) return undefined;

  const priceLevelMap: Record<string, number> = {
    'PRICE_LEVEL_FREE': 0,
    'PRICE_LEVEL_INEXPENSIVE': 1,
    'PRICE_LEVEL_MODERATE': 2,
    'PRICE_LEVEL_EXPENSIVE': 3,
    'PRICE_LEVEL_VERY_EXPENSIVE': 4
  };

  return priceLevelMap[priceLevel];
}
