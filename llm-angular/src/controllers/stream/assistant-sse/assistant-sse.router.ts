/**
 * Assistant SSE Router
 * Express router wiring for assistant SSE endpoint
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
import { logger } from '../../../lib/logger/structured-logger.js';
import { getConfig } from '../../../config/env.js';
import { authSessionOrJwt } from '../../../middleware/auth-session-or-jwt.middleware.js';
import { searchJobStore } from '../../../services/search/job-store/index.js';
import { createLLMProvider } from '../../../llm/factory.js';
import { AssistantSseOrchestrator } from './assistant-sse.orchestrator.js';

const router = Router();
const config = getConfig();

// SSE timeout (separate from LLM timeout)
const ASSISTANT_SSE_TIMEOUT_MS = parseInt(process.env.ASSISTANT_SSE_TIMEOUT_MS || '20000', 10);

// Poll interval for waiting on results (250-500ms)
const RESULT_POLL_INTERVAL_MS = 400;

// Initialize orchestrator
const orchestrator = new AssistantSseOrchestrator(
  searchJobStore,
  createLLMProvider,
  logger,
  {
    timeoutMs: ASSISTANT_SSE_TIMEOUT_MS,
    pollIntervalMs: RESULT_POLL_INTERVAL_MS
  }
);

/**
 * GET /api/v1/stream/assistant/:requestId
 * SSE endpoint for assistant streaming
 * 
 * Authentication: Signed session cookie or JWT (authSessionOrJwt - same as search/analytics)
 * Cookie is issued by POST /auth/bootstrap (signed with SESSION_COOKIE_SECRET, no Redis)
 *
 * Flow:
 * 1. Determine decision type (CLARIFY/STOPPED vs SEARCH)
 * 2a. CLARIFY/STOPPED: generate message with LLM, send done
 * 2b. SEARCH: send narration template (no LLM), poll for results, send SUMMARY, send done
 */
router.get('/assistant/:requestId', authSessionOrJwt, async (req: Request, res: Response) => {
  // Longer timeout for SSE (gateways may use 60s+; keepalive prevents idle close)
  const streamTimeoutMs = Math.max(120_000, ASSISTANT_SSE_TIMEOUT_MS * 2);
  req.setTimeout(streamTimeoutMs);
  res.setTimeout(streamTimeoutMs);

  // Set CORS headers for SSE with credentials
  // Must be specific origin (not *) when using credentials
  const origin = req.headers.origin;
  if (origin && config.frontendOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  
  await orchestrator.handleRequest(req, res);
});

export default router;
