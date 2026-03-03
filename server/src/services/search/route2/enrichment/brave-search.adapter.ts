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
import type { BraveSearchClient } from './brave-search-client.js';
import { selectBestUrlForProvider } from './provider-strategies/index.js';

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
   * @param signal - Optional request-scoped abort signal
   * @returns First valid URL or null
   */
  async searchWithRelaxPolicy(
    name: string,
    cityText: string | null,
    config: ProviderSearchConfig,
    signal?: AbortSignal
  ): Promise<string | null> {
    const policies: RelaxPolicy[] = ['strict', 'moderate', 'relaxed', 'minimal'];
    
    for (let i = 0; i < policies.length; i++) {
      const policy = policies[i];
      const attempt = i + 1;
      
      const query = this.buildQuery(name, cityText, config.provider, policy);

      try {
        const results = await this.client.search(query, 10, signal);

        const validUrl = selectBestUrlForProvider({
          results,
          name,
          cityText,
          config,
        });

        if (validUrl) {
          return validUrl;
        }
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

    logger.debug(
      { event: 'search_adapter_exhausted', provider: config.provider },
      '[BraveAdapter] All attempts exhausted'
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
