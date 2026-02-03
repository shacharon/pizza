/**
 * Wolt Job Queue Singleton Instance
 * 
 * Provides a shared job queue instance across the application.
 */

import { WoltJobQueue } from './wolt-job-queue.js';
import { StubSearchAdapter } from './wolt-search.mock.js';
import type { WoltSearchAdapter } from './wolt-search.adapter.js';
import { createGoogleCSEAdapterFromEnv } from '../google-cse.adapter.js';
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

  // Create search adapter with fallback to stub
  let searchAdapter: WoltSearchAdapter;
  const googleCseAdapter = createGoogleCSEAdapterFromEnv();
  
  if (googleCseAdapter) {
    // Production: Use Google Custom Search API
    searchAdapter = googleCseAdapter as any; // Cast to WoltSearchAdapter (compatible interface)
    
    logger.info(
      {
        event: 'wolt_worker_boot',
        adapterType: 'google_cse',
        enabledFlag: process.env.ENABLE_WOLT_ENRICHMENT === 'true',
      },
      '[BOOT] Wolt job queue created with Google CSE adapter'
    );
  } else {
    // Fallback: Use stub adapter
    searchAdapter = new StubSearchAdapter();
    
    logger.warn(
      {
        event: 'wolt_worker_boot',
        adapterType: 'stub',
        reason: 'missing_google_cse_config',
        enabledFlag: process.env.ENABLE_WOLT_ENRICHMENT === 'true',
      },
      '[BOOT] Wolt job queue created with STUB adapter (configure GOOGLE_CSE_API_KEY and GOOGLE_CSE_ENGINE_ID)'
    );
  }

  // Create queue instance
  queueInstance = new WoltJobQueue(searchAdapter);

  return queueInstance;
}

/**
 * Reset queue instance (for testing)
 */
export function resetWoltJobQueue(): void {
  queueInstance = null;
}
