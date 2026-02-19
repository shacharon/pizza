/**
 * Query Composer
 * Intelligently composes search queries for Google Places
 * Avoids duplication when city is already mentioned
 */

export class QueryComposer {
  /**
   * Compose a city-aware query
   * Appends city name if not already present in the query
   * 
   * @param query - The user's search query (e.g., "romantic restaurant", "pizza")
   * @param cityName - The target city name (e.g., "Tel Aviv", "תל אביב")
   * @returns Composed query string
   * 
   * @example
   * composeCityQuery("pizza", "Tel Aviv") → "pizza Tel Aviv"
   * composeCityQuery("pizza Tel Aviv", "Tel Aviv") → "pizza Tel Aviv" (no duplication)
   * composeCityQuery("פיצה", "תל אביב") → "פיצה תל אביב"
   */
  static composeCityQuery(query: string, cityName?: string): string {
    if (!cityName) {
      return query;
    }

    // Normalize for comparison
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedCity = cityName.toLowerCase().trim();

    // Check if city already mentioned in query
    if (normalizedQuery.includes(normalizedCity)) {
      return query; // City already present, don't duplicate
    }

    // Append city to query
    return `${query} ${cityName}`;
  }

  /**
   * Check if a query already contains a city reference
   * Used for validation and testing
   */
  static containsCity(query: string, cityName: string): boolean {
    const normalizedQuery = query.toLowerCase().trim();
    const normalizedCity = cityName.toLowerCase().trim();
    return normalizedQuery.includes(normalizedCity);
  }
}













