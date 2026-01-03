/**
 * Provider Factory
 * Phase 7: Factory pattern for provider selection
 * 
 * Creates appropriate provider based on configuration
 * Allows easy switching between real and mock providers
 */

import { MockPlacesProvider } from './mock-places.provider.js';
import { logger } from '../../../lib/logger/structured-logger.js';

export type ProviderMode = 'real' | 'mock';

/**
 * Create places provider based on configuration
 * 
 * Mode is determined by PLACES_PROVIDER_MODE environment variable:
 * - 'mock': Use MockPlacesProvider (fixtures)
 * - 'real': Use GooglePlacesProvider (default)
 * 
 * @returns Configured places provider instance
 */
export function createPlacesProvider(): MockPlacesProvider {
  const mode = (process.env.PLACES_PROVIDER_MODE || 'real').toLowerCase() as ProviderMode;

  switch (mode) {
    case 'mock':
      logger.info({ mode }, 'Creating MockPlacesProvider');
      return new MockPlacesProvider();

    case 'real':
    default:
      logger.warn({ mode }, 'GooglePlacesProvider not yet implemented, using MockPlacesProvider');
      return new MockPlacesProvider();
  }
}

/**
 * Get current provider mode
 */
export function getProviderMode(): ProviderMode {
  const mode = (process.env.PLACES_PROVIDER_MODE || 'real').toLowerCase();
  return mode === 'mock' ? 'mock' : 'real';
}

/**
 * Check if currently using mock provider
 */
export function isMockMode(): boolean {
  return getProviderMode() === 'mock';
}





