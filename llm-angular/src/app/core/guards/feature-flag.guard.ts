/**
 * Feature Flag Guard
 * Controls route access based on feature flags
 */

import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { FlagsStore } from '../../state/flags.store';

/**
 * Creates a guard function that checks if a specific feature flag is enabled
 * @param flag The feature flag key to check
 * @param redirectTo Optional path to redirect if flag is disabled (default: '/food/grid')
 */
export function featureFlagGuard(flag: string, redirectTo: string = '/food/grid'): CanActivateFn {
  return () => {
    const flagsStore = inject(FlagsStore);
    const router = inject(Router);

    if (flagsStore.isEnabled(flag)) {
      return true;
    }

    console.warn(`[FeatureFlagGuard] Feature '${flag}' is disabled. Redirecting to ${redirectTo}`);
    return router.createUrlTree([redirectTo]);
  };
}

/**
 * Guard for unified search feature
 */
export const unifiedSearchGuard = featureFlagGuard('unifiedSearch');

/**
 * Guard for action proposals feature
 */
export const actionProposalsGuard = featureFlagGuard('actionProposals');


