/**
 * Metrics Collector for Provider Enrichments
 * 
 * Tracks and aggregates metrics for provider enrichment operations:
 * - Provider layer distribution (per requestId)
 * - CSE calls per request
 * - Cache hit rates
 * - Job completion times
 */

import { logger } from '../../../../lib/logger/structured-logger.js';

/**
 * Provider enrichment metrics for a single request
 */
export interface ProviderMetrics {
  requestId: string;
  
  // Provider distribution
  providers: {
    wolt?: {
      found: number;
      notFound: number;
      pending: number;
      cached: number;
      jobsTriggered: number;
    };
    tenbis?: {
      found: number;
      notFound: number;
      pending: number;
      cached: number;
      jobsTriggered: number;
    };
  };
  
  // Cost metrics
  cseCallsTotal: number;
  totalRestaurants: number;
  enrichedRestaurants: number;
  
  // Timing
  startTime: number;
  endTime?: number;
  durationMs?: number;
}

/**
 * Metrics Collector
 * 
 * Accumulates metrics per request and logs aggregated results
 */
export class MetricsCollector {
  private metrics: Map<string, ProviderMetrics> = new Map();

  /**
   * Initialize metrics for a request
   */
  initRequest(requestId: string, totalRestaurants: number): void {
    this.metrics.set(requestId, {
      requestId,
      providers: {},
      cseCallsTotal: 0,
      totalRestaurants,
      enrichedRestaurants: 0,
      startTime: Date.now(),
    });
  }

  /**
   * Record a cache hit for a provider
   */
  recordCacheHit(requestId: string, provider: 'wolt' | 'tenbis', status: 'FOUND' | 'NOT_FOUND'): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    if (!metrics.providers[provider]) {
      metrics.providers[provider] = {
        found: 0,
        notFound: 0,
        pending: 0,
        cached: 0,
        jobsTriggered: 0,
      };
    }

    metrics.providers[provider].cached++;
    if (status === 'FOUND') {
      metrics.providers[provider].found++;
    } else {
      metrics.providers[provider].notFound++;
    }
  }

  /**
   * Record a cache miss (job triggered)
   */
  recordCacheMiss(requestId: string, provider: 'wolt' | 'tenbis'): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    if (!metrics.providers[provider]) {
      metrics.providers[provider] = {
        found: 0,
        notFound: 0,
        pending: 0,
        cached: 0,
        jobsTriggered: 0,
      };
    }

    metrics.providers[provider].pending++;
    metrics.providers[provider].jobsTriggered++;
  }

  /**
   * Record a CSE API call
   */
  recordCseCall(requestId: string): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    metrics.cseCallsTotal++;
  }

  /**
   * Record enrichment completed for a restaurant
   */
  recordEnrichmentCompleted(requestId: string, provider: 'wolt' | 'tenbis', status: 'FOUND' | 'NOT_FOUND'): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    if (!metrics.providers[provider]) {
      metrics.providers[provider] = {
        found: 0,
        notFound: 0,
        pending: 0,
        cached: 0,
        jobsTriggered: 0,
      };
    }

    // Update from PENDING to final status
    if (metrics.providers[provider].pending > 0) {
      metrics.providers[provider].pending--;
    }
    
    if (status === 'FOUND') {
      metrics.providers[provider].found++;
    } else {
      metrics.providers[provider].notFound++;
    }

    metrics.enrichedRestaurants++;
  }

  /**
   * Finalize and log metrics for a request
   */
  finalizeRequest(requestId: string): void {
    const metrics = this.metrics.get(requestId);
    if (!metrics) return;

    metrics.endTime = Date.now();
    metrics.durationMs = metrics.endTime - metrics.startTime;

    // Log aggregated metrics
    logger.info(
      {
        event: 'provider_enrichment_metrics',
        requestId,
        totalRestaurants: metrics.totalRestaurants,
        enrichedRestaurants: metrics.enrichedRestaurants,
        cseCallsTotal: metrics.cseCallsTotal,
        durationMs: metrics.durationMs,
        providers: {
          wolt: metrics.providers.wolt || null,
          tenbis: metrics.providers.tenbis || null,
        },
      },
      '[Metrics] Provider enrichment completed'
    );

    // Log provider layer distribution (requested by user)
    this.logProviderLayerDistribution(requestId, metrics);

    // Log CSE calls per request (requested by user)
    this.logCseCallsPerRequest(requestId, metrics);

    // Clean up old metrics (keep last 100 requests)
    if (this.metrics.size > 100) {
      const oldestKey = this.metrics.keys().next().value;
      if (oldestKey) {
        this.metrics.delete(oldestKey);
      }
    }
  }

  /**
   * Log provider layer distribution
   */
  private logProviderLayerDistribution(requestId: string, metrics: ProviderMetrics): void {
    const distribution: Record<string, number> = {};

    for (const [provider, stats] of Object.entries(metrics.providers)) {
      distribution[`${provider}_found`] = stats.found;
      distribution[`${provider}_not_found`] = stats.notFound;
      distribution[`${provider}_pending`] = stats.pending;
      distribution[`${provider}_cached`] = stats.cached;
    }

    logger.info(
      {
        event: 'provider_layer_distribution',
        requestId,
        distribution,
        totalRestaurants: metrics.totalRestaurants,
      },
      '[Metrics] Provider layer distribution'
    );
  }

  /**
   * Log CSE calls per request
   */
  private logCseCallsPerRequest(requestId: string, metrics: ProviderMetrics): void {
    logger.info(
      {
        event: 'cse_calls_per_request',
        requestId,
        cseCallsTotal: metrics.cseCallsTotal,
        totalRestaurants: metrics.totalRestaurants,
        callsPerRestaurant: metrics.totalRestaurants > 0 
          ? (metrics.cseCallsTotal / metrics.totalRestaurants).toFixed(2) 
          : 0,
      },
      '[Metrics] CSE calls per request'
    );
  }

  /**
   * Get current metrics for a request
   */
  getMetrics(requestId: string): ProviderMetrics | undefined {
    return this.metrics.get(requestId);
  }
}

// Singleton instance
let collectorInstance: MetricsCollector | null = null;

/**
 * Get or create the shared metrics collector instance
 */
export function getMetricsCollector(): MetricsCollector {
  if (!collectorInstance) {
    collectorInstance = new MetricsCollector();
  }
  return collectorInstance;
}

/**
 * Reset collector instance (for testing)
 */
export function resetMetricsCollector(): void {
  collectorInstance = null;
}
