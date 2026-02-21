/**
 * Provider Deep Link Resolver
 * 
 * Resolves restaurant deep links using "verified deep-links only" policy:
 * - L1: Search API with city (site:<host> "<name>" "<city>")
 * - L2: Search API without city (site:<host> "<name>")
 * - L3: NOT_FOUND with url=null (no fallback URLs)
 * 
 * Supports both Brave Search (preferred) and Google CSE (legacy fallback)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import { GoogleCSEClient, type CSEResult } from './google-cse-client.js';
import { BraveSearchClient } from './brave-search-client.js';
import { BraveSearchAdapter, type ProviderSearchConfig } from './brave-search.adapter.js';

/**
 * Supported providers
 */
export type Provider = 'wolt' | 'tenbis' | 'mishloha';

/**
 * Resolution input
 */
export interface ResolveInput {
  provider: Provider;
  name: string;
  cityText?: string | null | undefined;
}

/**
 * Resolution metadata
 */
export interface ResolutionMeta {
  layerUsed: 1 | 2 | 3;
  source: 'cse' | 'internal';
}

/**
 * Resolution result
 */
export interface ResolveResult {
  status: 'FOUND' | 'NOT_FOUND';
  url: string | null;
  meta: ResolutionMeta;
}

/**
 * Provider configuration
 */
interface ProviderConfig {
  allowedHosts: string[];
  internalSearchUrl: string;
  requiredPathSegments?: string[]; // Path segments for filtering (e.g., ['/restaurant/'] for Wolt)
}

/**
 * Provider configurations
 */
const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  wolt: {
    allowedHosts: ['wolt.com', '*.wolt.com'],
    internalSearchUrl: 'https://wolt.com/search',
    requiredPathSegments: ['/restaurant/'], // Only match restaurant pages
  },
  tenbis: {
    allowedHosts: ['10bis.co.il', '*.10bis.co.il'],
    internalSearchUrl: 'https://www.10bis.co.il/search',
    requiredPathSegments: ['/next/'], // Strict validation: only /next/(he|en)/r* restaurant pages
  },
  mishloha: {
    allowedHosts: ['mishloha.co.il', '*.mishloha.co.il'],
    internalSearchUrl: 'https://www.mishloha.co.il/search',
    requiredPathSegments: ['/now/r/'], // Strict validation: only /now/r/* restaurant pages
  },
};

/**
 * Provider Deep Link Resolver
 * 
 * Implements 3-layer resolution strategy with Brave/CSE + internal fallback
 */
export class ProviderDeepLinkResolver {
  private braveAdapter: BraveSearchAdapter | null = null;

  constructor(
    private cseClient: GoogleCSEClient | null,
    braveClient: BraveSearchClient | null = null
  ) {
    if (braveClient) {
      this.braveAdapter = new BraveSearchAdapter(braveClient);
    }
  }

  /**
   * Resolve restaurant deep link using 3-layer strategy
   * @param signal - Optional request-scoped abort signal
   */
  async resolve(input: ResolveInput, signal?: AbortSignal): Promise<ResolveResult> {
    const { provider, name, cityText } = input;
    const config = PROVIDER_CONFIGS[provider];

    // Log context at resolve start
    logger.debug(
      {
        event: 'provider_resolver_context',
        hasBraveAdapter: this.braveAdapter !== null,
        hasCseClient: this.cseClient !== null,
        provider,
        hasCityText: cityText !== null && cityText !== undefined,
        restaurantName: name,
      },
      `[ProviderResolver] Resolve context: Brave=${this.braveAdapter ? 'YES' : 'NO'}, CSE=${this.cseClient ? 'YES' : 'NO'}, provider=${provider}, city=${cityText ? 'YES' : 'NO'}`
    );

    // Prefer Brave Search (with RelaxPolicy)
    if (this.braveAdapter) {
      const braveResult = await this.tryBraveSearch(provider, name, cityText, config, signal);
      if (braveResult) {
        return braveResult;
      }
      
      // Brave exhausted all attempts, fall back to L3
      return this.buildL3Fallback(provider, name, config);
    }

    // Fallback to legacy CSE flow
    if (this.cseClient) {
      // L1: Try CSE with city (only if cityText available)
      if (cityText) {
        const l1Result = await this.tryLayer1(provider, name, cityText, config, signal);
        if (l1Result) {
          return l1Result;
        }
      }

      // L2: Try CSE without city
      const l2Result = await this.tryLayer2(provider, name, config, signal);
      if (l2Result) {
        return l2Result;
      }
    }

    // Guard: No search client available
    if (!this.braveAdapter && !this.cseClient) {
      logger.warn(
        {
          event: 'provider_link_resolution_skipped',
          provider,
          name,
          reason: 'no_search_client',
        },
        '[ProviderResolver] No search client available, using L3 fallback'
      );
    }

    // L3: Fallback to internal search URL
    return this.buildL3Fallback(provider, name, config);
  }

  /**
   * Try Brave Search with RelaxPolicy (4 attempts)
   * Returns result if found, null if exhausted
   */
  private async tryBraveSearch(
    provider: Provider,
    name: string,
    cityText: string | null | undefined,
    config: ProviderConfig,
    signal?: AbortSignal
  ): Promise<ResolveResult | null> {
    try {
      const searchConfig: ProviderSearchConfig = {
        provider,
        allowedHosts: config.allowedHosts,
        requiredPathSegments: config.requiredPathSegments || undefined,
      };

      const url = await this.braveAdapter!.searchWithRelaxPolicy(
        name,
        cityText ?? null,
        searchConfig,
        signal
      );

      if (url) {
        logger.info(
          {
            event: 'provider_link_resolved',
            provider,
            status: 'FOUND',
            layerUsed: 1,
            source: 'brave',
            urlHost: new URL(url).hostname,
            urlPath: new URL(url).pathname,
          },
          '[ProviderResolver] Brave Search succeeded'
        );

        return {
          status: 'FOUND',
          url,
          meta: {
            layerUsed: 1,
            source: 'cse', // Keep 'cse' for backward compatibility in metrics
          },
        };
      }

      logger.debug(
        {
          event: 'provider_link_brave_no_match',
          provider,
        },
        '[ProviderResolver] Brave Search exhausted all attempts'
      );

      return null;
    } catch (err) {
      logger.warn(
        {
          event: 'provider_link_brave_error',
          provider,
          error: err instanceof Error ? err.message : String(err),
        },
        '[ProviderResolver] Brave Search failed with error'
      );

      return null;
    }
  }

  /**
   * L1: CSE search with city (legacy)
   * Returns result if found, null if not found or error
   */
  private async tryLayer1(
    provider: Provider,
    name: string,
    cityText: string,
    config: ProviderConfig,
    signal?: AbortSignal
  ): Promise<ResolveResult | null> {
    const query = this.buildL1Query(provider, name, cityText);

    logger.debug(
      {
        event: 'provider_link_layer1_attempt',
        provider,
        name,
        cityText,
        query,
      },
      '[ProviderResolver] Attempting L1 (CSE with city)'
    );

    try {
      const results = await this.cseClient!.search(query, 5, signal);
      const validUrl = this.selectFirstValidUrl(results, config.allowedHosts);

      if (validUrl) {
        logger.info(
          {
            event: 'provider_link_resolved',
            provider,
            status: 'FOUND',
            layerUsed: 1,
            source: 'cse',
            urlHost: new URL(validUrl).hostname,
            query,
          },
          '[ProviderResolver] L1 succeeded'
        );

        return {
          status: 'FOUND',
          url: validUrl,
          meta: {
            layerUsed: 1,
            source: 'cse',
          },
        };
      }

      logger.debug(
        {
          event: 'provider_link_layer1_no_match',
          provider,
          resultCount: results.length,
        },
        '[ProviderResolver] L1 returned no valid matches'
      );

      return null;
    } catch (err) {
      logger.warn(
        {
          event: 'provider_link_layer1_error',
          provider,
          error: err instanceof Error ? err.message : String(err),
        },
        '[ProviderResolver] L1 failed with error'
      );
      
      return null;
    }
  }

  /**
   * L2: CSE search without city
   * Returns result if found, null if not found or error
   */
  private async tryLayer2(
    provider: Provider,
    name: string,
    config: ProviderConfig,
    signal?: AbortSignal
  ): Promise<ResolveResult | null> {
    const query = this.buildL2Query(provider, name);

    logger.debug(
      {
        event: 'provider_link_layer2_attempt',
        provider,
        name,
        query,
      },
      '[ProviderResolver] Attempting L2 (CSE without city)'
    );

    try {
      const results = await this.cseClient!.search(query, 5, signal);
      const validUrl = this.selectFirstValidUrl(results, config.allowedHosts);

      if (validUrl) {
        logger.info(
          {
            event: 'provider_link_resolved',
            provider,
            status: 'FOUND',
            layerUsed: 2,
            source: 'cse',
            urlHost: new URL(validUrl).hostname,
            query,
          },
          '[ProviderResolver] L2 succeeded'
        );

        return {
          status: 'FOUND',
          url: validUrl,
          meta: {
            layerUsed: 2,
            source: 'cse',
          },
        };
      }

      logger.debug(
        {
          event: 'provider_link_layer2_no_match',
          provider,
          resultCount: results.length,
        },
        '[ProviderResolver] L2 returned no valid matches'
      );

      return null;
    } catch (err) {
      logger.warn(
        {
          event: 'provider_link_layer2_error',
          provider,
          error: err instanceof Error ? err.message : String(err),
        },
        '[ProviderResolver] L2 failed with error'
      );
      
      return null;
    }
  }

  /**
   * L3: No fallback - return NOT_FOUND with null URL
   * Enforces "verified deep-links only" policy
   */
  private buildL3Fallback(
    provider: Provider,
    name: string,
    config: ProviderConfig
  ): ResolveResult {
    logger.info(
      {
        event: 'provider_not_found_no_url',
        provider,
        status: 'NOT_FOUND',
        restaurantName: name,
        reason: 'no_verified_deeplink',
      },
      '[ProviderResolver] NOT_FOUND: No verified deep-link found (no fallback)'
    );

    return {
      status: 'NOT_FOUND',
      url: null, // No fallback URL - verified deep-links only
      meta: {
        layerUsed: 3,
        source: 'internal',
      },
    };
  }

  /**
   * Build L1 query: site:<host> "<name>" "<city>"
   */
  private buildL1Query(provider: Provider, name: string, cityText: string): string {
    const primaryHost = this.getPrimaryHost(provider);
    return `site:${primaryHost} "${name}" "${cityText}"`;
  }

  /**
   * Build L2 query: site:<host> "<name>"
   */
  private buildL2Query(provider: Provider, name: string): string {
    const primaryHost = this.getPrimaryHost(provider);
    return `site:${primaryHost} "${name}"`;
  }

  /**
   * Get primary host for provider (without wildcard)
   */
  private getPrimaryHost(provider: Provider): string {
    const config = PROVIDER_CONFIGS[provider];
    // Return first non-wildcard host
    const nonWildcardHost = config.allowedHosts.find((h) => !h.startsWith('*'));
    return nonWildcardHost || config.allowedHosts[0] || '';
  }

  /**
   * Select first valid URL from CSE results
   * 
   * Valid = matches allowlisted hosts
   */
  private selectFirstValidUrl(
    results: CSEResult[],
    allowedHosts: string[]
  ): string | null {
    for (const result of results) {
      if (this.isValidUrl(result.url, allowedHosts)) {
        return result.url;
      }
    }
    return null;
  }

  /**
   * Check if URL matches allowlisted hosts
   * 
   * Supports wildcards: *.example.com matches foo.example.com
   */
  private isValidUrl(url: string, allowedHosts: string[]): boolean {
    try {
      const parsedUrl = new URL(url);
      const hostname = parsedUrl.hostname.toLowerCase();

      for (const allowedHost of allowedHosts) {
        if (allowedHost.startsWith('*.')) {
          // Wildcard match: *.wolt.com matches foo.wolt.com
          const baseDomain = allowedHost.substring(2).toLowerCase();
          if (hostname === baseDomain || hostname.endsWith(`.${baseDomain}`)) {
            return true;
          }
        } else {
          // Exact match
          if (hostname === allowedHost.toLowerCase()) {
            return true;
          }
        }
      }

      return false;
    } catch {
      // Invalid URL
      return false;
    }
  }
}

/**
 * Create resolver from environment variables
 */
export function createResolverFromEnv(): ProviderDeepLinkResolver {
  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY;
  const googleApiKey = process.env.GOOGLE_CSE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CSE_ENGINE_ID;
  const nodeEnv = process.env.NODE_ENV || 'development';

  let braveClient: BraveSearchClient | null = null;
  let cseClient: GoogleCSEClient | null = null;
  
  // BOOT log: Brave Search client initialization
  if (braveApiKey) {
    braveClient = new BraveSearchClient({
      apiKey: braveApiKey,
      timeoutMs: 5000,
      maxRetries: 2,
    });
    
    logger.info(
      {
        event: 'search_client_created',
        engine: 'brave',
        timeoutMs: 5000,
        maxRetries: 2,
      },
      '[BOOT] Brave Search client created successfully'
    );
  }
  
  // BOOT log: CSE client initialization (fallback)
  const cseEnabled = Boolean(googleApiKey && searchEngineId);
  
  if (googleApiKey && searchEngineId) {
    cseClient = new GoogleCSEClient({
      apiKey: googleApiKey,
      searchEngineId,
      timeoutMs: 5000,
      maxRetries: 2,
    });
    
    logger.info(
      {
        event: 'search_client_created',
        engine: 'google_cse',
        timeoutMs: 5000,
        maxRetries: 2,
      },
      '[BOOT] Google CSE client created successfully (fallback)'
    );
  }

  // Log final search engine status
  const searchEngine = braveClient ? 'brave' : cseClient ? 'google_cse' : 'none';
  
  logger.info(
    {
      event: 'provider_resolver_engine',
      engine: searchEngine,
      braveEnabled: Boolean(braveClient),
      cseEnabled: Boolean(cseClient),
      nodeEnv,
    },
    `[BOOT] Provider Resolver Engine: ${searchEngine.toUpperCase()} ${!braveClient && !cseClient ? '(L3 fallback only)' : ''}`
  );

  if (!braveClient && !cseClient) {
    logger.warn(
      {
        event: 'provider_resolver_no_search',
        reason: 'no_api_keys',
      },
      '[BOOT] No search API configured, resolver will use L3 fallback only'
    );
  }

  return new ProviderDeepLinkResolver(cseClient, braveClient);
}
