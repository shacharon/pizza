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
import { generateAssistantMessage } from '../../../services/search/route2/assistant/assistant-llm.service.js';
import { SseWriter } from './sse-writer.js';
import { NarrationTemplates } from './narration-templates.js';
import { OwnershipValidator } from './ownership-validator.js';
import { AssistantContextBuilder } from './assistant-context-builder.js';
import { SseStateMachine, SseState } from './sse-state-machine.js';
import { PollingStrategy } from './polling-strategy.js';
import { handleSseError } from './sse-error-handler.js';

export interface AssistantSseOrchestratorConfig {
  timeoutMs: number;
  pollIntervalMs: number;
}

export class AssistantSseOrchestrator {
  private readonly narrationTemplates: NarrationTemplates;
  private readonly ownershipValidator: OwnershipValidator;
  private readonly contextBuilder: AssistantContextBuilder;
  private readonly pollingStrategy: PollingStrategy;

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

      // Determine flow type and initialize state machine
      const isClarify = jobStatus === 'DONE_CLARIFY';
      const isStopped = jobStatus === 'DONE_STOPPED';
      const flowType = (isClarify || isStopped) ? 'CLARIFY_STOPPED' : 'SEARCH';
      const stateMachine = new SseStateMachine(flowType);

      this.logger.debug(
        { requestId, jobStatus, flowType },
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
        this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after meta');
        writer.end();
        return;
      }

      // Branch: CLARIFY or STOPPED
      if (flowType === 'CLARIFY_STOPPED') {
        await this.executeClarifyStoppedFlow(
          stateMachine,
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
      await this.executeSearchFlow(
        stateMachine,
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
      handleSseError(
        error,
        requestId,
        startTime,
        clientDisconnected,
        abortController.signal.aborted,
        writer,
        this.logger
      );
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

    // Transition: META_SENT → MESSAGE_SENT
    stateMachine.transition(SseState.MESSAGE_SENT);
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

    // Transition: MESSAGE_SENT → DONE
    stateMachine.transition(SseState.DONE);
    writer.sendDone();

    const durationMs = Date.now() - startTime;
    this.logger.info(
      { requestId, durationMs, flow: 'clarify_stopped', event: 'assistant_sse_completed' },
      '[AssistantSSE] SSE stream completed'
    );

    writer.end();
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
    // Step 1: Send immediate narration template (no LLM)
    stateMachine.transition(SseState.NARRATION_SENT);
    
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
      this.logger.debug({ requestId }, '[AssistantSSE] Client disconnected after poll');
      writer.end();
      return;
    }

    // Step 3: Generate SUMMARY if results ready, else timeout message
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
    } else {
      // Transition: WAITING → DONE (timeout case, no summary)
      this.sendTimeoutMessage(
        requestId,
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

}
