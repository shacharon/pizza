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
import { DEDUP_RUNNING_MAX_AGE_MS, DEDUP_SUCCESS_FRESH_WINDOW_MS } from '../../config/deduplication.config.js';

// Extracted modules
import { executeBackgroundSearch } from './search.async-execution.js';
import { validateJobOwnership, getAuthenticatedSession } from './search.security.js';
import { validateSearchRequest, validateRequestIdParam } from './search.validation.js';
import { IdempotencyKeyGenerator } from './search.idempotency-key.generator.js';
import { SearchDeduplicationService } from './search.deduplication.service.js';

const router = Router();
const idempotencyKeyGenerator = new IdempotencyKeyGenerator();
const deduplicationService = new SearchDeduplicationService(searchJobStore);

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
      //debug: { stopAfter: '' },   // 👈 זו השורה
      // Fix: Only include optional properties if they actually have a value
      ...(req.traceId && { traceId: req.traceId }),
      ...(authenticatedSessionId && { sessionId: authenticatedSessionId }),
      ...(queryData.uiLanguage && { uiLanguage: queryData.uiLanguage }),
      // Copy debug config from request to context (safe: only in non-prod or behind guard if needed)
      ...(queryData.debug && typeof queryData.debug === 'object' && queryData.debug.stopAfter && {
        debug: { stopAfter: queryData.debug.stopAfter }
      })
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
      const idempotencyKey = idempotencyKeyGenerator.generate({
        sessionId: ownerSessionId || 'anonymous',
        query: queryData.query,
        mode,
        userLocation: queryData.userLocation,
        filters: queryData.filters || null
      });

      // Check for existing job with same idempotency key (delegated to service)
      const candidateJob = await deduplicationService.findCandidate(idempotencyKey);

      // If lookup failed (returned null due to error), log warning
      if (candidateJob === null) {
        // Note: Service already handles try/catch, so null means either no job or lookup error
        // We can't distinguish here, but that's fine - we'll create a new job either way
      }

      // Deduplication Decision Logic (delegated to service)
      const decision = deduplicationService.decideReuse(candidateJob, Date.now());
      const shouldReuse = decision.shouldReuse;
      const reuseReason = decision.reason;
      const existingJob = decision.existingJob;

      if (candidateJob) {
        const ageMs = decision.ageMs!;
        const updatedAgeMs = decision.updatedAgeMs!;

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

        // Log stale detection if applicable (preserving original logging)
        if (!shouldReuse && candidateJob.status === 'RUNNING' && (reuseReason.includes('STALE_RUNNING'))) {
          logger.info({
            requestId: candidateJob.requestId,
            event: 'dedup_stale_detected',
            ageMs,
            updatedAgeMs,
            maxAgeMs: DEDUP_RUNNING_MAX_AGE_MS,
            decision: 'NEW_JOB'
          }, '[Deduplication] Stale RUNNING job detected - creating new job (no mutation)');
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