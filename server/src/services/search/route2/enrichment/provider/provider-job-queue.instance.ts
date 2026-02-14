/**
 * Provider Job Queue Singleton Instances
 * 
 * Provides shared job queue instances for each provider across the application.
 * One queue instance per provider (wolt, tenbis, mishloha).
 */

import { ProviderJobQueue } from './provider-job-queue.js';
import { createResolverFromEnv } from '../provider-deeplink-resolver.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import type { ProviderId } from './provider.contracts.js';

/**
 * Singleton job queue instances (one per provider)
 */
const queueInstances = new Map<ProviderId, ProviderJobQueue>();

/**
 * Get or create the shared job queue instance for a provider
 * 
 * @param providerId - Provider ID (wolt, tenbis, mishloha)
 * @returns ProviderJobQueue instance
 */
export function getProviderJobQueue(providerId: ProviderId): ProviderJobQueue {
  const existing = queueInstances.get(providerId);
  if (existing) {
    return existing;
  }

  // Create resolver (handles CSE + 3-layer fallback internally)
  const resolver = createResolverFromEnv();
  
  logger.info(
    {
      event: 'provider_worker_boot',
      providerId,
      resolverType: 'provider_deeplink_resolver',
      enabledFlag: process.env[`ENABLE_${providerId.toUpperCase()}_ENRICHMENT`] === 'true',
      hasCSE: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ENGINE_ID),
    },
    `[BOOT] ${providerId} job queue created with ProviderDeepLinkResolver`
  );

  // Create queue instance
  const queue = new ProviderJobQueue(providerId, resolver);
  queueInstances.set(providerId, queue);

  return queue;
}

/**
 * Reset queue instance for a provider (for testing)
 */
export function resetProviderJobQueue(providerId: ProviderId): void {
  queueInstances.delete(providerId);
}

/**
 * Reset all queue instances (for testing)
 */
export function resetAllProviderJobQueues(): void {
  queueInstances.clear();
}
