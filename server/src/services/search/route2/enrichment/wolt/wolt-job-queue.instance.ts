/**
 * Wolt Job Queue Singleton Instance
 * 
 * Provides a shared job queue instance across the application.
 */

import { WoltJobQueue } from './wolt-job-queue.js';
import { createResolverFromEnv } from '../provider-deeplink-resolver.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

/**
 * Singleton job queue instance
 */
let queueInstance: WoltJobQueue | null = null;

/**
 * Get or create the shared job queue instance
 * 
 * @returns WoltJobQueue instance
 */
export function getWoltJobQueue(): WoltJobQueue {
  if (queueInstance) {
    return queueInstance;
  }

  // Create resolver (handles CSE + 3-layer fallback internally)
  const resolver = createResolverFromEnv();
  
  logger.info(
    {
      event: 'wolt_worker_boot',
      resolverType: 'provider_deeplink_resolver',
      enabledFlag: process.env.ENABLE_WOLT_ENRICHMENT === 'true',
      hasCSE: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ENGINE_ID),
    },
    '[BOOT] Wolt job queue created with ProviderDeepLinkResolver'
  );

  // Create queue instance
  queueInstance = new WoltJobQueue(resolver);

  return queueInstance;
}

/**
 * Reset queue instance (for testing)
 */
export function resetWoltJobQueue(): void {
  queueInstance = null;
}
