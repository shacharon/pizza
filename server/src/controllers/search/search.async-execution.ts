/**
 * Search Async Execution
 * Handles background execution of search pipeline for async mode (202 Accepted)
 */

import { logger } from '../../lib/logger/structured-logger.js';
import { publishSearchEvent } from '../../infra/websocket/search-ws.publisher.js';
import { searchJobStore } from '../../services/search/job-store/index.js';
import { JOB_MILESTONES } from '../../services/search/job-store/job-milestones.js';
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

  // Heartbeat ticker: Keep RUNNING jobs alive by updating updatedAt every 15s
  const HEARTBEAT_INTERVAL_MS = 15_000; // 15 seconds
  let heartbeatIntervalId: NodeJS.Timeout | null = null;

  try {
    // Step 1: Accepted (JOB_CREATED milestone)
    // P0 Fix: Non-fatal Redis write (job tracking is optional)
    try {
      await searchJobStore.setStatus(requestId, 'RUNNING', JOB_MILESTONES.JOB_CREATED);
      
      // OBSERVABILITY: Log status transition
      logger.info({
        requestId,
        status: 'RUNNING',
        progress: JOB_MILESTONES.JOB_CREATED,
        event: 'status_running'
      }, '[Observability] Job status set to RUNNING');

      // Start heartbeat ticker to prevent stale detection
      heartbeatIntervalId = setInterval(async () => {
        try {
          await searchJobStore.updateHeartbeat(requestId);
        } catch (hbErr) {
          logger.warn({
            requestId,
            error: hbErr instanceof Error ? hbErr.message : 'unknown',
            operation: 'updateHeartbeat'
          }, '[Heartbeat] Failed to update heartbeat (non-fatal)');
        }
      }, HEARTBEAT_INTERVAL_MS);

      logger.debug({
        requestId,
        intervalMs: HEARTBEAT_INTERVAL_MS,
        event: 'heartbeat_started'
      }, '[Heartbeat] Started heartbeat ticker');
    } catch (redisErr) {
      logger.error({
        requestId,
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'accepted',
        event: 'ws_error'
      }, 'Redis JobStore write failed (non-fatal) - continuing pipeline');
    }

    // GUARDRAIL: WS publish is optional - never blocks search execution
    try {
      publishSearchEvent(requestId, {
        channel: 'search',
        contractsVersion: CONTRACTS_VERSION,
        type: 'progress',
        requestId,
        ts: new Date().toISOString(),
        stage: 'accepted',
        status: 'running',
        progress: JOB_MILESTONES.JOB_CREATED,
        message: 'Search started'
      });
    } catch (wsErr) {
      logger.warn({
        requestId,
        error: wsErr instanceof Error ? wsErr.message : 'unknown',
        event: 'ws_publish_error'
      }, '[WS] Failed to publish progress event (non-fatal)');
    }

    const response = await searchRoute2(queryData, ctxWithAbort);

    // Note: Assistant messages are now handled by route2 orchestrator (LLM-based)
    // No need for separate progress narration here

    let terminalStatus: 'DONE_SUCCESS' | 'DONE_CLARIFY' | 'DONE_STOPPED' = 'DONE_SUCCESS';
    let wsEventType: 'ready' | 'clarify' | 'stopped' = 'ready';

    // Determine terminal status based on response
    if (response.results.length === 0) {
      // Check if this is a GATE_FAIL/STOP scenario
      const isGateStop = response.meta?.source === 'route2_gate_stop' ||
        response.meta?.failureReason === 'LOW_CONFIDENCE';

      if (isGateStop) {
        terminalStatus = 'DONE_STOPPED';
        wsEventType = 'stopped';
      } else if (response.assist?.type === 'clarify') {
        terminalStatus = 'DONE_CLARIFY';
        wsEventType = 'clarify';
      }
    }

    // P0 Fix: Non-fatal Redis writes
    try {
      await searchJobStore.setResult(requestId, response);
      
      // OBSERVABILITY: Log result storage success
      logger.info({
        requestId,
        resultCount: response.results?.length || 0,
        hasAssist: Boolean(response.assist),
        event: 'result_stored'
      }, '[Observability] Search result stored successfully');
    } catch (redisErr) {
      logger.error({
        requestId,
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setResult',
        event: 'ws_error'
      }, 'Redis JobStore write failed (non-fatal) - result not persisted');
    }

    try {
      await searchJobStore.setStatus(requestId, terminalStatus, JOB_MILESTONES.TERMINAL);
      
      // OBSERVABILITY: Log terminal status
      logger.info({
        requestId,
        status: terminalStatus,
        progress: JOB_MILESTONES.TERMINAL,
        event: 'status_done'
      }, '[Observability] Job reached terminal status');
    } catch (redisErr) {
      logger.error({
        requestId,
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'done',
        event: 'ws_error'
      }, 'Redis JobStore write failed (non-fatal) - status not persisted');
    }

    // Final WS Notification - GUARDRAIL: Never blocks, even if WS fails
    try {
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
      } else if (wsEventType === 'stopped') {
        // GATE STOP - pipeline stopped, no results by design
        publishSearchEvent(requestId, {
          channel: 'search',
          contractsVersion: CONTRACTS_VERSION,
          type: 'ready',
          requestId,
          ts: new Date().toISOString(),
          stage: 'done',
          ready: 'stop',
          decision: 'STOP',
          resultCount: 0,
          finalStatus: 'DONE_STOPPED'
        } as any);
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
    } catch (wsErr) {
      logger.warn({
        requestId,
        error: wsErr instanceof Error ? wsErr.message : 'unknown',
        wsEventType,
        event: 'ws_publish_error'
      }, '[WS] Failed to publish final event (non-fatal) - result still stored');
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
      await searchJobStore.setStatus(requestId, 'DONE_FAILED', JOB_MILESTONES.TERMINAL);
    } catch (redisErr) {
      logger.error({
        requestId,
        error: redisErr instanceof Error ? redisErr.message : 'unknown',
        operation: 'setStatus',
        stage: 'error',
        event: 'ws_error'
      }, 'Redis JobStore write failed (non-fatal) - status not persisted');
    }

    // GUARDRAIL: WS publish is optional - never blocks error handling
    try {
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
    } catch (wsErr) {
      logger.warn({
        requestId,
        error: wsErr instanceof Error ? wsErr.message : 'unknown',
        event: 'ws_publish_error'
      }, '[WS] Failed to publish error event (non-fatal)');
    }
  } finally {
    clearTimeout(timeoutId);

    // Stop heartbeat ticker
    if (heartbeatIntervalId) {
      clearInterval(heartbeatIntervalId);
      logger.debug({
        requestId,
        event: 'heartbeat_stopped'
      }, '[Heartbeat] Stopped heartbeat ticker');
    }
  }
}
