/**
 * Assistant SSE Orchestrator (Thin Coordinator)
 * Coordinates the SSE assistant flow using state machine
 * Single responsibility: Flow orchestration via state machine
 */

import type { Logger } from 'pino';
import type { Request, Response } from 'express';
import type { LLMProvider } from '../../../llm/types.js';
import type { ISearchJobStore, JobStatus } from '../../../services/search/job-store/job-store.interface.js';
import type { AuthenticatedRequest } from '../../../middleware/auth-session-or-jwt.middleware.js';
import type { AssistantLanguage, AssistantOutput } from '../../../services/search/route2/assistant/assistant-llm.service.js';
import { streamAssistantMessage } from '../../../services/search/route2/assistant/assistant-llm.service.js';
import { SseWriter } from './sse-writer.js';
import { NarrationTemplates } from './narration-templates.js';
import { OwnershipValidator } from './ownership-validator.js';
import { AssistantContextBuilder } from './assistant-context-builder.js';
import { SseStateMachine, SseState } from './sse-state-machine.js';
import { PollingStrategy } from './polling-strategy.js';
import { handleSseError } from './sse-error-handler.js';
import { getExistingRedisClient } from '../../../lib/redis/redis-client.js';

export interface AssistantSseOrchestratorConfig {
  timeoutMs: number;
  pollIntervalMs: number;
}

export class AssistantSseOrchestrator {
  private readonly narrationTemplates: NarrationTemplates;
  private readonly ownershipValidator: OwnershipValidator;
  private readonly contextBuilder: AssistantContextBuilder;
  private readonly pollingStrategy: PollingStrategy;
  private readonly ASSISTANT_LOCK_TTL_SECONDS = 30; // 30 second lock TTL

  constructor(
    private readonly jobStore: ISearchJobStore,
    private readonly createLLMProvider: () => LLMProvider | null,
    private readonly logger: Logger,
    private readonly config: AssistantSseOrchestratorConfig
  ) {
    this.narrationTemplates = new NarrationTemplates();
    this.ownershipValidator = new OwnershipValidator(jobStore, logger);
    this.contextBuilder = new AssistantContextBuilder(logger);
    this.pollingStrategy = new PollingStrategy(
      jobStore,
      logger,
      {
        pollIntervalMs: config.pollIntervalMs,
        timeoutMs: config.timeoutMs
      }
    );
  }

  /**
   * Acquire Redis lock for assistant generation idempotency
   * Prevents duplicate LLM calls if multiple SSE connections occur
   * 
   * @param requestId - Request ID
   * @returns True if lock acquired, false if already locked
   */
  private async acquireAssistantLock(requestId: string): Promise<boolean> {
    const redis = getExistingRedisClient();
    
    // Graceful degradation: If Redis unavailable, allow generation
    if (!redis) {
      this.logger.debug(
        { requestId, event: 'assistant_lock_skipped_no_redis' },
        '[AssistantSSE] Redis unavailable, skipping lock (degraded mode)'
      );
      return true;
    }

    const lockKey = `assistant:lock:${requestId}`;
    
    try {
      // SET NX EX: Set if Not eXists with EXpiration
      const result = await redis.set(lockKey, '1', 'EX', this.ASSISTANT_LOCK_TTL_SECONDS, 'NX');
      
      const acquired = result === 'OK';
      
      if (!acquired) {
        this.logger.info(
          { 
            requestId,
            lockKey,
            event: 'assistant_generation_deduped'
          },
          '[AssistantSSE] Lock already held, skipping duplicate LLM call'
        );
      }
      
      return acquired;
    } catch (err) {
      this.logger.warn(
        {
          requestId,
          lockKey,
          error: err instanceof Error ? err.message : String(err),
          event: 'assistant_lock_error'
        },
        '[AssistantSSE] Failed to acquire lock, allowing generation (fail-open)'
      );
      // Fail-open: Allow generation if lock acquisition fails
      return true;
    }
  }

  /**
   * Release assistant generation lock
   * Best-effort cleanup (TTL handles expiration anyway)
   * 
   * @param requestId - Request ID
   */
  private async releaseAssistantLock(requestId: string): Promise<void> {
    const redis = getExistingRedisClient();
    
    if (!redis) {
      return;
    }

    const lockKey = `assistant:lock:${requestId}`;
    
    try {
      await redis.del(lockKey);
      
      this.logger.debug(
        { requestId, lockKey, event: 'assistant_lock_released' },
        '[AssistantSSE] Lock released'
      );
    } catch (err) {
      // Non-fatal: Lock will expire via TTL
      this.logger.debug(
        {
          requestId,
          lockKey,
          error: err instanceof Error ? err.message : String(err),
          event: 'assistant_lock_release_failed'
        },
        '[AssistantSSE] Failed to release lock (non-fatal, TTL will expire)'
      );
    }
  }

  /**
   * Handle SSE request
   */
  async handleRequest(req: Request, res: Response): Promise<void> {
    const requestId = req.params.requestId as string;
    const traceId = (req as any).traceId || 'unknown';
    const authReq = req as AuthenticatedRequest;
    const startTime = Date.now();

    this.logger.info(
      {
        requestId,
        traceId,
        sessionId: authReq.sessionId,
        userId: authReq.userId || 'none',
        event: 'assistant_sse_started'
      },
      '[AssistantSSE] SSE stream started'
    );

    // Initialize SSE writer
    const writer = new SseWriter(res);
    writer.setHeaders();
    writer.flushHeaders();

    // Heartbeat every 25s so ALB/gateways (e.g. 60s idle timeout) don't close the stream
    const HEARTBEAT_MS = 25_000;
    const heartbeatId = setInterval(() => {
      if (clientDisconnected || res.writableEnded) return;
      try {
        writer.sendPing();
      } catch {
        // ignore if stream already closed
      }
    }, HEARTBEAT_MS);

    // Abort controller for cleanup
    const abortController = new AbortController();
    let clientDisconnected = false;

    // Handle client disconnect: abort and close stream
    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
      try {
        writer.end();
      } catch {
        // ignore if already ended
      }
      const durationMs = Date.now() - startTime;
      this.logger.info(
        {
          requestId,
          traceId,
          durationMs,
          event: 'assistant_sse_client_closed'
        },
        '[AssistantSSE] Client disconnected'
      );
    });

    try {
      // Best-effort ownership validation
      const ownership = await this.ownershipValidator.validate(requestId, authReq);
      
      if (!ownership.valid) {
        const errorPayload: { code: 'UNAUTHORIZED'; message: string; reason?: string } = {
          code: 'UNAUTHORIZED',
          message: 'Access denied'
        };
        if (ownership.reason) {
          errorPayload.reason = ownership.reason;
        }
        writer.sendError(errorPayload);
        
        this.logger.warn(
          {
            requestId,
            traceId,
            reason: ownership.reason,
            event: 'assistant_sse_error'
          },
          '[AssistantSSE] Ownership validation failed'
        );
        
        writer.end();
        return;
      }

      // Load job to determine decision type
      const job = await this.jobStore.getJob(requestId);
      const jobStatus: JobStatus | null = job?.status || null;
      
      // TRACE CONSISTENCY: Reuse traceId from job if available, otherwise generate and persist
      let resolvedTraceId = job?.traceId || traceId;
      
      // If job exists but has no traceId, and we have one from request, persist it
      if (job && !job.traceId && traceId !== 'unknown') {
        resolvedTraceId = traceId;
        // Note: We don't update job here to avoid complexity, traceId will be used for logs only
      }
      
      // If neither job nor request has traceId, generate a unique one
      if (!resolvedTraceId || resolvedTraceId === 'unknown') {
        resolvedTraceId = `trace_${requestId.substring(0, 8)}_${Date.now()}`;
      }
      
      this.logger.debug(
        {
          requestId,
          traceId: resolvedTraceId,
          source: job?.traceId ? 'job' : traceId !== 'unknown' ? 'request' : 'generated',
          event: 'assistant_sse_trace_resolved'
        },
        `[AssistantSSE] Trace ID resolved: ${resolvedTraceId}`
      );
      
      // Use resolved traceId for all subsequent operations
      const finalTraceId = resolvedTraceId;
      
      // Load result for language resolution
      const result = await this.jobStore.getResult(requestId);
      
      // LANGUAGE RESOLUTION: Priority-based cascade
      // Priority: assistantLanguage > intent.language > job.queryDetectedLanguage > result.query.language > uiLanguage > 'en'
      const candidates = {
        assistantLanguage: (job as any)?.assistantLanguage as AssistantLanguage | undefined,
        intentLanguage: (job as any)?.intent?.language as AssistantLanguage | undefined,
        jobQueryDetectedLanguage: job?.queryDetectedLanguage as AssistantLanguage | undefined,
        resultQueryLanguage: ((result as any)?.query?.language as AssistantLanguage | undefined),
        uiLanguage: ((result as any)?.query?.languageContext?.uiLanguage as AssistantLanguage | undefined)
      };

      const chosenLanguage: AssistantLanguage =
        candidates.assistantLanguage ??
        candidates.intentLanguage ??
        candidates.jobQueryDetectedLanguage ??
        candidates.resultQueryLanguage ??
        candidates.uiLanguage ??
        'en';

      // Determine source for logging
      const languageSource = 
        candidates.assistantLanguage ? 'job.assistantLanguage' :
        candidates.intentLanguage ? 'job.intent.language' :
        candidates.jobQueryDetectedLanguage ? 'job.queryDetectedLanguage' :
        candidates.resultQueryLanguage ? 'result.query.language' :
        candidates.uiLanguage ? 'result.query.languageContext.uiLanguage' :
        'fallback';

      this.logger.info(
        {
          requestId,
          traceId: finalTraceId,
          event: 'assistant_sse_language_resolved',
          chosen: chosenLanguage,
          source: languageSource,
          candidates
        },
        `[AssistantSSE] Language resolved: ${chosenLanguage} (from ${languageSource})`
      );

      const assistantLanguage = chosenLanguage;

      // Determine flow type and initialize state machine
      const isClarify = jobStatus === 'DONE_CLARIFY';
      const isStopped = jobStatus === 'DONE_STOPPED';
      const flowType = (isClarify || isStopped) ? 'CLARIFY_STOPPED' : 'SEARCH';
      const stateMachine = new SseStateMachine(flowType);

      this.logger.debug(
        { requestId, traceId: finalTraceId, jobStatus, flowType },
        '[AssistantSSE] Flow type determined'
      );

      // Transition: START → META_SENT
      stateMachine.transition(SseState.META_SENT);
      writer.sendMeta({
        requestId,
        language: assistantLanguage,
        startedAt: new Date().toISOString()
      });

      // Check for client disconnect
      if (clientDisconnected || abortController.signal.aborted) {
        this.logger.debug({ requestId, traceId: finalTraceId }, '[AssistantSSE] Client disconnected after meta');
        writer.end();
        return;
      }

      // Branch: CLARIFY or STOPPED
      if (flowType === 'CLARIFY_STOPPED') {
        await this.executeClarifyStoppedFlow(
          stateMachine,
          requestId,
          finalTraceId,
          authReq,
          job,
          result,
          assistantLanguage,
          writer,
          abortController.signal,
          () => clientDisconnected,
          startTime
        );
        return;
      }

      // Branch: SEARCH
      await this.executeSearchFlow(
        stateMachine,
        requestId,
        finalTraceId,
        authReq,
        job,
        jobStatus,
        assistantLanguage,
        writer,
        abortController.signal,
        () => clientDisconnected,
        startTime
      );
    } catch (error) {
      handleSseError(
        error,
        requestId,
        startTime,
        clientDisconnected,
        abortController.signal.aborted,
        writer,
        this.logger
      );
    } finally {
      clearInterval(heartbeatId);
    }
  }

  /**
   * Execute CLARIFY or STOPPED flow
   */
  private async executeClarifyStoppedFlow(
    stateMachine: SseStateMachine,
    requestId: string,
    traceId: string,
    authReq: AuthenticatedRequest,
    job: any,
    result: any,
    assistantLanguage: AssistantLanguage,
    writer: SseWriter,
    abortSignal: AbortSignal,
    isClientDisconnected: () => boolean,
    startTime: number
  ): Promise<void> {
    // IDEMPOTENCY: Acquire lock before LLM call
    const lockAcquired = await this.acquireAssistantLock(requestId);
    
    if (!lockAcquired) {
      // Another SSE connection is already generating, skip LLM call
      // Return empty response (SSE will timeout or client will retry)
      this.logger.warn(
        { requestId, traceId, event: 'assistant_sse_deduped_clarify' },
        '[AssistantSSE] Duplicate CLARIFY/STOPPED request detected, closing stream'
      );
      writer.end();
      return;
    }

    try {
      // Send narration immediately (event: narration; state stays META_SENT for CLARIFY_STOPPED)
      const narrationText = this.narrationTemplates.getNarrationTemplate(assistantLanguage);
      writer.sendNarration({ text: narrationText });

      if (isClientDisconnected() || abortSignal.aborted) {
        this.logger.debug({ requestId, traceId }, '[AssistantSSE] Client disconnected after narration');
        writer.end();
        return;
      }

      // Build context and stream assistant reply (token-by-token)
      const context = await this.contextBuilder.buildContext(requestId, job, result);
      const llmProvider = this.createLLMProvider();
      if (!llmProvider) {
        throw new Error('LLM provider not available');
      }

      await streamAssistantMessage(context, llmProvider, requestId, {
        onChunk: (text) => {
          if (isClientDisconnected() || abortSignal.aborted) return;
          writer.sendDelta({ text });
        },
        traceId,
        ...(authReq.sessionId && { sessionId: authReq.sessionId })
      });

      if (isClientDisconnected() || abortSignal.aborted) {
        this.logger.debug({ requestId, traceId }, '[AssistantSSE] Client disconnected after CLARIFY/STOPPED stream');
        writer.end();
        return;
      }

      // Transition: NARRATION_SENT → MESSAGE_SENT (streamed via deltas)
      stateMachine.transition(SseState.MESSAGE_SENT);
      // Transition: MESSAGE_SENT → DONE
      stateMachine.transition(SseState.DONE);
      writer.sendDone();

    const durationMs = Date.now() - startTime;
      this.logger.info(
        { requestId, durationMs, flow: 'clarify_stopped', event: 'assistant_sse_completed' },
        '[AssistantSSE] SSE stream completed'
      );

      writer.end();
    } finally {
      // Release lock (best-effort, TTL handles cleanup)
      await this.releaseAssistantLock(requestId);
    }
  }

  /**
   * Execute SEARCH flow
   */
  private async executeSearchFlow(
    stateMachine: SseStateMachine,
    requestId: string,
    traceId: string,
    authReq: AuthenticatedRequest,
    job: any,
    jobStatus: JobStatus | null,
    assistantLanguage: AssistantLanguage,
    writer: SseWriter,
    abortSignal: AbortSignal,
    isClientDisconnected: () => boolean,
    startTime: number
  ): Promise<void> {
    // Transition: META_SENT → NARRATION_SENT
    // Step 1: Send immediate narration (event: narration)
    stateMachine.transition(SseState.NARRATION_SENT);
    const narrationText = this.narrationTemplates.getNarrationTemplate(assistantLanguage);
    writer.sendNarration({ text: narrationText });

    this.logger.info(
      { requestId, traceId, language: assistantLanguage, event: 'assistant_sse_narration_sent' },
      '[AssistantSSE] Narration sent'
    );

    // Check for client disconnect
    if (isClientDisconnected() || abortSignal.aborted) {
      this.logger.debug({ requestId, traceId }, '[AssistantSSE] Client disconnected after narration');
      writer.end();
      return;
    }

    // Transition: NARRATION_SENT → WAITING
    // Step 2: Poll for results readiness
    stateMachine.transition(SseState.WAITING);
    
    const pollResult = await this.pollingStrategy.waitForResults(
      requestId,
      jobStatus,
      abortSignal,
      isClientDisconnected
    );

    // Check for client disconnect after polling
    if (isClientDisconnected() || abortSignal.aborted) {
      this.logger.debug({ requestId, traceId }, '[AssistantSSE] Client disconnected after poll');
      writer.end();
      return;
    }

    // Step 3: Generate SUMMARY, or send stored assist (gate stop/clarify), or timeout message
    if (pollResult.resultsReady) {
      // Transition: WAITING → SUMMARY_SENT
      stateMachine.transition(SseState.SUMMARY_SENT);
      
      await this.sendSummaryMessage(
        requestId,
        traceId,
        authReq,
        job,
        assistantLanguage,
        writer,
        abortSignal,
        isClientDisconnected
      );
    } else if (pollResult.latestStatus === 'DONE_STOPPED' || pollResult.latestStatus === 'DONE_CLARIFY') {
      // Gate stop or clarify: pipeline already stored result with assist; send it via SSE so frontend gets it
      const storedResult = await this.jobStore.getResult(requestId);
      const assist = (storedResult as any)?.assist;
      if (assist?.message) {
        const sseType = assist.type === 'guide' ? 'GATE_FAIL' : (assist.type === 'clarify' ? 'CLARIFY' : assist.type);
        writer.sendMessage({
          type: sseType,
          message: assist.message,
          question: assist.question ?? null,
          blocksSearch: true,
          language: assistantLanguage
        });
        this.logger.info(
          { requestId, traceId, sseType, latestStatus: pollResult.latestStatus, event: 'assistant_sse_stopped_clarify_sent' },
          '[AssistantSSE] Sent stored assist (gate stop/clarify) via SSE'
        );
      }
    } else {
      // Transition: WAITING → DONE (timeout case, no summary)
      this.sendTimeoutMessage(
        requestId,
        traceId,
        pollResult.latestStatus,
        assistantLanguage,
        writer
      );
    }

    // Transition: SUMMARY_SENT/WAITING → DONE
    if (stateMachine.getState() !== SseState.DONE) {
      stateMachine.transition(SseState.DONE);
    }
    
    writer.sendDone();

    const durationMs = Date.now() - startTime;
    this.logger.info(
      { requestId, traceId, durationMs, resultsReady: pollResult.resultsReady, flow: 'search', event: 'assistant_sse_completed' },
      '[AssistantSSE] SSE stream completed'
    );

    writer.end();
  }

  /**
   * Send SUMMARY message
   */
  private async sendSummaryMessage(
    requestId: string,
    traceId: string,
    authReq: AuthenticatedRequest,
    job: any,
    assistantLanguage: AssistantLanguage,
    writer: SseWriter,
    abortSignal: AbortSignal,
    isClientDisconnected: () => boolean
  ): Promise<void> {
    // IDEMPOTENCY: Acquire lock before LLM call
    const lockAcquired = await this.acquireAssistantLock(requestId);
    
    if (!lockAcquired) {
      // Another SSE connection is already generating, skip LLM call
      this.logger.info(
        { requestId, traceId, event: 'assistant_sse_deduped_summary' },
        '[AssistantSSE] Duplicate SUMMARY request detected, skipping LLM generation'
      );
      // Don't send message, just return (stream continues without summary)
      return;
    }

    try {
      const freshResult = await this.jobStore.getResult(requestId);
      const summaryContext = await this.contextBuilder.buildContext(requestId, job, freshResult);

      const llmProvider = this.createLLMProvider();
      if (!llmProvider) {
        throw new Error('LLM provider not available');
      }

      await streamAssistantMessage(summaryContext, llmProvider, requestId, {
        onChunk: (text) => {
          if (isClientDisconnected() || abortSignal.aborted) return;
          writer.sendDelta({ text });
        },
        traceId,
        ...(authReq.sessionId && { sessionId: authReq.sessionId })
      });

      if (isClientDisconnected() || abortSignal.aborted) {
        this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after SUMMARY stream');
        writer.end();
        return;
      }

      this.logger.info(
        { requestId, traceId, language: assistantLanguage, event: 'assistant_sse_summary_sent' },
        '[AssistantSSE] SUMMARY stream sent'
      );
    } finally {
      // Release lock (best-effort, TTL handles cleanup)
      await this.releaseAssistantLock(requestId);
    }
  }

  /**
   * Send timeout message (no LLM)
   */
  private sendTimeoutMessage(
    requestId: string,
    traceId: string,
    latestStatus: string | null,
    assistantLanguage: AssistantLanguage,
    writer: SseWriter
  ): void {
    const timeoutMessage: AssistantOutput = {
      type: 'GENERIC_QUERY_NARRATION',
      message: this.narrationTemplates.getTimeoutMessage(assistantLanguage),
      question: null,
      suggestedAction: 'NONE',
      blocksSearch: false
    };

    writer.sendMessage({
      type: timeoutMessage.type,
      message: timeoutMessage.message,
      question: timeoutMessage.question,
      blocksSearch: timeoutMessage.blocksSearch,
      language: assistantLanguage
    });

    this.logger.warn(
      { requestId, traceId, latestStatus, language: assistantLanguage, event: 'assistant_sse_timeout' },
      '[AssistantSSE] Timeout waiting for results'
    );
  }

}
