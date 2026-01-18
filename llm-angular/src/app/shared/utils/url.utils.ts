/**
 * URL utility functions for safe URL construction
 * Prevents trailing slash issues in production
 */

/**
 * Join URL segments safely, handling trailing/leading slashes
 * @param base - Base URL (e.g., "https://api.example.com/" or "/api/v1")
 * @param path - Path to append (e.g., "/search/req-123/result/")
 * @returns Clean URL without trailing slash
 * 
 * @example
 * joinUrl("https://api.example.com/", "/api/v1/search/req-123/result/")
 * // Returns: "https://api.example.com/api/v1/search/req-123/result"
 * 
 * joinUrl("/api/v1", "/search/req-123/result")
 * // Returns: "/api/v1/search/req-123/result"
 * 
 * joinUrl("/api/v1/", "search")
 * // Returns: "/api/v1/search"
 */
export function joinUrl(base: string, path: string): string {
  // Trim trailing slashes from base
  const cleanBase = base.replace(/\/+$/, '');
  
  // Trim leading slashes from path and ensure it starts with single slash
  const cleanPath = path.replace(/^\/+/, '');
  
  // Join with single slash and remove trailing slashes
  const joined = cleanPath ? `${cleanBase}/${cleanPath}` : cleanBase;
  
  // Remove trailing slashes from final result
  return joined.replace(/\/+$/, '');
}

/**
 * Normalize URL by removing trailing slashes
 * @param url - URL to normalize
 * @returns URL without trailing slash (unless it's root "/")
 * 
 * @example
 * normalizeUrl("/api/v1/search/")
 * // Returns: "/api/v1/search"
 * 
 * normalizeUrl("/")
 * // Returns: "/"
 */
export function normalizeUrl(url: string): string {
  // Keep root "/" as-is
  if (url === '/') {
    return url;
  }
  
  // Remove trailing slashes
  return url.replace(/\/+$/, '');
}
