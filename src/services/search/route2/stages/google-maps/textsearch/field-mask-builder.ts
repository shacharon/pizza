/**
 * Field Mask Builder
 * Constructs Google Places API field mask for Text Search requests
 * 
 * Field mask determines which fields are returned in the API response.
 * Minimize fields to reduce latency and costs.
 */

/**
 * Get the default field mask for Text Search API
 * Includes: id, name, address, location, ratings, price, hours, photos, types, maps URL
 * 
 * @returns Field mask string for X-Goog-FieldMask header
 */
export function getTextSearchFieldMask(): string {
  return 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.currentOpeningHours,places.regularOpeningHours,places.utcOffsetMinutes,places.photos,places.types,places.googleMapsUri,places.businessStatus';
}
