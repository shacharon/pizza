/**
 * Ownership Validator
 * Best-effort job ownership validation
 * Single responsibility: Authorization checks for job access
 */

import type { Logger } from 'pino';
import type { ISearchJobStore } from '../../../services/search/job-store/job-store.interface.js';
import type { AuthenticatedRequest } from '../../../middleware/auth-session-or-jwt.middleware.js';
import type { OwnershipValidationResult } from './models.js';

export class OwnershipValidator {
  constructor(
    private readonly jobStore: ISearchJobStore,
    private readonly logger: Logger
  ) { }

  /**
   * Best-effort ownership validation
   * Validates job ownership if JobStore available
   */
  async validate(
    requestId: string,
    authReq: AuthenticatedRequest
  ): Promise<OwnershipValidationResult> {
    try {
      const job = await this.jobStore.getJob(requestId);

      // Job not found - could be old/expired request
      if (!job) {
        this.logger.warn(
          { requestId, reason: 'job_not_found' },
          '[AssistantSSE] Job not found in store (may be expired)'
        );
        // Best-effort: allow if job not found (may be legitimate old request)
        return { valid: true, reason: 'job_not_found_allowed' };
      }

      // If job has ownerSessionId, validate it matches authenticated session
      if (job.ownerSessionId) {
        if (job.ownerSessionId !== authReq.sessionId) {
          this.logger.warn(
            {
              requestId,
              authSessionId: authReq.sessionId,
              ownerSessionId: job.ownerSessionId,
              reason: 'session_mismatch'
            },
            '[AssistantSSE] Ownership validation failed - session mismatch'
          );
          return { valid: false, reason: 'session_mismatch' };
        }
      }

      // If job has ownerUserId, validate it matches authenticated user
      if (job.ownerUserId && authReq.userId) {
        if (job.ownerUserId !== authReq.userId) {
          this.logger.warn(
            {
              requestId,
              authUserId: authReq.userId,
              ownerUserId: job.ownerUserId,
              reason: 'user_mismatch'
            },
            '[AssistantSSE] Ownership validation failed - user mismatch'
          );
          return { valid: false, reason: 'user_mismatch' };
        }
      }

      this.logger.debug(
        { requestId, validated: true },
        '[AssistantSSE] Ownership validated'
      );

      return { valid: true };
    } catch (error) {
      // LIMITATION: If Redis unavailable, we cannot validate ownership
      // Log warning but allow request (best-effort)
      this.logger.warn(
        {
          requestId,
          error: error instanceof Error ? error.message : 'unknown',
          reason: 'jobstore_unavailable'
        },
        '[AssistantSSE] Cannot validate ownership - JobStore unavailable (best-effort: allowing)'
      );
      return { valid: true, reason: 'validation_skipped_no_redis' };
    }
  }
}
