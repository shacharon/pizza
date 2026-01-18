/**
 * Unified Search Controller
 * Routes are mounted at /search by the v1 aggregator
 *
 * Internal routes:
 * - POST /               → /search
 * - GET /stats           → /search/stats
 * - GET /:requestId/result → /search/:requestId/result   (Iteration 1)
 */

import { Router, type Request, type Response } from 'express';
import { safeParseSearchRequest } from '../../services/search/types/search-request.dto.js';
import { createSearchError } from '../../services/search/types/search-response.dto.js';
import { createLLMProvider } from '../../llm/factory.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { ROUTE2_ENABLED } from '../../config/route2.flags.js';
import { searchRoute2 } from '../../services/search/route2/index.js';
import type { Route2Context } from '../../services/search/route2/index.js';

import { CONTRACTS_VERSION } from '../../contracts/search.contracts.js';
import { searchAsyncStore } from '../../search-async/searchAsync.store.js';
import { publishSearchEvent } from '../../infra/websocket/search-ws.publisher.js';
import type { SearchRequest } from '../../services/search/types/search-request.dto.js';
import { searchJobStore } from '../../services/search/job-store/index.js';


const router = Router();

/**
 * Run async search in a detached context (not tied to HTTP request lifecycle)
 * This prevents the pipeline from being aborted when the 202 response is sent
 */
async function runAsyncSearch(params: {
  requestId: string;
  query: SearchRequest;
  resultUrl: string;
  llmProvider: any;
  userLocation: { lat: number; lng: number } | null;
  traceId?: string;
  sessionId?: string;
}): Promise<void> {
  const { requestId, query, resultUrl, llmProvider, userLocation, traceId, sessionId } = params;

  logger.info({ requestId, msg: '[AsyncJob] Started detached execution' });

  // Create a NEW AbortController NOT tied to HTTP request
  const abortController = new AbortController();
  const timeoutMs = 30000; // 30 seconds timeout for entire pipeline

  const timeoutId = setTimeout(() => {
    abortController.abort();
    logger.warn({ requestId, timeoutMs, msg: '[AsyncJob] Timeout - aborting pipeline' });
  }, timeoutMs);

  try {
    // Create detached context (no request-scoped resources)
    const detachedContext: Route2Context = {
      requestId,
      ...(traceId !== undefined && { traceId }),
      ...(sessionId !== undefined && { sessionId }),
      startTime: Date.now(),
      llmProvider,
      userLocation,
    };

    // Execute pipeline with detached context
    const response = await searchRoute2(query, detachedContext);

    // Store success (logs transition to DONE)
    searchAsyncStore.setDone(requestId, response, response.results.length);

    // Notify via WebSocket (AFTER setDone)
    publishSearchEvent(requestId, {
      channel: 'search',
      contractsVersion: CONTRACTS_VERSION,
      type: 'ready',
      requestId,
      ts: new Date().toISOString(),
      stage: 'done',
      ready: 'results',
      decision: 'CONTINUE',
      resultUrl,
      resultCount: response.results.length,
    });

    logger.info({
      requestId,
      resultCount: response.results.length,
      durationMs: Date.now() - detachedContext.startTime,
      msg: '[AsyncJob] Completed successfully'
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const code = abortController.signal.aborted ? 'TIMEOUT' : 'INTERNAL_ERROR';

    // Store failure (logs transition to FAILED)
    searchAsyncStore.setFailed(requestId, code, message);

    // Notify via WebSocket (AFTER setFailed)
    publishSearchEvent(requestId, {
      channel: 'search',
      contractsVersion: CONTRACTS_VERSION,
      type: 'error',
      requestId,
      ts: new Date().toISOString(),
      stage: 'done',
      code: code as any,
      message,
    });

    logger.error({
      requestId,
      code,
      error: message,
      msg: '[AsyncJob] Failed'
    });

  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST /search
 * Unified search endpoint
 *
 * - ?mode=sync (default): Returns full response (blocking)
 * - ?mode=async: Returns 202 ACK fast; pipeline runs in background; progress via WebSocket; results via GET /:requestId/result
 */
router.post('/', async (req: Request, res: Response) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Validate request
    const validation = safeParseSearchRequest(req.body);
    if (!validation.success) {
      req.log.warn({ requestId, error: validation.error }, 'Invalid search request');
      res.status(400).json(createSearchError('Invalid request', 'VALIDATION_ERROR', validation.error));
      return;
    }

    // Parse mode
    const mode = (req.query.mode as 'sync' | 'async') || 'sync';

    // Log search_started ONCE
    logger.info(
      {
        requestId,
        query: validation.data!.query,
        mode,
        hasUserLocation: !!validation.data!.userLocation,
        sessionId: validation.data!.sessionId || 'new',
      },
      'search_started'
    );

    // ROUTE2 enabled check
    if (!ROUTE2_ENABLED) {
      logger.error({ requestId }, 'V1 orchestrator has been removed. Set ROUTE2_ENABLED=true in .env');
      res.status(500).json(createSearchError('V1 orchestrator removed - use ROUTE2', 'CONFIG_ERROR'));
      return;
    }

    // LLM provider check
    const llm = createLLMProvider();
    if (!llm) {
      logger.error({ requestId }, 'LLM provider not available for ROUTE2');
      res.status(500).json(createSearchError('LLM not configured', 'CONFIG_ERROR'));
      return;
    }

    const route2Context: Route2Context = {
      requestId,
      ...(req.traceId !== undefined && { traceId: req.traceId }),
      ...(validation.data!.sessionId !== undefined && { sessionId: validation.data!.sessionId }),
      startTime: Date.now(),
      llmProvider: llm,
      userLocation: validation.data!.userLocation ?? null,
    };

    // ASYNC mode: 202 ACK + background job
    if (mode === 'async') {
      // Create job using the same requestId
      await searchJobStore.createJob(requestId, {
        sessionId: validation.data!.sessionId || 'new',
        query: validation.data!.query
      });

      // Build result URL
      const resultUrl = `/api/v1/search/${requestId}/result`;

      // Return 202 Accepted with resultUrl for polling
      res.status(202).json({
        requestId,
        resultUrl,
        contractsVersion: CONTRACTS_VERSION
      });

      // Start background job (do NOT await)
      void (async () => {
        try {
          // Set status to RUNNING + publish progress
          await searchJobStore.setStatus(requestId, 'RUNNING', 0);
          publishSearchEvent(requestId, {
            channel: 'search',
            contractsVersion: CONTRACTS_VERSION,
            type: 'progress',
            requestId,
            ts: new Date().toISOString(),
            stage: 'accepted',
            status: 'running',
            progress: 0,
            message: 'Search started'
          });

          // Create detached context with same requestId
          const detachedContext: Route2Context = {
            requestId,
            ...(req.traceId !== undefined && { traceId: req.traceId }),
            ...(validation.data!.sessionId !== undefined && { sessionId: validation.data!.sessionId }),
            startTime: Date.now(),
            llmProvider: llm,
            userLocation: validation.data!.userLocation ?? null,
          };

          // Publish progress at 50% (pipeline started)
          await searchJobStore.setStatus(requestId, 'RUNNING', 50);
          publishSearchEvent(requestId, {
            channel: 'search',
            contractsVersion: CONTRACTS_VERSION,
            type: 'progress',
            requestId,
            ts: new Date().toISOString(),
            stage: 'route_llm',
            status: 'running',
            progress: 50,
            message: 'Processing search'
          });

          // Execute search
          const response = await searchRoute2(validation.data!, detachedContext);

          // Publish progress at 90% (pipeline complete, storing result)
          await searchJobStore.setStatus(requestId, 'RUNNING', 90);
          publishSearchEvent(requestId, {
            channel: 'search',
            contractsVersion: CONTRACTS_VERSION,
            type: 'progress',
            requestId,
            ts: new Date().toISOString(),
            stage: 'google',
            status: 'running',
            progress: 90,
            message: 'Finalizing results'
          });

          // Determine terminal status based on response
          let terminalStatus: 'DONE_SUCCESS' | 'DONE_CLARIFY' = 'DONE_SUCCESS';
          let wsEventType: 'ready' | 'clarify' = 'ready';

          // Check if this is a clarify response (no results + assist message)
          if (response.results.length === 0 && response.assist?.type === 'clarify') {
            terminalStatus = 'DONE_CLARIFY';
            wsEventType = 'clarify';
          }

          // Store result
          await searchJobStore.setResult(requestId, response);
          await searchJobStore.setStatus(requestId, terminalStatus, 100);

          // Publish appropriate event
          if (wsEventType === 'clarify') {
            publishSearchEvent(requestId, {
              channel: 'search',
              contractsVersion: CONTRACTS_VERSION,
              type: 'clarify',
              requestId,
              ts: new Date().toISOString(),
              stage: 'done',
              message: response.assist?.message || 'Please clarify your search'
            });

            logger.info({
              requestId,
              durationMs: Date.now() - detachedContext.startTime,
              msg: '[ASYNC] Job completed - clarification needed'
            });
          } else {
            publishSearchEvent(requestId, {
              channel: 'search',
              contractsVersion: CONTRACTS_VERSION,
              type: 'ready',
              requestId,
              ts: new Date().toISOString(),
              stage: 'done',
              ready: 'results',
              decision: 'CONTINUE',
              resultCount: response.results.length
            });

            logger.info({
              requestId,
              resultCount: response.results.length,
              durationMs: Date.now() - detachedContext.startTime,
              msg: '[ASYNC] Job completed successfully'
            });
          }

        } catch (err) {
          const message = err instanceof Error ? err.message : 'Internal error';

          // Determine error type
          let errorType: 'LLM_TIMEOUT' | 'GATE_ERROR' | 'SEARCH_FAILED' = 'SEARCH_FAILED';
          let errorCode = 'SEARCH_FAILED';

          if (err instanceof Error) {
            if (err.message.includes('GATE_TIMEOUT') || err.message.includes('gate2')) {
              errorType = 'GATE_ERROR';
              errorCode = 'GATE_TIMEOUT';
            } else if (err.message.includes('timeout') || err.message.includes('abort')) {
              errorType = 'LLM_TIMEOUT';
              errorCode = 'LLM_TIMEOUT';
            }
          }

          // Set terminal DONE_FAILED status
          await searchJobStore.setError(requestId, errorCode, message, errorType);
          await searchJobStore.setStatus(requestId, 'DONE_FAILED', 0);

          // Publish error event
          publishSearchEvent(requestId, {
            channel: 'search',
            contractsVersion: CONTRACTS_VERSION,
            type: 'error',
            requestId,
            ts: new Date().toISOString(),
            stage: 'done',
            code: errorCode as any,
            message,
            errorType
          });

          logger.error({
            requestId,
            errorCode,
            errorType,
            error: message,
            msg: '[ASYNC] Job failed'
          });
        }
      })();

      return;
    }


    // SYNC mode: current behavior (blocking)
    const response = await searchRoute2(validation.data!, route2Context);

    req.log.info(
      {
        requestId,
        resultCount: response.results.length,
        pipeline: 'route2',
      },
      'Search completed (ROUTE2)'
    );

    res.json(response);
  } catch (error) {
    req.log.error({ requestId, error }, 'Search error');
    res.status(500).json(
      createSearchError(error instanceof Error ? error.message : 'Internal server error', 'SEARCH_ERROR')
    );
  }
});

/**
 * GET /search/:requestId/result
 * Async result fetch endpoint
 * 
 * Returns:
 * - 404 if requestId not found
 * - 202 if not done yet (PENDING, RUNNING, or FAILED)
 * - 200 if done (full SearchResponse)
 * 
 * Note: Both /result and /result/ are supported to prevent production 404s
 */
const getResultHandler = async (req: Request, res: Response) => {
  const { requestId } = req.params;

  // Log deprecated trailing slash usage for monitoring
  if (req.path.endsWith('/')) {
    logger.warn({
      requestId,
      path: req.path,
      msg: '[GET /result] DEPRECATED: Trailing slash used (client should normalize URLs)'
    });
  }

  if (!requestId) {
    logger.warn({ msg: '[GET /result] Missing requestId' });
    return res.status(400).json({
      code: 'BAD_REQUEST',
      message: 'Missing requestId'
    });
  }

  const statusInfo = await searchJobStore.getStatus(requestId);

  // NOT_FOUND: requestId unknown or expired
  if (!statusInfo) {
    logger.warn({ requestId, msg: '[GET /result] NOT_FOUND' });
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Job not found or expired',
      requestId
    });
  }

  // DONE_FAILED: return error details with 500
  if (statusInfo.status === 'DONE_FAILED') {
    logger.warn({
      requestId,
      status: 'DONE_FAILED',
      error: statusInfo.error,
      msg: '[GET /result] DONE_FAILED'
    });

    return res.status(500).json({
      requestId,
      status: 'FAILED',
      error: statusInfo.error || { code: 'SEARCH_FAILED', message: 'Search failed' },
      contractsVersion: CONTRACTS_VERSION
    });
  }

  // PENDING/RUNNING: still processing
  if (statusInfo.status === 'PENDING' || statusInfo.status === 'RUNNING') {
    logger.info({
      requestId,
      status: statusInfo.status,
      progress: statusInfo.progress,
      msg: '[GET /result] NOT_DONE'
    });

    // Return 202 with "PENDING" status (frontend expects this)
    return res.status(202).json({
      requestId,
      status: 'PENDING',
      progress: statusInfo.progress,
      contractsVersion: CONTRACTS_VERSION
    });
  }

  // DONE_SUCCESS or DONE_CLARIFY: return full result
  const result = await searchJobStore.getResult(requestId);

  if (!result) {
    logger.error({ requestId, msg: '[GET /result] DONE but result missing' });
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Result missing from store',
      requestId
    });
  }

  logger.info({
    requestId,
    status: statusInfo.status,
    msg: `[GET /result] ${statusInfo.status} - returning stored result`
  });

  return res.status(200).json(result);
};

// Register handler for both /result and /result/ (prevents trailing-slash 404s in production)
router.get('/:requestId/result', getResultHandler);
router.get('/:requestId/result/', getResultHandler);

/**
 * GET /search/:requestId
 * Get job status and progress
 * 
 * Returns:
 * - 200 with { requestId, status, progress } if found
 * - 404 if not found or expired
 */
router.get('/:requestId', async (req: Request, res: Response) => {
  const { requestId } = req.params;

  if (!requestId) {
    logger.warn({ msg: '[GET /:requestId] Missing requestId' });
    return res.status(400).json({
      code: 'BAD_REQUEST',
      message: 'Missing requestId'
    });
  }

  const statusInfo = await searchJobStore.getStatus(requestId);

  if (!statusInfo) {
    logger.warn({ requestId, msg: '[GET /:requestId] NOT_FOUND' });
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Job not found or expired',
      requestId
    });
  }

  logger.info({
    requestId,
    status: statusInfo.status,
    progress: statusInfo.progress,
    msg: '[GET /:requestId] Status retrieved'
  });

  return res.status(200).json({
    requestId,
    status: statusInfo.status,
    progress: statusInfo.progress,
    ...(statusInfo.error && { error: statusInfo.error })
  });
});

/**
 * GET /search/stats
 * Get orchestrator statistics (for monitoring)
 * Note: V1 orchestrator removed - this endpoint now returns ROUTE2 stats
 */
router.get('/stats', (req: Request, res: Response) => {
  res.json({
    pipeline: 'route2',
    message: 'V1 orchestrator removed - use ROUTE2',
  });

});

export default router;
