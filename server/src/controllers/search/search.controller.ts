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

    // ASYNC mode: 202 ACK + detached background execution
    if (mode === 'async') {
      const resultUrl = `/api/v1/search/${requestId}/result`;

      // Log async branch hit ONCE with all relevant info
      logger.info({
        requestId,
        mode: 'async',
        resultUrl,
        query: validation.data!.query,
        msg: '[ASYNC] Request accepted, returning 202'
      });

      // init store (logs transition to PENDING)
      searchAsyncStore.init(requestId);

      // Return 202 Accepted (minimal payload - no placeholder results)
      res.status(202).json({
        requestId,
        resultUrl,
        contractsVersion: CONTRACTS_VERSION,
      });

      // WS progress: accepted
      publishSearchEvent(requestId, {
        channel: 'search',
        contractsVersion: CONTRACTS_VERSION,
        type: 'progress',
        requestId,
        ts: new Date().toISOString(),
        stage: 'accepted',
        message: 'request accepted',
      });

      // Kick off detached background execution (NOT tied to request lifecycle)
      void runAsyncSearch({
        requestId,
        query: validation.data!,
        resultUrl,
        llmProvider: llm,
        userLocation: validation.data!.userLocation ?? null,
        ...(req.traceId !== undefined && { traceId: req.traceId }),
        ...(validation.data!.sessionId !== undefined && { sessionId: validation.data!.sessionId }),
      });

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
 * - 202 if still pending (with resultUrl for retry)
 * - 200 if done (full SearchResponse)
 * - 500 if failed (with error details)
 */
router.get('/:requestId/result', (req: Request, res: Response) => {
  const requestId = req.params.requestId;

  if (!requestId) {
    logger.warn({ msg: '[GET /result] Missing requestId' });
    return res.status(400).json({
      code: 'BAD_REQUEST',
      message: 'Missing requestId',
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  const entry = searchAsyncStore.get(requestId);

  // NOT_FOUND: requestId unknown or expired
  if (!entry) {
    logger.warn({ requestId, msg: '[GET /result] NOT_FOUND' });
    return res.status(404).json({
      code: 'NOT_FOUND',
      message: 'Request not found or expired',
      requestId,
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  // PENDING: still processing
  if (entry.status === 'PENDING') {
    const resultUrl = `/api/v1/search/${requestId}/result`;
    logger.info({ requestId, status: 'PENDING', msg: '[GET /result] PENDING' });

    return res.status(202).json({
      requestId,
      status: 'PENDING',
      resultUrl,
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  // FAILED: pipeline error
  if (entry.status === 'FAILED') {
    logger.warn({
      requestId,
      status: 'FAILED',
      error: entry.error,
      msg: '[GET /result] FAILED'
    });

    return res.status(500).json({
      code: entry.error?.code || 'INTERNAL_ERROR',
      message: entry.error?.message || 'Unknown error',
      requestId,
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  // DONE: success - return full SearchResponse
  if (!entry.result) {
    logger.error({ requestId, msg: '[GET /result] DONE but result missing' });
    return res.status(500).json({
      code: 'INTERNAL_ERROR',
      message: 'Result missing from store',
      requestId,
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  logger.info({
    requestId,
    status: 'DONE',
    resultCount: entry.resultCount,
    msg: '[GET /result] DONE - returning stored response'
  });

  return res.status(200).json(entry.result);
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
