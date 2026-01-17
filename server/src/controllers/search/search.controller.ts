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


const router = Router();

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

    // ASYNC mode: Still await results but send WS progress events
    // (Iteration 1: Frontend expects full response, not 202 ACK)
    if (mode === 'async') {
      const resultUrl = `/api/v1/search/${requestId}/result`;

      // init store
      searchAsyncStore.init(requestId);

      // WS progress: accepted (before processing)
      publishSearchEvent(requestId, {
        channel: 'search',
        contractsVersion: CONTRACTS_VERSION,
        type: 'progress',
        requestId,
        ts: new Date().toISOString(),
        stage: 'accepted',
        message: 'request accepted',
      });

      // Execute search (await results - frontend expects full response)
      try {
        const response = await searchRoute2(validation.data!, route2Context);

        // store done
        searchAsyncStore.setDone(requestId, response, response.results.length);

        // WS ready: results
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
        });

        req.log.info(
          { requestId, resultCount: response.results.length, pipeline: 'route2' },
          'Async search completed (ROUTE2)'
        );

        // Return full response (frontend expects this)
        res.json(response);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        searchAsyncStore.setFailed(requestId, 'INTERNAL_ERROR', message);

        publishSearchEvent(requestId, {
          channel: 'search',
          contractsVersion: CONTRACTS_VERSION,
          type: 'error',
          requestId,
          ts: new Date().toISOString(),
          stage: 'done',
          code: 'INTERNAL_ERROR',
          message,
        });

        req.log.error({ requestId, err }, 'Async search failed (ROUTE2)');

        res.status(500).json(
          createSearchError(message, 'SEARCH_ERROR')
        );
      }

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
 * Async result fetch endpoint (Iteration 1)
 */
router.get('/:requestId/result', (req: Request, res: Response) => {
  const requestId = req.params.requestId;

  if (!requestId) {
    return res.status(400).json({
      error: 'Missing requestId',
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  const entry = searchAsyncStore.get(requestId);

  if (!entry) {
    return res.status(404).json({
      requestId,
      status: 'not_found',
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  if (entry.status === 'running') {
    return res.status(202).json({
      requestId,
      status: 'running',
      contractsVersion: CONTRACTS_VERSION,
    });
  }

  if (entry.status === 'failed') {
    return res.status(500).json({
      requestId,
      status: 'failed',
      contractsVersion: CONTRACTS_VERSION,
      error: entry.error ?? { code: 'INTERNAL_ERROR', message: 'Unknown error' },
    });
  }

  // Status is 'done' - return the full SearchResponse object
  if (!entry.result) {
    return res.status(500).json({
      requestId,
      status: 'failed',
      contractsVersion: CONTRACTS_VERSION,
      error: { code: 'INTERNAL_ERROR', message: 'Result missing from store' },
    });
  }

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
