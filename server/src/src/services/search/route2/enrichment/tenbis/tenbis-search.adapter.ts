/**
 * 10bis Search Adapter Interface
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
export interface TenbisSearchAdapter {
  /**
   * Search the web for 10bis restaurant pages
   * 
   * @param query - Search query (e.g., "Pizza House Tel Aviv site:10bis.co.il")
   * @param limit - Maximum number of results to return
   * @returns Array of search results
   */
  searchWeb(query: string, limit: number): Promise<SearchResult[]>;
}

/**
 * Build search query for 10bis restaurant
 * 
 * Format: "${name}" "${cityText}" site:10bis.co.il
 * 
 * @param name - Restaurant name
 * @param cityText - City name (optional)
 * @returns Search query string
 */
export function buildTenbisSearchQuery(name: string, cityText: string | null): string {
  const parts: string[] = [];

  // Add restaurant name in quotes for exact match
  parts.push(`"${name}"`);

  // Add city in quotes if available
  if (cityText) {
    parts.push(`"${cityText}"`);
  }

  // Restrict to 10bis.co.il domain
  parts.push('site:10bis.co.il');

  return parts.join(' ');
}
