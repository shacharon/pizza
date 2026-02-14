/**
 * Brave Search Adapter
 * 
 * Adapts Brave Search API to provider-deeplink-resolver interface.
 * Implements:
 * - RelaxPolicy: progressive query relaxation across 4 attempts
 * - Path filtering: filter results by provider-specific path segments
 * - City/slug matching: prefer results with city segments in URL
 * - Name normalization: slug-based restaurant name matching
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { BraveSearchClient, SearchResult } from './brave-search-client.js';

/**
 * Relax policy: progressive query relaxation
 * Attempt 1-4 with decreasing specificity
 */
type RelaxPolicy = 'strict' | 'moderate' | 'relaxed' | 'minimal';

/**
 * Provider-specific search configuration
 */
export interface ProviderSearchConfig {
  provider: 'wolt' | 'tenbis' | 'mishloha';
  allowedHosts: string[];
  requiredPathSegments?: string[] | undefined; // e.g., ['/restaurant/'] for Wolt
}

/**
 * Brave Search Adapter
 * 
 * Provides progressive query relaxation and smart result filtering
 */
export class BraveSearchAdapter {
  constructor(private client: BraveSearchClient) {}

  /**
   * Search with progressive query relaxation
   * 
   * Attempts 4 queries with decreasing specificity:
   * 1. Strict: site:<host> "<name>" "<city>"
   * 2. Moderate: site:<host> "<name>" city (no quotes on city)
   * 3. Relaxed: site:<host> "<name>"
   * 4. Minimal: site:<host> name (no quotes)
   * 
   * Filters results by:
   * - Host allowlist
   * - Required path segments (e.g., /restaurant/)
   * - Prefers URLs with city slug
   * - Prefers URLs with name slug
   * 
   * @param name - Restaurant name
   * @param cityText - Optional city name
   * @param config - Provider-specific configuration
   * @returns First valid URL or null
   */
  async searchWithRelaxPolicy(
    name: string,
    cityText: string | null,
    config: ProviderSearchConfig
  ): Promise<string | null> {
    const policies: RelaxPolicy[] = ['strict', 'moderate', 'relaxed', 'minimal'];
    
    for (let i = 0; i < policies.length; i++) {
      const policy = policies[i];
      const attempt = i + 1;
      
      const query = this.buildQuery(name, cityText, config.provider, policy);
      
      logger.debug(
        {
          event: 'search_adapter_attempt',
          provider: config.provider,
          policy,
          attempt,
          query,
        },
        `[BraveAdapter] Attempt ${attempt}/${policies.length} (${policy})`
      );

      try {
        const results = await this.client.search(query, 10);
        
        logger.debug(
          {
            event: 'search_adapter_raw_results',
            provider: config.provider,
            policy,
            attempt,
            resultCount: results.length,
          },
          `[BraveAdapter] Got ${results.length} raw results`
        );

        // Filter and rank results
        const validUrl = this.selectBestUrl(
          results,
          name,
          cityText,
          config
        );

        if (validUrl) {
          logger.info(
            {
              event: 'search_adapter_match',
              provider: config.provider,
              policy,
              attempt,
              urlHost: new URL(validUrl).hostname,
              urlPath: new URL(validUrl).pathname,
            },
            `[BraveAdapter] Match found on attempt ${attempt} (${policy})`
          );
          
          return validUrl;
        }

        logger.debug(
          {
            event: 'search_adapter_no_match',
            provider: config.provider,
            policy,
            attempt,
          },
          `[BraveAdapter] No valid matches for attempt ${attempt}`
        );
        
      } catch (err) {
        logger.warn(
          {
            event: 'search_adapter_attempt_error',
            provider: config.provider,
            policy,
            attempt,
            error: err instanceof Error ? err.message : String(err),
          },
          `[BraveAdapter] Attempt ${attempt} failed`
        );
        
        // Continue to next policy on error
      }
    }

    // All attempts exhausted
    logger.info(
      {
        event: 'search_adapter_exhausted',
        provider: config.provider,
        attemptsTotal: policies.length,
      },
      '[BraveAdapter] All attempts exhausted, no matches'
    );

    return null;
  }

  /**
   * Build query based on relax policy
   */
  private buildQuery(
    name: string,
    cityText: string | null,
    provider: string,
    policy: RelaxPolicy | undefined
  ): string {
    const host = this.getProviderHost(provider);

    switch (policy) {
      case 'strict':
        // Attempt 1: site:<host> "<name>" "<city>" (only if city available)
        if (cityText) {
          return `site:${host} "${name}" "${cityText}"`;
        }
        // Fall through to moderate if no city
        
      case 'moderate':
        // Attempt 2: site:<host> "<name>" city (no quotes on city)
        if (cityText) {
          return `site:${host} "${name}" ${cityText}`;
        }
        // Fall through to relaxed if no city
        
      case 'relaxed':
        // Attempt 3: site:<host> "<name>"
        return `site:${host} "${name}"`;
        
      case 'minimal':
        // Attempt 4: site:<host> name (no quotes)
        return `site:${host} ${name}`;
        
      default:
        return `site:${host} "${name}"`;
    }
  }

  /**
   * Select best URL from results
   * 
   * Scoring factors:
   * 1. Must match host allowlist
   * 2. Must match required path segments (e.g., /restaurant/)
   * 3. Prefer URLs with city slug
   * 4. Prefer URLs with normalized name slug
   */
  private selectBestUrl(
    results: SearchResult[],
    name: string,
    cityText: string | null,
    config: ProviderSearchConfig
  ): string | null {
    const normalizedName = this.normalizeForSlug(name);
    const normalizedCity = cityText ? this.normalizeForSlug(cityText) : null;

    // Filter valid results
    const validResults = results
      .filter((result) => this.isValidUrl(result.url, config))
      .map((result) => ({
        result,
        score: this.scoreUrl(result.url, normalizedName, normalizedCity),
      }))
      .filter((item) => item.score > 0) // Must have positive score
      .sort((a, b) => b.score - a.score); // Sort by score descending

    if (validResults.length === 0) {
      return null;
    }

    const bestResult = validResults[0];
    
    if (!bestResult) {
      return null;
    }
    
    logger.debug(
      {
        event: 'search_adapter_scoring',
        provider: config.provider,
        totalResults: results.length,
        validResults: validResults.length,
        bestScore: bestResult.score,
        bestUrl: bestResult.result.url,
        allScores: validResults.map(v => ({ url: v.result.url, score: v.score })),
      },
      '[BraveAdapter] Result scoring completed'
    );

    return bestResult.result.url;
  }

  /**
   * Check if URL is valid for provider
   * 
   * Validates:
   * - Host matches allowlist
   * - Path contains required segments (if specified)
   */
  private isValidUrl(url: string, config: ProviderSearchConfig): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname.toLowerCase();

      // Check host allowlist
      const hostMatches = config.allowedHosts.some((allowedHost) => {
        if (allowedHost.startsWith('*.')) {
          const baseDomain = allowedHost.substring(2).toLowerCase();
          return hostname === baseDomain || hostname.endsWith(`.${baseDomain}`);
        } else {
          return hostname === allowedHost.toLowerCase();
        }
      });

      if (!hostMatches) {
        logger.info(
          {
            event: 'provider_url_rejected',
            provider: config.provider,
            url,
            hostname,
            allowedHosts: config.allowedHosts,
            reason: 'host_not_in_allowlist',
          },
          '[BraveAdapter] URL rejected: host not in allowlist'
        );
        
        return false;
      }

      // Check required path segments
      if (config.requiredPathSegments && config.requiredPathSegments.length > 0) {
        const hasRequiredPath = config.requiredPathSegments.some((segment) =>
          pathname.includes(segment.toLowerCase())
        );
        
        if (!hasRequiredPath) {
          logger.info(
            {
              event: 'provider_url_rejected',
              provider: config.provider,
              url,
              pathname,
              requiredSegments: config.requiredPathSegments,
              reason: 'missing_required_path_segment',
            },
            '[BraveAdapter] URL rejected: missing required path segment'
          );
          
          return false;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Score URL based on relevance factors
   * 
   * Scoring:
   * - Base: 1 (valid result)
   * - City slug match: +2
   * - Name slug match: +3
   */
  private scoreUrl(
    url: string,
    normalizedName: string,
    normalizedCity: string | null
  ): number {
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      let score = 1; // Base score for valid result

      // Check for city slug in path
      if (normalizedCity && pathname.includes(normalizedCity)) {
        score += 2;
      }

      // Check for name slug in path
      if (pathname.includes(normalizedName)) {
        score += 3;
      }

      return score;
    } catch {
      return 0;
    }
  }

  /**
   * Normalize text for slug matching
   * 
   * - Lowercase
   * - Remove special chars
   * - Replace spaces with hyphens
   * - Collapse multiple hyphens
   */
  private normalizeForSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD') // Decompose accents
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s-]/g, '') // Keep only alphanumeric, spaces, hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Trim hyphens
  }

  /**
   * Get primary host for provider
   */
  private getProviderHost(provider: string): string {
    const hostMap: Record<string, string> = {
      wolt: 'wolt.com',
      tenbis: '10bis.co.il',
      mishloha: 'mishloha.co.il',
    };
    
    return hostMap[provider] || provider;
  }
}
