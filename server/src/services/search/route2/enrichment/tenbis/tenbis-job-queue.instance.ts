/**
 * 10bis Job Queue Singleton Instance
 * 
 * Provides a shared job queue instance across the application.
 */

import { TenbisJobQueue } from './tenbis-job-queue.js';
import { createResolverFromEnv } from '../provider-deeplink-resolver.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';

/**
 * Singleton job queue instance
 */
let queueInstance: TenbisJobQueue | null = null;

/**
 * Get or create the shared job queue instance
 * 
 * @returns TenbisJobQueue instance
 */
export function getTenbisJobQueue(): TenbisJobQueue {
  if (queueInstance) {
    return queueInstance;
  }

  // Create resolver (handles CSE + 3-layer fallback internally)
  const resolver = createResolverFromEnv();
  
  logger.info(
    {
      event: 'tenbis_worker_boot',
      resolverType: 'provider_deeplink_resolver',
      enabledFlag: process.env.ENABLE_TENBIS_ENRICHMENT === 'true',
      hasCSE: Boolean(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_ENGINE_ID),
    },
    '[BOOT] 10bis job queue created with ProviderDeepLinkResolver'
  );

  // Create queue instance
  queueInstance = new TenbisJobQueue(resolver);

  return queueInstance;
}

/**
 * Reset queue instance (for testing)
 */
export function resetTenbisJobQueue(): void {
  queueInstance = null;
}
