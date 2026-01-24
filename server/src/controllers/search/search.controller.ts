/**
 * Unified Search Controller
 * Cleaned version: Resolved all type errors, scoping issues, and redundancy.
 */

import { Router, type Request, type Response } from 'express';
import { safeParseSearchRequest } from '../../services/search/types/search-request.dto.js';
import { createSearchError } from '../../services/search/types/search-response.dto.js';
import { createLLMProvider } from '../../llm/factory.js';
import { logger } from '../../lib/logger/structured-logger.js';
import { ROUTE2_ENABLED } from '../../config/route2.flags.js';
import { executeIntentStage, executeGate2Stage, searchRoute2 } from '../../services/search/route2/index.js';
import type { Route2Context } from '../../services/search/route2/index.js';

import { CONTRACTS_VERSION } from '../../contracts/search.contracts.js';
import { publishSearchEvent } from '../../infra/websocket/search-ws.publisher.js';
import {
  publishAssistantProgress,
  publishAssistantSuggestion,
  setAssistantLanguage
} from '../../infra/websocket/assistant-ws.publisher.js';
import { searchJobStore } from '../../services/search/job-store/index.js';
import { ASSISTANT_MODE } from '../../config/assistant.flags.js';
import { hashSessionId, sanitizePhotoUrls } from '../../utils/security.utils.js';

const router = Router();

type BackgroundParams = {
  requestId: string;
  queryData: any;
  context: Route2Context;
  resultUrl: string;
};

/**
 * Helper to handle the background execution of Route2 pipeline.
 */
async function executeBackgroundSearch(params: BackgroundParams): Promise<void> {
  const { requestId, queryData, context, resultUrl } = params;

  const abortController = new AbortController();
  const timeoutMs = 30_000;
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const ctxWithAbort = { ...context, signal: abortController.signal } as Route2Context & { signal: AbortSignal };

  try {
    if (ASSISTANT_MODE !== 'OFF') {
      setAssistantLanguage(requestId, 'auto', 'friendly');
      publishAssistantProgress(requestId, `שמעתי: ${queryData.query}`, 'query_received');
    }

    // Step 1: Accepted
    // P0 Fix: Non-fatal Redis write (job tracking is optional)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', 10);
    } catch (redisErr) {
      logger.error({ 
        requestId, 
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'accepted'
      }, 'Redis JobStore write failed (non-fatal) - continuing pipeline');
    }
    
    publishSearchEvent(requestId, {
      channel: 'search',
      contractsVersion: CONTRACTS_VERSION,
      type: 'progress',
      requestId,
      ts: new Date().toISOString(),
      stage: 'accepted',
      status: 'running',
      progress: 10,
      message: 'Search started'
    });

    // Step 2: Processing (route_llm)
    // P0 Fix: Non-fatal Redis write
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', 50);
    } catch (redisErr) {
      logger.error({ 
        requestId, 
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'route_llm'
      }, 'Redis JobStore write failed (non-fatal) - continuing pipeline');
    }
    
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

    if (ASSISTANT_MODE !== 'OFF') {
      publishAssistantProgress(requestId, 'שולח לגוגל ומביא תוצאות…', 'google_call');
    }

    const response = await searchRoute2(queryData, ctxWithAbort);

    if (ASSISTANT_MODE !== 'OFF') {
      publishAssistantProgress(requestId, `נמצאו ${response.results.length} תוצאות.`, 'results_received');
    }

    let terminalStatus: 'DONE_SUCCESS' | 'DONE_CLARIFY' = 'DONE_SUCCESS';
    let wsEventType: 'ready' | 'clarify' = 'ready';

    if (response.results.length === 0 && response.assist?.type === 'clarify') {
      terminalStatus = 'DONE_CLARIFY';
      wsEventType = 'clarify';
    }

    // P0 Fix: Non-fatal Redis writes
    try {
      await searchJobStore.setResult(requestId, response);
    } catch (redisErr) {
      logger.error({ 
        requestId, 
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setResult'
      }, 'Redis JobStore write failed (non-fatal) - result not persisted');
    }
    
    try {
      await searchJobStore.setStatus(requestId, terminalStatus, 100);
    } catch (redisErr) {
      logger.error({ 
        requestId, 
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'done'
      }, 'Redis JobStore write failed (non-fatal) - status not persisted');
    }

    // Final WS Notification
    if (wsEventType === 'clarify') {
      publishSearchEvent(requestId, {
        channel: 'search',
        contractsVersion: CONTRACTS_VERSION,
        type: 'clarify',
        requestId,
        ts: new Date().toISOString(),
        stage: 'done',
        message: response.assist?.message || 'Please clarify'
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
        resultCount: response.results.length,
        resultUrl // Optional based on contract
      });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    const isAborted = abortController.signal.aborted;
    let errorCode = isAborted ? 'TIMEOUT' : 'SEARCH_FAILED';

    // P0 Fix: Non-fatal Redis writes
    try {
      await searchJobStore.setError(requestId, errorCode, message, 'SEARCH_FAILED');
    } catch (redisErr) {
      logger.error({ 
        requestId, 
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setError'
      }, 'Redis JobStore write failed (non-fatal) - error not persisted');
    }
    
    try {
      await searchJobStore.setStatus(requestId, 'DONE_FAILED', 100);
    } catch (redisErr) {
      logger.error({ 
        requestId, 
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'error'
      }, 'Redis JobStore write failed (non-fatal) - status not persisted');
    }

    publishSearchEvent(requestId, {
      channel: 'search',
      contractsVersion: CONTRACTS_VERSION,
      type: 'error',
      requestId,
      ts: new Date().toISOString(),
      stage: 'done',
      code: errorCode as any,
      message
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * POST /search
 */
router.post('/', async (req: Request, res: Response) => {
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  try {
    const validation = safeParseSearchRequest(req.body);
    if (!validation.success || !validation.data) {
      res.status(400).json(createSearchError('Invalid request', 'VALIDATION_ERROR', validation.error));
      return;
    }

    const queryData = validation.data;
    const mode = (req.query.mode as 'sync' | 'async') || 'sync';
    const llm = createLLMProvider();

    if (!ROUTE2_ENABLED || !llm) {
      res.status(500).json(createSearchError('Config error', 'CONFIG_ERROR'));
      return;
    }

    // P0 Security: Use authenticated sessionId from JWT
    const authenticatedSessionId = req.ctx?.sessionId || queryData.sessionId;

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
      // P0 Security: Use authenticated session from JWT
      const ownerSessionId = authenticatedSessionId;
      const ownerUserId = (req as any).userId || null;

      if (!ownerSessionId) {
        logger.warn({
          requestId,
          operation: 'createJob',
          decision: 'REJECTED',
          reason: 'missing_session_id'
        }, '[P0 Security] Async job creation requires authenticated session');
        
        res.status(401).json(createSearchError('Authentication required', 'MISSING_SESSION_ID'));
        return;
      }

      // P0 Fix: Non-fatal Redis write - if job creation fails, return 202 anyway
      // Background execution will still proceed, just without Redis tracking
      try {
        await searchJobStore.createJob(requestId, {
          sessionId: queryData.sessionId || 'new',
          query: queryData.query,
          ownerUserId,
          ownerSessionId
        });
        
        logger.info({
          requestId,
          sessionHash: hashSessionId(ownerSessionId),
          operation: 'createJob',
          decision: 'ACCEPTED'
        }, '[P0 Security] Job created with session binding');
      } catch (redisErr) {
        logger.error({ 
          requestId, 
          error: redisErr instanceof Error ? redisErr.message : 'unknown',
          operation: 'createJob'
        }, 'Redis JobStore write failed (non-fatal) - job not tracked, but search will proceed');
      }

      const resultUrl = `/api/v1/search/${requestId}/result`;
      res.status(202).json({ requestId, resultUrl, contractsVersion: CONTRACTS_VERSION });

      void executeBackgroundSearch({ requestId, queryData, context: route2Context, resultUrl });
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
  const { requestId } = req.params;
  if (!requestId) return res.status(400).json({ code: 'MISSING_ID' });

  // P0 Security: Extract session from request
  const currentSessionId = req.ctx?.sessionId;
  
  // P0 Security: Get full job to check ownership
  const job = await searchJobStore.getJob(requestId);
  
  if (!job) {
    logger.warn({
      requestId,
      sessionHash: hashSessionId(currentSessionId),
      operation: 'getResult',
      decision: 'NOT_FOUND',
      reason: 'job_not_found'
    }, '[P0 Security] Job not found');
    
    return res.status(404).json({ code: 'NOT_FOUND', requestId });
  }

  // P0 Security: Validate session ownership
  const ownerSessionId = job.ownerSessionId;
  
  // Missing current session -> 401 Unauthorized
  if (!currentSessionId) {
    logger.warn({
      requestId,
      sessionHash: hashSessionId(currentSessionId),
      operation: 'getResult',
      decision: 'UNAUTHORIZED',
      reason: 'missing_session_id',
      traceId: req.traceId || 'unknown'
    }, '[P0 Security] Access denied: missing session in request');
    
    return res.status(401).json({ 
      code: 'UNAUTHORIZED', 
      message: 'Authentication required',
      traceId: req.traceId || 'unknown'
    });
  }
  
  // P0 CRITICAL: Legacy job without owner -> 404 (secure default, no disclosure)
  if (!ownerSessionId) {
    logger.warn({
      requestId,
      currentSessionHash: hashSessionId(currentSessionId),
      operation: 'getResult',
      decision: 'NOT_FOUND',
      reason: 'legacy_job_no_owner',
      traceId: req.traceId || 'unknown'
    }, '[P0 Security] Access denied: legacy job without owner');
    
    return res.status(404).json({ 
      code: 'NOT_FOUND', 
      requestId,
      traceId: req.traceId || 'unknown'
    });
  }
  
  // Session mismatch -> 404 to avoid disclosure
  if (currentSessionId !== ownerSessionId) {
    logger.warn({
      requestId,
      currentSessionHash: hashSessionId(currentSessionId),
      ownerSessionHash: hashSessionId(ownerSessionId),
      operation: 'getResult',
      decision: 'FORBIDDEN',
      reason: 'session_mismatch',
      traceId: req.traceId || 'unknown'
    }, '[P0 Security] Access denied: session mismatch');
    
    // Return 404 to avoid leaking requestId existence
    return res.status(404).json({ 
      code: 'NOT_FOUND', 
      requestId,
      traceId: req.traceId || 'unknown'
    });
  }
  
  // Log successful authorization
  logger.info({
    requestId,
    sessionHash: hashSessionId(currentSessionId),
    operation: 'getResult',
    decision: 'AUTHORIZED',
    traceId: req.traceId || 'unknown'
  }, '[P0 Security] Access granted');

  // Authorization passed - check job status
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
  const { requestId } = req.params;
  if (!requestId) return res.status(400).end();

  const statusInfo = await searchJobStore.getStatus(requestId);
  return statusInfo ? res.json(statusInfo) : res.status(404).end();
});

export default router;