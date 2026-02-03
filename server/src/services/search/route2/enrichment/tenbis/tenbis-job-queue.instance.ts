/**
 * 10bis Job Queue Singleton Instance
 * 
 * Provides a shared job queue instance across the application.
 */

import { TenbisJobQueue } from './tenbis-job-queue.js';
import { StubSearchAdapter } from './tenbis-search.mock.js';
import type { TenbisSearchAdapter } from './tenbis-search.adapter.js';
import { createGoogleCSEAdapterFromEnv } from '../google-cse.adapter.js';
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

  // Create search adapter with fallback to stub
  let searchAdapter: TenbisSearchAdapter;
  const googleCseAdapter = createGoogleCSEAdapterFromEnv();
  
  if (googleCseAdapter) {
    // Production: Use Google Custom Search API
    searchAdapter = googleCseAdapter as any; // Cast to TenbisSearchAdapter (compatible interface)
    
    logger.info(
      {
        event: 'tenbis_worker_boot',
        adapterType: 'google_cse',
        enabledFlag: process.env.ENABLE_TENBIS_ENRICHMENT === 'true',
      },
      '[BOOT] 10bis job queue created with Google CSE adapter'
    );
  } else {
    // Fallback: Use stub adapter
    searchAdapter = new StubSearchAdapter();
    
    logger.warn(
      {
        event: 'tenbis_worker_boot',
        adapterType: 'stub',
        reason: 'missing_google_cse_config',
        enabledFlag: process.env.ENABLE_TENBIS_ENRICHMENT === 'true',
      },
      '[BOOT] 10bis job queue created with STUB adapter (configure GOOGLE_CSE_API_KEY and GOOGLE_CSE_ENGINE_ID)'
    );
  }

  // Create queue instance
  queueInstance = new TenbisJobQueue(searchAdapter);

  return queueInstance;
}

/**
 * Reset queue instance (for testing)
 */
export function resetTenbisJobQueue(): void {
  queueInstance = null;
}
