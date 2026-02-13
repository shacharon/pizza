/**
 * Assistant SSE Orchestrator
 * Coordinates the SSE assistant flow
 * Single responsibility: Flow orchestration and decision logic
 */

import type { Logger } from 'pino';
import type { Request, Response } from 'express';
import type { LLMProvider } from '../../../llm/types.js';
import type { ISearchJobStore, JobStatus } from '../../../services/search/job-store/job-store.interface.js';
import type { AuthenticatedRequest } from '../../../middleware/auth-session-or-jwt.middleware.js';
import type { AssistantLanguage, AssistantOutput } from '../../../services/search/route2/assistant/assistant-llm.service.js';
import { generateAssistantMessage } from '../../../services/search/route2/assistant/assistant-llm.service.js';
import { SseWriter } from './sse-writer.js';
import { NarrationTemplates } from './narration-templates.js';
import { OwnershipValidator } from './ownership-validator.js';
import { AssistantContextBuilder } from './assistant-context-builder.js';
import { ResultWaiter } from './result-waiter.js';

export interface AssistantSseOrchestratorConfig {
  timeoutMs: number;
  pollIntervalMs: number;
}

export class AssistantSseOrchestrator {
  private readonly narrationTemplates: NarrationTemplates;
  private readonly ownershipValidator: OwnershipValidator;
  private readonly contextBuilder: AssistantContextBuilder;
  private readonly resultWaiter: ResultWaiter;

  constructor(
    private readonly jobStore: ISearchJobStore,
    private readonly createLLMProvider: () => LLMProvider | null,
    private readonly logger: Logger,
    private readonly config: AssistantSseOrchestratorConfig
  ) {
    this.narrationTemplates = new NarrationTemplates();
    this.ownershipValidator = new OwnershipValidator(jobStore, logger);
    this.contextBuilder = new AssistantContextBuilder(logger);
    this.resultWaiter = new ResultWaiter(
      jobStore,
      logger,
      config.pollIntervalMs,
      config.timeoutMs
    );
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

    // Abort controller for cleanup
    const abortController = new AbortController();
    let clientDisconnected = false;

    // Handle client disconnect
    req.on('close', () => {
      clientDisconnected = true;
      abortController.abort();
      
      const durationMs = Date.now() - startTime;
      this.logger.info(
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
      
      // Detect language (best-effort)
      const result = await this.jobStore.getResult(requestId);
      const assistantLanguage: AssistantLanguage = ((result as any)?.query?.language || 'en') as AssistantLanguage;

      // Send meta event
      writer.sendMeta({
        requestId,
        language: assistantLanguage,
        startedAt: new Date().toISOString()
      });

      // Check for client disconnect
      if (clientDisconnected || abortController.signal.aborted) {
        this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after meta');
        writer.end();
        return;
      }

      // Determine decision type
      const isClarify = jobStatus === 'DONE_CLARIFY';
      const isStopped = jobStatus === 'DONE_STOPPED';
      const isSearch = !isClarify && !isStopped; // Default to SEARCH (safe)

      this.logger.debug(
        { requestId, jobStatus, isClarify, isStopped, isSearch },
        '[AssistantSSE] Decision type determined'
      );

      // Branch: CLARIFY or STOPPED
      if (isClarify || isStopped) {
        await this.handleClarifyOrStopped(
          requestId,
          traceId,
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
      await this.handleSearch(
        requestId,
        traceId,
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
      this.handleError(
        error,
        requestId,
        startTime,
        clientDisconnected,
        abortController.signal.aborted,
        writer
      );
    }
  }

  /**
   * Handle CLARIFY or STOPPED flow
   */
  private async handleClarifyOrStopped(
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
    // Generate assistant message with LLM for CLARIFY/STOPPED
    const context = await this.contextBuilder.buildContext(requestId, job, result);
    
    const llmProvider = this.createLLMProvider();
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

    if (isClientDisconnected() || abortSignal.aborted) {
      this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after CLARIFY/STOPPED generation');
      writer.end();
      return;
    }

    // Send message event
    writer.sendMessage({
      type: assistant.type,
      message: assistant.message,
      question: assistant.question,
      blocksSearch: assistant.blocksSearch,
      language: assistantLanguage
    });

    this.logger.info(
      { requestId, type: assistant.type, language: assistantLanguage },
      '[AssistantSSE] CLARIFY/STOPPED message sent'
    );

    // Send done
    writer.sendDone();

    const durationMs = Date.now() - startTime;
    this.logger.info(
      { requestId, durationMs, flow: 'clarify_stopped', event: 'assistant_sse_completed' },
      '[AssistantSSE] SSE stream completed'
    );

    writer.end();
  }

  /**
   * Handle SEARCH flow
   */
  private async handleSearch(
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
    // Step 1: Send immediate narration template (no LLM)
    const narrationMessage: AssistantOutput = {
      type: 'GENERIC_QUERY_NARRATION',
      message: this.narrationTemplates.getNarrationTemplate(assistantLanguage),
      question: null,
      suggestedAction: 'NONE',
      blocksSearch: false
    };

    writer.sendMessage({
      type: narrationMessage.type,
      message: narrationMessage.message,
      question: narrationMessage.question,
      blocksSearch: narrationMessage.blocksSearch,
      language: assistantLanguage
    });

    this.logger.info(
      { requestId, language: assistantLanguage, event: 'assistant_sse_narration_sent' },
      '[AssistantSSE] Narration template sent'
    );

    // Check for client disconnect
    if (isClientDisconnected() || abortSignal.aborted) {
      this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after narration');
      writer.end();
      return;
    }

    // Step 2: Poll for results readiness
    const pollResult = await this.resultWaiter.waitForResults(
      requestId,
      jobStatus,
      abortSignal,
      isClientDisconnected
    );

    // Check for client disconnect after polling
    if (isClientDisconnected() || abortSignal.aborted) {
      this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after poll');
      writer.end();
      return;
    }

    // Step 3: Generate SUMMARY if results ready, else timeout message
    if (pollResult.resultsReady) {
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
    } else {
      this.sendTimeoutMessage(
        requestId,
        pollResult.latestStatus,
        assistantLanguage,
        writer
      );
    }

    // Send done
    writer.sendDone();

    const durationMs = Date.now() - startTime;
    this.logger.info(
      { requestId, durationMs, resultsReady: pollResult.resultsReady, flow: 'search', event: 'assistant_sse_completed' },
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
    // Load fresh result
    const freshResult = await this.jobStore.getResult(requestId);
    const summaryContext = await this.contextBuilder.buildContext(requestId, job, freshResult);

    const llmProvider = this.createLLMProvider();
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

    if (isClientDisconnected() || abortSignal.aborted) {
      this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after SUMMARY generation');
      writer.end();
      return;
    }

    // Send SUMMARY message
    writer.sendMessage({
      type: summaryAssistant.type,
      message: summaryAssistant.message,
      question: summaryAssistant.question,
      blocksSearch: summaryAssistant.blocksSearch,
      language: assistantLanguage
    });

    this.logger.info(
      { requestId, type: summaryAssistant.type, language: assistantLanguage, event: 'assistant_sse_summary_sent' },
      '[AssistantSSE] SUMMARY message sent'
    );
  }

  /**
   * Send timeout message (no LLM)
   */
  private sendTimeoutMessage(
    requestId: string,
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
      { requestId, latestStatus, language: assistantLanguage, event: 'assistant_sse_timeout' },
      '[AssistantSSE] Timeout waiting for results'
    );
  }

  /**
   * Handle errors
   */
  private handleError(
    error: unknown,
    requestId: string,
    startTime: number,
    clientDisconnected: boolean,
    aborted: boolean,
    writer: SseWriter
  ): void {
    const durationMs = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMsg.toLowerCase().includes('timeout');
    const isAborted = errorMsg.toLowerCase().includes('abort');

    // Don't send error if client already disconnected
    if (clientDisconnected || aborted) {
      this.logger.debug(
        { requestId, durationMs },
        '[AssistantSSE] Client disconnected during error handling'
      );
      writer.end();
      return;
    }

    const errorCode = isTimeout ? 'LLM_TIMEOUT' : (isAborted ? 'ABORTED' : 'LLM_FAILED');

    writer.sendError({
      code: errorCode,
      message: 'Failed to generate assistant message'
    });

    this.logger.error(
      {
        requestId,
        durationMs,
        errorCode,
        error: errorMsg,
        event: 'assistant_sse_error'
      },
      '[AssistantSSE] SSE stream failed'
    );

    writer.end();
  }
}
