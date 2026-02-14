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

// Extracted modules
import { executeBackgroundSearch } from './search.async-execution.js';
import { validateJobOwnership, getAuthenticatedSession } from './search.security.js';
import { validateSearchRequest, validateRequestIdParam } from './search.validation.js';

const router = Router();

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
      //   debug: { stopAfter: 'intent' },   // 👈 זו השורה
      // Fix: Only include optional properties if they actually have a value
      ...(req.traceId && { traceId: req.traceId }),
      ...(authenticatedSessionId && { sessionId: authenticatedSessionId })
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

      // P0 Fix: Non-fatal Redis write - if job creation fails, return 202 anyway
      // Background execution will still proceed, just without Redis tracking
      try {
        const jobParams: { sessionId: string; query: string; ownerUserId?: string | null; ownerSessionId?: string | null; traceId?: string } = {
          sessionId: ownerSessionId || 'anonymous', // Use JWT session, not client-provided
          query: queryData.query,
          ownerUserId,
          ownerSessionId: ownerSessionId || null // Convert undefined to null for type safety
        };
        // Store traceId for SSE trace consistency (only if present)
        if (route2Context.traceId) {
          jobParams.traceId = route2Context.traceId;
        }
        await searchJobStore.createJob(requestId, jobParams);

        logger.info({
          requestId,
          sessionHash: hashSessionId(ownerSessionId || 'anonymous'),
          hasUserId: Boolean(ownerUserId),
          operation: 'createJob',
          decision: 'ACCEPTED'
        }, '[P0 Security] Job created with JWT session binding');

        // CTO-grade: Activate pending subscriptions for this request
        wsManager.activatePendingSubscriptions(requestId, ownerSessionId || 'anonymous');
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
  const job = await searchJobStore.getJob(requestId);
  if (!job) {
    return res.status(404).json({ code: 'NOT_FOUND', requestId });
  }

  // Check job status
  if (job.status === 'DONE_FAILED') {
    return res.status(500).json({ requestId, status: 'FAILED', error: job.error });
  }

  if (job.status === 'PENDING' || job.status === 'RUNNING') {
    return res.status(202).json({
      requestId,
      status: job.status,
      progress: job.progress,
      contractsVersion: CONTRACTS_VERSION
    });
  }

  // P0 Security: Sanitize photo URLs before returning result
  const result = job.result;
  if (result && typeof result === 'object' && 'results' in result) {
    const sanitized = {
      ...result,
      results: sanitizePhotoUrls((result as any).results || [])
    };

    logger.info({
      requestId,
      photoUrlsSanitized: true,
      resultCount: (result as any).results?.length || 0
    }, '[P0 Security] Photo URLs sanitized');

    return res.json(sanitized);
  }

  return result ? res.json(result) : res.status(500).json({ code: 'RESULT_MISSING' });
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