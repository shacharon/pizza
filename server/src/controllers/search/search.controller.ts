/**
 * Unified Search Controller
 * HTTP routes only - business logic extracted to separate modules
 */

import { Router, type Request, type Response } from 'express';
import type { AuthenticatedRequest } from '../../middleware/auth.middleware.js';
import { createSearchError } from '../../services/search/types/search-response.dto.js';
import { createLLMProvider } from '../../llm/factory.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { ROUTE2_ENABLED } from '../../config/route2.flags.js';
import { searchRoute2 } from '../../services/search/route2/index.js';
import type { Route2Context } from '../../services/search/route2/index.js';
import { CONTRACTS_VERSION } from '../../contracts/search.contracts.js';
import { searchJobStore } from '../../services/search/job-store/index.js';
import { hashSessionId, sanitizePhotoUrls } from '../../utils/security.utils.js';
import { wsManager } from '../../server.js';
import crypto from 'crypto';
import { DEDUP_RUNNING_MAX_AGE_MS, DEDUP_SUCCESS_FRESH_WINDOW_MS } from '../../config/deduplication.config.js';

// Extracted modules
import { executeBackgroundSearch } from './search.async-execution.js';
import { validateJobOwnership, getAuthenticatedSession } from './search.security.js';
import { validateSearchRequest, validateRequestIdParam } from './search.validation.js';

const router = Router();

/**
 * Generate idempotency key for deduplication
 * Key = hash(sessionId + normalizedQuery + mode + locationHash + filters)
 * Includes user-provided filters to ensure "same search" actually dedups correctly
 */
function generateIdempotencyKey(params: {
  sessionId: string;
  query: string;
  mode: 'sync' | 'async';
  userLocation?: { lat: number; lng: number } | null;
  filters?: {
    openNow?: boolean;
    priceLevel?: number;
    dietary?: string[];
    mustHave?: string[];
  } | null;
}): string {
  // Normalize query: lowercase, trim, collapse whitespace
  const normalizedQuery = params.query.toLowerCase().trim().replace(/\s+/g, ' ');

  // Hash location if present (to handle float precision issues)
  const locationHash = params.userLocation
    ? `${params.userLocation.lat.toFixed(4)},${params.userLocation.lng.toFixed(4)}`
    : 'no-location';

  // Serialize filters (normalized and sorted for consistency)
  let filtersHash = 'no-filters';
  if (params.filters) {
    const filterParts: string[] = [];

    if (params.filters.openNow !== undefined) {
      filterParts.push(`openNow:${params.filters.openNow}`);
    }
    if (params.filters.priceLevel !== undefined) {
      filterParts.push(`priceLevel:${params.filters.priceLevel}`);
    }
    if (params.filters.dietary && params.filters.dietary.length > 0) {
      // Sort dietary array for consistent hashing
      const sortedDietary = [...params.filters.dietary].sort();
      filterParts.push(`dietary:${sortedDietary.join(',')}`);
    }
    if (params.filters.mustHave && params.filters.mustHave.length > 0) {
      // Sort mustHave array for consistent hashing
      const sortedMustHave = [...params.filters.mustHave].sort();
      filterParts.push(`mustHave:${sortedMustHave.join(',')}`);
    }

    if (filterParts.length > 0) {
      filtersHash = filterParts.join('|');
    }
  }

  // Combine components
  const rawKey = `${params.sessionId}:${normalizedQuery}:${params.mode}:${locationHash}:${filtersHash}`;

  // Hash for consistent length and privacy
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * POST /search
 */
router.post('/', async (req: Request, res: Response) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const validation = validateSearchRequest(req);
    if (!validation.success) {
      res.status(400).json(validation.error);
      return;
    }

    const queryData = validation.data;
    const mode = (req.query.mode as 'sync' | 'async') || 'sync';
    const llm = createLLMProvider();

    if (!ROUTE2_ENABLED || !llm) {
      res.status(500).json(createSearchError('Config error', 'CONFIG_ERROR'));
      return;
    }

    // P0 Security: Use ONLY authenticated sessionId from JWT (no fallbacks)
    // Never trust client-provided sessionId for ownership binding
    const authenticatedSessionId = getAuthenticatedSession(req);

    // 3. Define Context
    const route2Context: Route2Context = {
      requestId,
      startTime: Date.now(),
      llmProvider: llm,
      userLocation: queryData.userLocation ?? null,
      debug: { stopAfter: 'gate' },   // 👈 זו השורה
      // Fix: Only include optional properties if they actually have a value
      ...(req.traceId && { traceId: req.traceId }),
      ...(authenticatedSessionId && { sessionId: authenticatedSessionId }),
      ...(queryData.uiLanguage && { uiLanguage: queryData.uiLanguage })
    };


    if (mode === 'async') {
      // P0 Security: Use ONLY authenticated session from JWT (canonical identity)
      const ownerSessionId = authenticatedSessionId;
      const ownerUserId = (req as AuthenticatedRequest).userId || null;

      // Production: fail-closed if no authenticated session
      const isProduction = process.env.NODE_ENV === 'production';
      if (isProduction && !ownerSessionId) {
        logger.warn({
          requestId,
          operation: 'createJob',
          decision: 'REJECTED',
          reason: 'missing_authenticated_session',
          env: 'production'
        }, '[P0 Security] Async job creation requires JWT-authenticated session in production');

        res.status(401).json(createSearchError('Authentication required', 'MISSING_AUTH_SESSION'));
        return;
      }

      // Generate idempotency key for deduplication
      const idempotencyKey = generateIdempotencyKey({
        sessionId: ownerSessionId || 'anonymous',
        query: queryData.query,
        mode,
        userLocation: queryData.userLocation,
        filters: queryData.filters || null
      });

      // Check for existing job with same idempotency key
      let candidateJob = null;
      try {
        candidateJob = await searchJobStore.findByIdempotencyKey(idempotencyKey, DEDUP_SUCCESS_FRESH_WINDOW_MS);
      } catch (err) {
        // Non-fatal: if lookup fails, continue with new job creation
        logger.warn({
          requestId,
          error: err instanceof Error ? err.message : 'unknown',
          operation: 'findByIdempotencyKey'
        }, '[Deduplication] Failed to check for existing job (non-fatal) - creating new job');
      }

      // Deduplication Decision Logic
      let shouldReuse = false;
      let reuseReason = '';
      let existingJob = null;

      if (candidateJob) {
        const now = Date.now();
        const ageMs = now - candidateJob.createdAt;
        const updatedAgeMs = now - candidateJob.updatedAt;

        // Log candidate found for observability
        logger.info({
          requestId,
          candidateRequestId: candidateJob.requestId,
          event: 'dedup_candidate_found',
          status: candidateJob.status,
          ageMs,
          updatedAgeMs,
          progress: candidateJob.progress,
          sessionHash: hashSessionId(ownerSessionId || 'anonymous')
        }, '[Deduplication] Found candidate job for deduplication');

        // Decision Matrix:
        // 1. DONE_SUCCESS -> REUSE (cached result)
        // 2. DONE_FAIL -> NEW_JOB (failed, don't reuse)
        // 3. RUNNING -> Check staleness:
        //    - Fresh (updatedAt recent) -> REUSE
        //    - Stale (updatedAt old) -> NEW_JOB + mark old as failed

        if (candidateJob.status === 'DONE_SUCCESS') {
          // Cached result available - reuse immediately
          shouldReuse = true;
          reuseReason = 'CACHED_RESULT_AVAILABLE';
          existingJob = candidateJob;
        } else if (candidateJob.status === 'DONE_FAILED') {
          // Previous job failed - create new job
          shouldReuse = false;
          reuseReason = 'PREVIOUS_JOB_FAILED';
        } else if (candidateJob.status === 'RUNNING') {
          // Check if RUNNING job is stale
          const isStaleByUpdatedAt = updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS;
          const isStaleByAge = ageMs > DEDUP_RUNNING_MAX_AGE_MS;

          // Check if there are active WS subscribers (job is "alive" if subscribed)
          const hasActiveSubscribers = wsManager.hasActiveSubscribers(
            candidateJob.requestId,
            candidateJob.sessionId
          );

          if ((isStaleByUpdatedAt || isStaleByAge) && !hasActiveSubscribers) {
            // Stale RUNNING job with no active subscribers - do not reuse
            shouldReuse = false;
            reuseReason = isStaleByUpdatedAt
              ? `STALE_RUNNING_NO_HEARTBEAT (updatedAgeMs: ${updatedAgeMs}ms > ${DEDUP_RUNNING_MAX_AGE_MS}ms, no subscribers)`
              : `STALE_RUNNING_TOO_OLD (ageMs: ${ageMs}ms > ${DEDUP_RUNNING_MAX_AGE_MS}ms, no subscribers)`;

            // Fail-safe: Mark stale RUNNING job as failed (idempotent - only if still RUNNING)
            try {
              // Re-fetch job to ensure it's still RUNNING (avoid race conditions)
              const currentJob = await searchJobStore.getJob(candidateJob.requestId);
              if (currentJob && currentJob.status === 'RUNNING') {
                await searchJobStore.setError(
                  candidateJob.requestId,
                  'STALE_RUNNING',
                  `Job marked as stale during deduplication check (updatedAgeMs: ${updatedAgeMs}ms, no active subscribers)`,
                  'SEARCH_FAILED'
                );

                logger.warn({
                  requestId: candidateJob.requestId,
                  event: 'stale_running_marked_failed',
                  ageMs,
                  updatedAgeMs,
                  maxAgeMs: DEDUP_RUNNING_MAX_AGE_MS,
                  hasActiveSubscribers: false,
                  reason: 'STALE_RUNNING_DEDUP_RESET'
                }, '[Deduplication] Marked stale RUNNING job as DONE_FAILED (no heartbeat, no subscribers)');
              } else {
                logger.debug({
                  requestId: candidateJob.requestId,
                  currentStatus: currentJob?.status || 'NOT_FOUND',
                  event: 'stale_marking_skipped'
                }, '[Deduplication] Skipped marking stale job - already transitioned to terminal state');
              }
            } catch (markErr) {
              // Non-fatal: if marking fails, still create new job
              logger.error({
                requestId: candidateJob.requestId,
                error: markErr instanceof Error ? markErr.message : 'unknown',
                operation: 'setError'
              }, '[Deduplication] Failed to mark stale RUNNING job as failed (non-fatal)');
            }
          } else if (hasActiveSubscribers) {
            // Job has active subscribers - keep it alive even if heartbeat missed
            shouldReuse = true;
            reuseReason = `RUNNING_ALIVE (has ${hasActiveSubscribers ? 'active subscribers' : 'recent heartbeat'})`;
            existingJob = candidateJob;

            logger.info({
              requestId: candidateJob.requestId,
              event: 'dedup_kept_alive_by_subscribers',
              ageMs,
              updatedAgeMs,
              hasActiveSubscribers: true
            }, '[Deduplication] Keeping RUNNING job alive - has active WebSocket subscribers');
          } else {
            // Fresh RUNNING job - reuse it
            shouldReuse = true;
            reuseReason = `RUNNING_FRESH (updatedAgeMs: ${updatedAgeMs}ms < ${DEDUP_RUNNING_MAX_AGE_MS}ms)`;
            existingJob = candidateJob;
          }
        } else {
          // Other statuses (PENDING, DONE_CLARIFY, DONE_STOPPED) - reuse
          shouldReuse = true;
          reuseReason = `STATUS_${candidateJob.status}`;
          existingJob = candidateJob;
        }

        // Log decision for observability
        logger.info({
          requestId,
          originalRequestId: requestId,
          candidateRequestId: candidateJob.requestId,
          event: 'dedup_decision',
          decision: shouldReuse ? 'REUSE' : 'NEW_JOB',
          reason: reuseReason,
          status: candidateJob.status,
          ageMs,
          updatedAgeMs,
          maxAgeMs: DEDUP_RUNNING_MAX_AGE_MS
        }, `[Deduplication] Decision: ${shouldReuse ? 'REUSE' : 'NEW_JOB'} - ${reuseReason}`);
      }

      if (shouldReuse && existingJob) {
        // Duplicate detected - reuse existing requestId
        logger.info({
          requestId: existingJob.requestId,
          originalRequestId: requestId,
          event: 'duplicate_search_deduped',
          status: existingJob.status,
          ageMs: Date.now() - existingJob.createdAt,
          updatedAgeMs: Date.now() - existingJob.updatedAt,
          sessionHash: hashSessionId(ownerSessionId || 'anonymous')
        }, '[Deduplication] Reusing existing requestId for duplicate search');

        // Re-activate subscriptions for the existing requestId
        // GUARDRAIL: WS activation failures are non-fatal - wrapped in defensive try/catch
        try {
          wsManager.activatePendingSubscriptions(existingJob.requestId, ownerSessionId || 'anonymous');
        } catch (wsErr) {
          logger.error({
            requestId: existingJob.requestId,
            error: wsErr instanceof Error ? wsErr.message : 'unknown',
            stack: wsErr instanceof Error ? wsErr.stack : undefined,
            operation: 'activatePendingSubscriptions',
            event: 'ws_subscribe_error'
          }, '[WS] WebSocket activation failed for duplicate job (non-fatal) - search continues via HTTP polling');
        }

        const resultUrl = `/api/v1/search/${existingJob.requestId}/result`;
        res.status(202).json({ requestId: existingJob.requestId, resultUrl, contractsVersion: CONTRACTS_VERSION });
        return;
      }

      // No duplicate found - create new job
      // P0 Fix: Non-fatal Redis write - if job creation fails, return 202 anyway
      // Background execution will still proceed, just without Redis tracking
      try {
        await searchJobStore.createJob(requestId, {
          sessionId: ownerSessionId || 'anonymous', // Use JWT session, not client-provided
          query: queryData.query,
          ownerUserId,
          ownerSessionId: ownerSessionId || null, // Convert undefined to null for type safety
          idempotencyKey
        });

        // OBSERVABILITY: Log job creation (once per requestId)
        logger.info({
          requestId,
          sessionHash: hashSessionId(ownerSessionId || 'anonymous'),
          hasUserId: Boolean(ownerUserId),
          operation: 'createJob',
          decision: 'ACCEPTED',
          hasIdempotencyKey: true,
          event: 'job_created'
        }, '[Observability] Job created with JWT session binding and idempotency key');

        // CTO-grade: Activate pending subscriptions for this request
        // GUARDRAIL: WS activation failures are non-fatal - wrapped in defensive try/catch
        try {
          wsManager.activatePendingSubscriptions(requestId, ownerSessionId || 'anonymous');
        } catch (wsErr) {
          logger.error({
            requestId,
            error: wsErr instanceof Error ? wsErr.message : 'unknown',
            stack: wsErr instanceof Error ? wsErr.stack : undefined,
            operation: 'activatePendingSubscriptions',
            event: 'ws_subscribe_error'
          }, '[WS] WebSocket activation failed (non-fatal) - search continues via HTTP polling');
        }
      } catch (redisErr) {
        logger.error({
          requestId,
          error: redisErr instanceof Error ? redisErr.message : 'unknown',
          operation: 'createJob'
        }, 'Redis JobStore write failed (non-fatal) - job not tracked, but search will proceed');
      }

      const resultUrl = `/api/v1/search/${requestId}/result`;
      res.status(202).json({ requestId, resultUrl, contractsVersion: CONTRACTS_VERSION });

      // P1 Reliability: Add error handler to prevent unhandled rejection
      void executeBackgroundSearch({ requestId, queryData, context: route2Context, resultUrl }).catch(err => {
        logger.error({
          requestId,
          error: err instanceof Error ? err.message : 'unknown',
          stack: err instanceof Error ? err.stack : undefined
        }, '[P1 Reliability] Background search execution failed');
      });
      return;
    }

    // SYNC Mode
    const response = await searchRoute2(queryData, route2Context);

    // P0 Security: Sanitize photo URLs before returning (same as async mode)
    if (response && typeof response === 'object' && 'results' in response) {
      const sanitized = {
        ...response,
        results: sanitizePhotoUrls((response as any).results || [])
      };

      logger.info({
        requestId,
        mode: 'sync',
        photoUrlsSanitized: true,
        resultCount: (response as any).results?.length || 0
      }, '[P0 Security] Photo URLs sanitized (sync mode)');

      return res.json(sanitized);
    }

    res.json(response);

  } catch (error) {
    res.status(500).json(createSearchError('Internal server error', 'SEARCH_ERROR'));
  }
});

/**
 * GET /search/:requestId/result
 * P0 Security: IDOR protection via session binding
 */
router.get('/:requestId/result', async (req: Request, res: Response) => {
  const validation = validateRequestIdParam(req);
  if (!validation.valid) {
    return res.status(400).json({ code: 'MISSING_ID' });
  }
  const requestId = validation.requestId!;

  // P0 Security: Validate job ownership
  const ownershipCheck = await validateJobOwnership(requestId, req);
  if (!ownershipCheck.valid) {
    return res.status(ownershipCheck.errorResponse!.status).json(ownershipCheck.errorResponse!.json);
  }

  // Authorization passed - retrieve job
  // GUARDRAIL: HTTP result delivery is independent of WS state
  // Job store is the source of truth, not WS subscriptions
  const job = await searchJobStore.getJob(requestId);
  if (!job) {
    logger.warn({
      requestId,
      event: 'getResult_not_found'
    }, '[HTTP] Job not found in store - may have expired or never created');
    return res.status(404).json({ code: 'NOT_FOUND', requestId });
  }

  // Calculate age metrics for observability and staleness detection
  const now = Date.now();
  const ageMs = now - job.createdAt;
  const updatedAgeMs = now - job.updatedAt;

  // Log status for observability (especially for RUNNING jobs)
  logger.info({
    requestId,
    event: 'getResult_status',
    status: job.status,
    hasResult: !!job.result,
    ageMs,
    updatedAgeMs,
    progress: job.progress,
    isStale: job.status === 'RUNNING' && updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS
  }, `[HTTP] GET /result - status: ${job.status}, ageMs: ${ageMs}, updatedAgeMs: ${updatedAgeMs}`);

  // Check job status
  if (job.status === 'DONE_FAILED') {
    // GUARDRAIL: Return stable error response (200) - async operation completed with failure
    // Ensure all fields have safe defaults if job.error is missing
    const errorCode = job.error?.code || 'SEARCH_FAILED';
    const errorMessage = job.error?.message || 'Search failed. Please retry.';
    const errorType = job.error?.errorType || 'SEARCH_FAILED';

    logger.info({
      requestId,
      status: 'DONE_FAILED',
      errorCode,
      hasJobError: !!job.error
    }, '[Result] Returning stable error response for failed job');

    return res.status(200).json({
      requestId,
      status: 'DONE_FAILED',
      code: errorCode,
      message: errorMessage,
      errorType,
      terminal: true, // Signal to clients to stop polling
      contractsVersion: CONTRACTS_VERSION
    });
  }

  if (job.status === 'PENDING' || job.status === 'RUNNING') {
    // Check if RUNNING job is stale
    const isStale = job.status === 'RUNNING' && updatedAgeMs > DEDUP_RUNNING_MAX_AGE_MS;

    if (isStale) {
      logger.warn({
        requestId,
        event: 'getResult_stale_running',
        ageMs,
        updatedAgeMs,
        maxAgeMs: DEDUP_RUNNING_MAX_AGE_MS,
        progress: job.progress
      }, '[HTTP] Stale RUNNING job detected - client should consider retrying');

      // Return 202 but with metadata indicating staleness
      return res.status(202).json({
        requestId,
        status: job.status,
        progress: job.progress,
        contractsVersion: CONTRACTS_VERSION,
        meta: {
          isStale: true,
          ageMs,
          updatedAgeMs,
          message: 'Search may be stuck. Consider restarting search if no progress after retry.'
        }
      });
    }

    return res.status(202).json({
      requestId,
      status: job.status,
      progress: job.progress,
      contractsVersion: CONTRACTS_VERSION
    });
  }

  // Handle DONE_SUCCESS, DONE_CLARIFY, DONE_STOPPED
  // P0 Security: Sanitize photo URLs before returning result
  const result = job.result;

  // GUARDRAIL: If result is missing for a completed job, return stable error
  if (!result) {
    logger.warn({
      requestId,
      status: job.status,
      hasResult: false
    }, '[Result] Job completed but result missing - non-fatal write likely failed');

    return res.status(200).json({
      requestId,
      status: 'DONE_FAILED',
      code: 'RESULT_MISSING',
      message: 'Search completed but result unavailable. Please retry.',
      errorType: 'SEARCH_FAILED',
      terminal: true,
      contractsVersion: CONTRACTS_VERSION
    });
  }

  if (typeof result === 'object' && 'results' in result) {
    const sanitized = {
      ...result,
      results: sanitizePhotoUrls((result as any).results || [])
    };

    // OBSERVABILITY: Log successful result retrieval
    logger.info({
      requestId,
      photoUrlsSanitized: true,
      resultCount: (result as any).results?.length || 0,
      hasResult: true,
      status: job.status,
      event: 'getResult_returned'
    }, '[Observability] GET /result returned successfully with results');

    return res.json(sanitized);
  }

  // OBSERVABILITY: Log successful result retrieval (non-search format)
  logger.info({
    requestId,
    hasResult: true,
    status: job.status,
    event: 'getResult_returned'
  }, '[Observability] GET /result returned successfully');

  return res.json(result);
});

/**
 * GET /search/:requestId
 */
router.get('/:requestId', async (req: Request, res: Response) => {
  const validation = validateRequestIdParam(req);
  if (!validation.valid) {
    return res.status(400).end();
  }
  const requestId = validation.requestId!;

  const statusInfo = await searchJobStore.getStatus(requestId);
  return statusInfo ? res.json(statusInfo) : res.status(404).end();
});

export default router;