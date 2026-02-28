/**
 * Mishloha-specific verification after strategy picks a candidate.
 * City slug logic: on hold (no-op).
 */

import type { ProviderVerifier, VerifyResult } from './types.js';

export const mishlohaVerifier: ProviderVerifier = {
  verify(_params): VerifyResult {
    // City slug and other checks: on hold
    return { accept: true };
  },
};
