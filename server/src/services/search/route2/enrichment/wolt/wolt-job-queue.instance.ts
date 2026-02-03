/**
 * Wolt Job Queue Singleton Instance
 * 
 * Provides a shared job queue instance across the application.
 */

import { WoltJobQueue } from './wolt-job-queue.js';
import { StubSearchAdapter } from './wolt-search.mock.js';
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

  // Create search adapter
  // TODO: Replace StubSearchAdapter with real search provider
  // (Google Custom Search API, Bing Search API, etc.)
  const searchAdapter = new StubSearchAdapter();

  // Create queue instance
  queueInstance = new WoltJobQueue(searchAdapter);

  logger.info(
    {
      event: 'wolt_worker_boot',
      enabledFlag: process.env.ENABLE_WOLT_ENRICHMENT === 'true',
      nodeEnv: process.env.NODE_ENV || 'development',
    },
    '[BOOT] Wolt job queue created (lazy)'
  );

  return queueInstance;
}

/**
 * Reset queue instance (for testing)
 */
export function resetWoltJobQueue(): void {
  queueInstance = null;
}
