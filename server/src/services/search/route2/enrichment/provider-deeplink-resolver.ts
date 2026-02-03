/**
 * Provider Deep Link Resolver
 * 
 * Resolves restaurant deep links using 3-layer strategy:
 * - L1: CSE search with city (site:<host> "<name>" "<city>")
 * - L2: CSE search without city (site:<host> "<name>")
 * - L3: Internal search fallback (https://<host>/search?q=<name>)
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import { GoogleCSEClient, type CSEResult } from './google-cse-client.js';

/**
 * Supported providers
 */
export type Provider = 'wolt' | 'tenbis';

/**
 * Resolution input
 */
export interface ResolveInput {
  provider: Provider;
  name: string;
  cityText?: string | null;
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
}

/**
 * Provider configurations
 */
const PROVIDER_CONFIGS: Record<Provider, ProviderConfig> = {
  wolt: {
    allowedHosts: ['wolt.com', '*.wolt.com'],
    internalSearchUrl: 'https://wolt.com/search',
  },
  tenbis: {
    allowedHosts: ['10bis.co.il', '*.10bis.co.il'],
    internalSearchUrl: 'https://www.10bis.co.il/search',
  },
};

/**
 * Provider Deep Link Resolver
 * 
 * Implements 3-layer resolution strategy with CSE + internal fallback
 */
export class ProviderDeepLinkResolver {
  constructor(private cseClient: GoogleCSEClient | null) {}

  /**
   * Resolve restaurant deep link using 3-layer strategy
   * 
   * @param input - Restaurant and provider info
   * @returns Resolution result with status, URL, and metadata
   */
  async resolve(input: ResolveInput): Promise<ResolveResult> {
    const { provider, name, cityText } = input;
    const config = PROVIDER_CONFIGS[provider];

    // Guard: No CSE client available
    if (!this.cseClient) {
      logger.warn(
        {
          event: 'provider_link_resolution_skipped',
          provider,
          name,
          reason: 'no_cse_client',
        },
        '[ProviderResolver] CSE client not available, using L3 fallback'
      );
      
      return this.buildL3Fallback(provider, name, config);
    }

    // L1: Try CSE with city (only if cityText available)
    if (cityText) {
      const l1Result = await this.tryLayer1(provider, name, cityText, config);
      if (l1Result) {
        return l1Result;
      }
    }

    // L2: Try CSE without city
    const l2Result = await this.tryLayer2(provider, name, config);
    if (l2Result) {
      return l2Result;
    }

    // L3: Fallback to internal search URL
    return this.buildL3Fallback(provider, name, config);
  }

  /**
   * L1: CSE search with city
   * Returns result if found, null if not found or error
   */
  private async tryLayer1(
    provider: Provider,
    name: string,
    cityText: string,
    config: ProviderConfig
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
      const results = await this.cseClient!.search(query, 5);
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
    config: ProviderConfig
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
      const results = await this.cseClient!.search(query, 5);
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
   * L3: Internal search fallback
   * Always returns a result (status=NOT_FOUND, but url=search link)
   */
  private buildL3Fallback(
    provider: Provider,
    name: string,
    config: ProviderConfig
  ): ResolveResult {
    const searchUrl = `${config.internalSearchUrl}?q=${encodeURIComponent(name)}`;

    logger.info(
      {
        event: 'provider_link_resolved',
        provider,
        status: 'NOT_FOUND',
        layerUsed: 3,
        source: 'internal',
        urlHost: new URL(searchUrl).hostname,
      },
      '[ProviderResolver] L3 fallback (internal search)'
    );

    return {
      status: 'NOT_FOUND', // L3 is NOT_FOUND but provides search URL
      url: searchUrl,
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
    return config.allowedHosts.find((h) => !h.startsWith('*')) || config.allowedHosts[0];
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
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const searchEngineId = process.env.GOOGLE_CSE_ENGINE_ID;

  let cseClient: GoogleCSEClient | null = null;
  
  if (apiKey && searchEngineId) {
    cseClient = new GoogleCSEClient({
      apiKey,
      searchEngineId,
      timeoutMs: 5000,
      maxRetries: 2,
    });
  } else {
    logger.warn(
      {
        event: 'provider_resolver_no_cse',
        hasApiKey: Boolean(apiKey),
        hasEngineId: Boolean(searchEngineId),
      },
      '[ProviderResolver] CSE not configured, will use L3 fallback only'
    );
  }

  return new ProviderDeepLinkResolver(cseClient);
}
