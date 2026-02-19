/**
 * Wolt Search Adapter Interface
 * 
 * Abstraction for web search providers (Google Search API, Bing, etc.)
 * Do NOT hardcode a specific provider in core logic.
 */

/**
 * Search result from web search provider
 */
export interface SearchResult {
  /**
   * Result title (page title)
   */
  title: string;

  /**
   * Result URL
   */
  url: string;

  /**
   * Result snippet (description/excerpt)
   */
  snippet: string;
}

/**
 * Search adapter interface
 * Implement this for different search providers (Google, Bing, etc.)
 */
export interface WoltSearchAdapter {
  /**
   * Search the web for Wolt restaurant pages
   * 
   * @param query - Search query (e.g., "Pizza House Tel Aviv site:wolt.com")
   * @param limit - Maximum number of results to return
   * @returns Array of search results
   */
  searchWeb(query: string, limit: number): Promise<SearchResult[]>;
}

/**
 * Build search query for Wolt restaurant
 * 
 * Format: "${name}" "${cityText}" site:wolt.com
 * 
 * @param name - Restaurant name
 * @param cityText - City name (optional)
 * @returns Search query string
 */
export function buildWoltSearchQuery(name: string, cityText: string | null): string {
  const parts: string[] = [];

  // Add restaurant name in quotes for exact match
  parts.push(`"${name}"`);

  // Add city in quotes if available
  if (cityText) {
    parts.push(`"${cityText}"`);
  }

  // Restrict to wolt.com domain
  parts.push('site:wolt.com');

  return parts.join(' ');
}
