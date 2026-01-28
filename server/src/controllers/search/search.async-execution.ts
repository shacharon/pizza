/**
 * Search Async Execution
 * Handles background execution of search pipeline for async mode (202 Accepted)
 */

import { logger } from '../../lib/logger/structured-logger.js';
import { publishSearchEvent } from '../../infra/websocket/search-ws.publisher.js';
import { searchJobStore } from '../../services/search/job-store/index.js';
import { searchRoute2 } from '../../services/search/route2/index.js';
import { CONTRACTS_VERSION } from '../../contracts/search.contracts.js';
import type { Route2Context } from '../../services/search/route2/index.js';
import type { SearchRequest } from '../../services/search/types/search-request.dto.js';

export type BackgroundParams = {
  requestId: string;
  queryData: SearchRequest;
  context: Route2Context;
  resultUrl: string;
};

/**
 * Helper to handle the background execution of Route2 pipeline.
 */
export async function executeBackgroundSearch(params: BackgroundParams): Promise<void> {
  const { requestId, queryData, context, resultUrl } = params;

  const abortController = new AbortController();
  const timeoutMs = 30_000;
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  const ctxWithAbort = { ...context, signal: abortController.signal } as Route2Context & { signal: AbortSignal };

  try {
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

    const response = await searchRoute2(queryData, ctxWithAbort);

    // Note: Assistant messages are now handled by route2 orchestrator (LLM-based)
    // No need for separate progress narration here

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
