/**
 * Structured debug logging for provider verifier decisions.
 * Only logs when process.env.PROVIDER_DEBUG === 'true' to avoid noisy logs in prod.
 */

import { logger } from '../../../../../lib/logger/structured-logger.js';

export interface ProviderVerifierDecisionPayload {
  providerId: string;
  url: string;
  urlHost?: string;
  urlPath?: string;
  normalizedName?: string;
  candidateName?: string;
  nameScore?: number;
  cityScore?: boolean;
  cityExpected?: string | null;
  cityDetected?: string | null;
  cityMatch?: boolean;
  pathMatch?: boolean;
  reason: string;
  finalStatus: 'ACCEPTED' | 'REJECTED';
}

/**
 * Log a single provider verifier decision (accept or reject).
 * Only logs when process.env.PROVIDER_DEBUG === 'true' to avoid noisy logs in prod.
 * Call before every return in verify*Candidate(); logs for both ACCEPTED and REJECTED.
 */
export function logProviderVerifierDecision(payload: ProviderVerifierDecisionPayload): void {
  if (process.env.PROVIDER_DEBUG !== 'true') return;
  logger.debug(
    {
      event: 'provider_verifier_decision',
      ...payload,
    },
    '[ProviderVerifier] Decision'
  );
}
