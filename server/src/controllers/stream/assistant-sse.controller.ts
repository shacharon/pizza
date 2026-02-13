/**
 * Assistant SSE Controller
 * Server-Sent Events endpoint for assistant/narrator streaming
 * 
 * Endpoint:
 * - GET /api/v1/stream/assistant/:requestId
 * 
 * Auth:
 * - Uses authSessionOrJwt (cookie-first, then Bearer JWT fallback)
 * - No Authorization header required if session cookie present
 * 
 * SSE Events:
 * - meta: Initial metadata (requestId, language, startedAt)
 * - message: Complete assistant message (AssistantOutput shape)
 * - done: Stream completion
 * - error: Error event
 * 
 * Flow:
 * - For CLARIFY/STOPPED: send that message, then done
 * - For SEARCH: send narration template immediately, poll for results, send SUMMARY, then done
 */

import { Router, type Request, type Response } from 'express';
import { logger } from '../../lib/logger/structured-logger.js';
import { getConfig } from '../../config/env.js';
import { authSessionOrJwt, type AuthenticatedRequest } from '../../middleware/auth-session-or-jwt.middleware.js';
import { searchJobStore } from '../../services/search/job-store/index.js';
import { createLLMProvider } from '../../llm/factory.js';
import type { JobStatus } from '../../services/search/job-store/job-store.interface.js';
import { 
  generateAssistantMessage, 
  type AssistantContext,
  type AssistantOutput,
  type AssistantLanguage
} from '../../services/search/route2/assistant/assistant-llm.service.js';
import { withTimeout } from '../../lib/reliability/timeout-guard.js';

const router = Router();
const config = getConfig();

// SSE timeout (separate from LLM timeout)
const ASSISTANT_SSE_TIMEOUT_MS = parseInt(process.env.ASSISTANT_SSE_TIMEOUT_MS || '20000', 10);

// Poll interval for waiting on results (250-500ms)
const RESULT_POLL_INTERVAL_MS = 400;

/**
 * Send SSE event
 */
function sendSSEEvent(res: Response, event: string, data: any): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/**
 * Get localized narration template (short, 1 sentence)
 * No LLM - deterministic template
 */
function getNarrationTemplate(language: AssistantLanguage): string {
  switch (language) {
    case 'he':
      return 'מחפש עכשיו… עוד רגע תוצאות.';
    case 'en':
      return 'Searching now… results in a moment.';
    case 'ru':
      return 'Ищу сейчас… результаты через мгновение.';
    case 'ar':
      return 'البحث الآن… النتائج في لحظة.';
    case 'fr':
      return 'Recherche en cours… résultats dans un instant.';
    case 'es':
      return 'Buscando ahora… resultados en un momento.';
    default:
      return 'Searching now… results in a moment.';
  }
}

/**
 * Get localized timeout message
 */
function getTimeoutMessage(language: AssistantLanguage): string {
  switch (language) {
    case 'he':
      return 'עדיין עובד… בדוק תוצאות למטה.';
    case 'en':
      return 'Still working… check results below.';
    case 'ru':
      return 'Всё ещё работаю… проверьте результаты ниже.';
    case 'ar':
      return 'لا يزال يعمل… تحقق من النتائج أدناه.';
    case 'fr':
      return 'Toujours en cours… vérifiez les résultats ci-dessous.';
    case 'es':
      return 'Aún trabajando… revisa los resultados abajo.';
    default:
      return 'Still working… check results below.';
  }
}

/**
 * Sleep helper for polling
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Reconstruct AssistantContext from job/result
 * Best effort: Falls back to GENERIC_QUERY_NARRATION if cannot reconstruct SUMMARY
 */
async function reconstructAssistantContext(
  requestId: string,
  job: any,
  result: any
): Promise<AssistantContext> {
  const query = job?.query || 'unknown query';
  const language = result?.query?.language || 'en';

  // If result has results array, try to build SUMMARY context
  if (result && result.results && Array.isArray(result.results)) {
    const resultCount = result.results.length;
    
    // Extract top 3 restaurant names
    const top3Names = result.results
      .slice(0, 3)
      .map((r: any) => r.name || 'Unknown')
      .filter(Boolean);

    // Build SUMMARY context
    const summaryContext: AssistantContext = {
      type: 'SUMMARY',
      query,
      language: language as any,
      resultCount,
      top3Names,
      metadata: {
        filtersApplied: result.meta?.appliedFilters || []
      }
    };

    return summaryContext;
  }

  // Fallback: GENERIC_QUERY_NARRATION (safe default)
  logger.info(
    { requestId, reason: 'no_results_for_summary' },
    '[AssistantSSE] Cannot reconstruct SUMMARY, using GENERIC_QUERY_NARRATION fallback'
  );

  const fallbackContext: AssistantContext = {
    type: 'GENERIC_QUERY_NARRATION',
    query,
    language: language as any,
    resultCount: 0,
    usedCurrentLocation: false
  };

  return fallbackContext;
}

/**
 * Best-effort ownership validation
 * Validates job ownership if JobStore available
 */
async function validateOwnership(
  requestId: string,
  authReq: AuthenticatedRequest
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const job = await searchJobStore.getJob(requestId);

    // Job not found - could be old/expired request
    if (!job) {
      logger.warn(
        { requestId, reason: 'job_not_found' },
        '[AssistantSSE] Job not found in store (may be expired)'
      );
      // Best-effort: allow if job not found (may be legitimate old request)
      return { valid: true, reason: 'job_not_found_allowed' };
    }

    // If job has ownerSessionId, validate it matches authenticated session
    if (job.ownerSessionId) {
      if (job.ownerSessionId !== authReq.sessionId) {
        logger.warn(
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
        logger.warn(
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

    logger.debug(
      { requestId, validated: true },
      '[AssistantSSE] Ownership validated'
    );

    return { valid: true };
  } catch (error) {
    // LIMITATION: If Redis unavailable, we cannot validate ownership
    // Log warning but allow request (best-effort)
    logger.warn(
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

/**
 * GET /api/v1/stream/assistant/:requestId
 * SSE endpoint for assistant streaming
 * 
 * Authentication: Session cookie (preferred) or Bearer JWT
 * Ownership: Best-effort validation via JobStore
 * 
 * Flow:
 * 1. Determine decision type (CLARIFY/STOPPED vs SEARCH)
 * 2a. CLARIFY/STOPPED: generate message with LLM, send done
 * 2b. SEARCH: send narration template (no LLM), poll for results, send SUMMARY, send done
 */
router.get('/assistant/:requestId', authSessionOrJwt, async (req: Request, res: Response) => {
  const requestId = req.params.requestId as string;
  const traceId = (req as any).traceId || 'unknown';
  const authReq = req as AuthenticatedRequest;
  const startTime = Date.now();

  logger.info(
    {
      requestId,
      traceId,
      sessionId: authReq.sessionId,
      userId: authReq.userId || 'none',
      event: 'assistant_sse_started'
    },
    '[AssistantSSE] SSE stream started'
  );

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Flush headers immediately
  res.flushHeaders();

  // Abort controller for cleanup
  const abortController = new AbortController();
  let clientDisconnected = false;

  // Handle client disconnect
  req.on('close', () => {
    clientDisconnected = true;
    abortController.abort();
    
    const durationMs = Date.now() - startTime;
    logger.info(
      {
        requestId,
        durationMs,
        event: 'assistant_sse_client_closed'
      },
      '[AssistantSSE] Client disconnected'
    );
  });

  try {
    // Best-effort ownership validation
    const ownership = await validateOwnership(requestId, authReq);
    
    if (!ownership.valid) {
      sendSSEEvent(res, 'error', {
        code: 'UNAUTHORIZED',
        message: 'Access denied',
        reason: ownership.reason
      });
      
      logger.warn(
        {
          requestId,
          reason: ownership.reason,
          event: 'assistant_sse_error'
        },
        '[AssistantSSE] Ownership validation failed'
      );
      
      res.end();
      return;
    }

    // Load job to determine decision type
    const job = await searchJobStore.getJob(requestId);
    const jobStatus: JobStatus | null = job?.status || null;
    
    // Detect language (best-effort)
    const result = await searchJobStore.getResult(requestId);
    const assistantLanguage: AssistantLanguage = ((result as any)?.query?.language || 'en') as AssistantLanguage;

    // Send meta event
    sendSSEEvent(res, 'meta', {
      requestId,
      language: assistantLanguage,
      startedAt: new Date().toISOString()
    });

    // Check for client disconnect
    if (clientDisconnected || abortController.signal.aborted) {
      logger.debug({ requestId }, '[AssistantSSE] Client disconnected after meta');
      res.end();
      return;
    }

    // Determine decision type
    const isClarify = jobStatus === 'DONE_CLARIFY';
    const isStopped = jobStatus === 'DONE_STOPPED';
    const isSearch = !isClarify && !isStopped; // Default to SEARCH (safe)

    logger.debug(
      { requestId, jobStatus, isClarify, isStopped, isSearch },
      '[AssistantSSE] Decision type determined'
    );

    // Branch: CLARIFY or STOPPED
    if (isClarify || isStopped) {
      // Generate assistant message with LLM for CLARIFY/STOPPED
      const context = await reconstructAssistantContext(requestId, job, result);
      
      const llmProvider = createLLMProvider();
      if (!llmProvider) {
        throw new Error('LLM provider not available');
      }

      const assistant = await generateAssistantMessage(
        context,
        llmProvider,
        requestId,
        { 
          traceId,
          ...(authReq.sessionId && { sessionId: authReq.sessionId })
        }
      );

      if (clientDisconnected || abortController.signal.aborted) {
        logger.debug({ requestId }, '[AssistantSSE] Client disconnected after CLARIFY/STOPPED generation');
        res.end();
        return;
      }

      // Send message event
      sendSSEEvent(res, 'message', {
        type: assistant.type,
        message: assistant.message,
        question: assistant.question,
        blocksSearch: assistant.blocksSearch,
        language: assistantLanguage
      });

      logger.info(
        { requestId, type: assistant.type, language: assistantLanguage },
        '[AssistantSSE] CLARIFY/STOPPED message sent'
      );

      // Send done
      sendSSEEvent(res, 'done', {});

      const durationMs = Date.now() - startTime;
      logger.info(
        { requestId, durationMs, flow: 'clarify_stopped', event: 'assistant_sse_completed' },
        '[AssistantSSE] SSE stream completed'
      );

      res.end();
      return;
    }

    // Branch: SEARCH
    // Step 1: Send immediate narration template (no LLM)
    const narrationMessage: AssistantOutput = {
      type: 'GENERIC_QUERY_NARRATION',
      message: getNarrationTemplate(assistantLanguage),
      question: null,
      suggestedAction: 'NONE',
      blocksSearch: false
    };

    sendSSEEvent(res, 'message', {
      type: narrationMessage.type,
      message: narrationMessage.message,
      question: narrationMessage.question,
      blocksSearch: narrationMessage.blocksSearch,
      language: assistantLanguage
    });

    logger.info(
      { requestId, language: assistantLanguage, event: 'assistant_sse_narration_sent' },
      '[AssistantSSE] Narration template sent'
    );

    // Check for client disconnect
    if (clientDisconnected || abortController.signal.aborted) {
      logger.debug({ requestId }, '[AssistantSSE] Client disconnected after narration');
      res.end();
      return;
    }

    // Step 2: Poll for results readiness (up to ASSISTANT_SSE_TIMEOUT_MS)
    const pollDeadline = Date.now() + ASSISTANT_SSE_TIMEOUT_MS;
    let resultsReady = false;
    let latestStatus: JobStatus | null = jobStatus;

    while (Date.now() < pollDeadline) {
      if (clientDisconnected || abortController.signal.aborted) {
        logger.debug({ requestId }, '[AssistantSSE] Client disconnected during poll');
        res.end();
        return;
      }

      // Check job status
      const statusCheck = await searchJobStore.getStatus(requestId);
      latestStatus = statusCheck?.status || null;

      if (latestStatus === 'DONE_SUCCESS') {
        resultsReady = true;
        logger.debug({ requestId, latestStatus }, '[AssistantSSE] Results ready');
        break;
      }

      // Poll interval
      await sleep(RESULT_POLL_INTERVAL_MS);
    }

    // Check for client disconnect after polling
    if (clientDisconnected || abortController.signal.aborted) {
      logger.debug({ requestId }, '[AssistantSSE] Client disconnected after poll');
      res.end();
      return;
    }

    // Step 3: Generate SUMMARY if results ready, else timeout message
    if (resultsReady) {
      // Load fresh result
      const freshResult = await searchJobStore.getResult(requestId);
      const summaryContext = await reconstructAssistantContext(requestId, job, freshResult);

      const llmProvider = createLLMProvider();
      if (!llmProvider) {
        throw new Error('LLM provider not available');
      }

      const summaryAssistant = await generateAssistantMessage(
        summaryContext,
        llmProvider,
        requestId,
        { 
          traceId,
          ...(authReq.sessionId && { sessionId: authReq.sessionId })
        }
      );

      if (clientDisconnected || abortController.signal.aborted) {
        logger.debug({ requestId }, '[AssistantSSE] Client disconnected after SUMMARY generation');
        res.end();
        return;
      }

      // Send SUMMARY message
      sendSSEEvent(res, 'message', {
        type: summaryAssistant.type,
        message: summaryAssistant.message,
        question: summaryAssistant.question,
        blocksSearch: summaryAssistant.blocksSearch,
        language: assistantLanguage
      });

      logger.info(
        { requestId, type: summaryAssistant.type, language: assistantLanguage, event: 'assistant_sse_summary_sent' },
        '[AssistantSSE] SUMMARY message sent'
      );
    } else {
      // Timeout: send timeout message (no LLM)
      const timeoutMessage: AssistantOutput = {
        type: 'GENERIC_QUERY_NARRATION',
        message: getTimeoutMessage(assistantLanguage),
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      };

      sendSSEEvent(res, 'message', {
        type: timeoutMessage.type,
        message: timeoutMessage.message,
        question: timeoutMessage.question,
        blocksSearch: timeoutMessage.blocksSearch,
        language: assistantLanguage
      });

      logger.warn(
        { requestId, latestStatus, language: assistantLanguage, event: 'assistant_sse_timeout' },
        '[AssistantSSE] Timeout waiting for results'
      );
    }

    // Send done
    sendSSEEvent(res, 'done', {});

    const durationMs = Date.now() - startTime;
    logger.info(
      { requestId, durationMs, resultsReady, flow: 'search', event: 'assistant_sse_completed' },
      '[AssistantSSE] SSE stream completed'
    );

    res.end();
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout');
    const isAborted = errorMsg.toLowerCase().includes('abort');

    // Don't send error if client already disconnected
    if (clientDisconnected || abortController.signal.aborted) {
      logger.debug(
        { requestId, durationMs },
        '[AssistantSSE] Client disconnected during error handling'
      );
      res.end();
      return;
    }

    const errorCode = isTimeout ? 'LLM_TIMEOUT' : (isAborted ? 'ABORTED' : 'LLM_FAILED');

    sendSSEEvent(res, 'error', {
      code: errorCode,
      message: 'Failed to generate assistant message'
    });

    logger.error(
      {
        requestId,
        durationMs,
        errorCode,
        error: errorMsg,
        event: 'assistant_sse_error'
      },
      '[AssistantSSE] SSE stream failed'
    );

    res.end();
  }
});

export default router;
