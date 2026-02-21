/**
 * E2E test for assistant-sse.orchestrator
 * Asserts exact event sequence and final done under mocked dependencies
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AssistantSseOrchestrator } from '../assistant-sse.orchestrator.js';
import type { Request, Response } from 'express';

// Mock all dependencies
vi.mock('../../../../lib/logger/structured-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../../../../services/search/route2/assistant/assistant-llm.service.js', () => ({
  generateAssistantMessage: vi.fn().mockResolvedValue({
    type: 'SUMMARY',
    message: 'Found 5 restaurants',
    question: null,
    blocksSearch: false,
    suggestedAction: 'NONE'
  })
}));

vi.mock('../result-waiter.js', () => ({
  ResultWaiter: vi.fn().mockImplementation(() => ({
    waitForResults: vi.fn().mockResolvedValue({
      resultsReady: true,
      latestStatus: 'DONE'
    })
  }))
}));

describe('AssistantSseOrchestrator E2E', () => {
  let mockJobStore: any;
  let mockLogger: any;
  let mockLLMProvider: any;
  let orchestrator: AssistantSseOrchestrator;
  let mockResponse: any;
  let sseEvents: Array<{ event: string; data: any }>;

  beforeEach(async () => {
    vi.clearAllMocks();
    sseEvents = [];

    const loggerModule = await import('../../../../lib/logger/structured-logger.js');
    mockLogger = loggerModule.logger;

    mockJobStore = {
      getJob: vi.fn().mockResolvedValue({
        status: 'DONE',
        ownerSessionId: 'sess-123',
        ownerUserId: 'user-1'
      }),
      getStatus: vi.fn().mockResolvedValue({ status: 'RUNNING' }),
      getResult: vi.fn().mockResolvedValue({
        query: { language: 'en' },
        results: [{ id: '1' }, { id: '2' }]
      })
    };

    mockLLMProvider = {
      completeJSON: vi.fn(),
      complete: vi.fn()
    };

    const createLLMProvider = () => mockLLMProvider;

    orchestrator = new AssistantSseOrchestrator(
      mockJobStore,
      createLLMProvider,
      mockLogger,
      {
        timeoutMs: 5000,
        pollIntervalMs: 150
      }
    );

    // Mock Response
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((chunk: string) => {
        // Parse SSE events
        const lines = chunk.split('\n').filter(l => l.trim());
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const event = line.substring(7).trim();
            sseEvents.push({ event, data: null });
          } else if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6).trim());
            if (sseEvents.length > 0) {
              sseEvents[sseEvents.length - 1].data = data;
            }
          }
        }
        return true;
      }),
      end: vi.fn()
    };
  });

  describe('SEARCH flow (results ready)', () => {
    it('should emit exact event sequence: meta → message → message → done', async () => {
      const mockRequest = {
        params: { requestId: 'req-search-123' },
        traceId: 'trace-123',
        sessionId: 'sess-123',
        userId: 'user-1',
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            // Don't call handler (client stays connected)
          }
        })
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      // Verify event sequence
      expect(sseEvents).toHaveLength(4);

      // 1. Meta event
      expect(sseEvents[0].event).toBe('meta');
      expect(sseEvents[0].data).toMatchObject({
        requestId: 'req-search-123',
        language: 'en',
        startedAt: expect.any(String)
      });

      // 2. Narration message
      expect(sseEvents[1].event).toBe('message');
      expect(sseEvents[1].data).toMatchObject({
        type: 'GENERIC_QUERY_NARRATION',
        message: expect.any(String),
        question: null,
        blocksSearch: false,
        language: 'en'
      });

      // 3. Summary message (LLM output forwarded as-is; suggestedAction included)
      expect(sseEvents[2].event).toBe('message');
      expect(sseEvents[2].data).toMatchObject({
        type: 'SUMMARY',
        message: 'Found 5 restaurants',
        language: 'en',
        suggestedAction: 'NONE'
      });

      // 4. Done event
      expect(sseEvents[3].event).toBe('done');

      // Verify response ended
      expect(mockResponse.end).toHaveBeenCalled();
    });

    it('should include suggestedAction in message event when LLM returns it', async () => {
      const { generateAssistantMessage } = await import('../../../../services/search/route2/assistant/assistant-llm.service.js');
      (generateAssistantMessage as any).mockResolvedValue({
        type: 'SUMMARY',
        message: 'Found 3 places',
        question: null,
        blocksSearch: false,
        suggestedAction: 'NONE'
      });

      const mockRequest = {
        params: { requestId: 'req-suggested-1' },
        traceId: 'trace-suggested',
        sessionId: 'sess-123',
        userId: 'user-1',
        on: vi.fn()
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      const messageEvents = sseEvents.filter(e => e.event === 'message');
      expect(messageEvents.length).toBeGreaterThanOrEqual(1);
      const summaryMessage = messageEvents.find(m => m.data && (m.data as any).type === 'SUMMARY');
      expect(summaryMessage).toBeDefined();
      expect((summaryMessage!.data as any).suggestedAction).toBe('NONE');
    });
  });

  describe('CLARIFY_STOPPED flow', () => {
    it('should emit exact event sequence: meta → message → done', async () => {
      mockJobStore.getJob.mockResolvedValue({ status: 'DONE_CLARIFY' });

      const mockRequest = {
        params: { requestId: 'req-clarify-456' },
        traceId: 'trace-456',
        sessionId: 'sess-456',
        userId: 'user-2',
        on: vi.fn()
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      // Verify event sequence
      expect(sseEvents).toHaveLength(3);

      // 1. Meta event
      expect(sseEvents[0].event).toBe('meta');

      // 2. Message (CLARIFY, not narration)
      expect(sseEvents[1].event).toBe('message');
      expect(sseEvents[1].data).toMatchObject({
        type: 'SUMMARY', // From mocked generateAssistantMessage
        message: expect.any(String)
      });

      // 3. Done event
      expect(sseEvents[2].event).toBe('done');
    });
  });

  describe('Error handling', () => {
    it('should emit error event on LLM failure', async () => {
      const { generateAssistantMessage } = await import('../../../../services/search/route2/assistant/assistant-llm.service.js');
      (generateAssistantMessage as any).mockRejectedValue(new Error('LLM failed'));

      mockJobStore.getJob.mockResolvedValue({ status: 'DONE_CLARIFY' });

      const mockRequest = {
        params: { requestId: 'req-error-789' },
        traceId: 'trace-789',
        sessionId: 'sess-789',
        on: vi.fn()
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      // Should have error event
      const errorEvent = sseEvents.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data).toMatchObject({
        code: 'LLM_FAILED',
        message: 'Failed to generate assistant message'
      });
    });

    it('should emit error event for unauthorized access', async () => {
      mockJobStore.getJob.mockResolvedValue({ 
        status: 'DONE',
        ownerSessionId: 'sess-original',
        ownerUserId: 'user-original'
      });

      const mockRequest = {
        params: { requestId: 'req-unauth-999' },
        traceId: 'trace-999',
        sessionId: 'sess-999',
        userId: 'user-999',
        on: vi.fn()
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      // Should have error event
      const errorEvent = sseEvents.find(e => e.event === 'error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent?.data).toMatchObject({
        code: 'UNAUTHORIZED',
        message: 'Access denied'
      });
    });
  });

  describe('Client disconnect handling', () => {
    it('should stop gracefully when client disconnects', async () => {
      let closeHandler: (() => void) | null = null;

      const mockRequest = {
        params: { requestId: 'req-disconnect-111' },
        traceId: 'trace-111',
        sessionId: 'sess-111',
        on: vi.fn((event, handler) => {
          if (event === 'close') {
            closeHandler = handler;
          }
        })
      } as any;

      // Trigger disconnect immediately
      if (closeHandler) {
        closeHandler();
      }

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      // Should still call end
      expect(mockResponse.end).toHaveBeenCalled();
    });
  });

  describe('Terminal state quick close (no poll/timeout)', () => {
    it('should close stream immediately with SEARCH_FAILED when job is already DONE_FAILED', async () => {
      mockJobStore.getJob.mockResolvedValue({
        status: 'DONE_FAILED',
        ownerSessionId: 'sess-123',
        ownerUserId: 'user-1'
      });
      mockJobStore.getStatus.mockResolvedValue({
        status: 'DONE_FAILED',
        error: { code: 'SEARCH_FAILED', message: 'Backend error' }
      });
      mockJobStore.getResult.mockResolvedValue({ query: {} });

      const mockRequest = {
        params: { requestId: 'req-failed-1' },
        traceId: 'trace-failed',
        sessionId: 'sess-123',
        userId: 'user-1',
        on: vi.fn()
      } as any;

      const start = Date.now();
      await orchestrator.handleRequest(mockRequest, mockResponse as Response);
      const elapsed = Date.now() - start;

      expect(sseEvents).toHaveLength(4);
      expect(sseEvents[0].event).toBe('meta');
      expect(sseEvents[1].event).toBe('narration');
      expect(sseEvents[2].event).toBe('message');
      expect(sseEvents[2].data).toMatchObject({
        type: 'SEARCH_FAILED',
        message: 'Backend error',
        blocksSearch: true,
        language: 'en'
      });
      expect(sseEvents[3].event).toBe('done');
      expect(mockResponse.end).toHaveBeenCalled();
      expect(elapsed).toBeLessThan(2000);
    });

    it('should close stream immediately with clarify when job is already DONE_CLARIFY (SEARCH path)', async () => {
      mockJobStore.getJob.mockResolvedValue({
        status: 'RUNNING',
        ownerSessionId: 'sess-123',
        ownerUserId: 'user-1'
      });
      mockJobStore.getStatus.mockResolvedValue({ status: 'DONE_CLARIFY' });
      mockJobStore.getResult.mockResolvedValue({
        query: { language: 'en' },
        assist: { type: 'clarify', message: 'Which city?', question: 'Where?', blocksSearch: true }
      });

      const mockRequest = {
        params: { requestId: 'req-clarify-quick' },
        traceId: 'trace-clarify',
        sessionId: 'sess-123',
        userId: 'user-1',
        on: vi.fn()
      } as any;

      const start = Date.now();
      await orchestrator.handleRequest(mockRequest, mockResponse as Response);
      const elapsed = Date.now() - start;

      expect(sseEvents).toHaveLength(4);
      expect(sseEvents[0].event).toBe('meta');
      expect(sseEvents[1].event).toBe('narration');
      expect(sseEvents[2].event).toBe('message');
      expect(sseEvents[2].data).toMatchObject({
        type: 'CLARIFY',
        message: 'Which city?',
        question: 'Where?',
        blocksSearch: true,
        language: 'en'
      });
      expect(sseEvents[3].event).toBe('done');
      expect(mockResponse.end).toHaveBeenCalled();
      expect(elapsed).toBeLessThan(2000);
    });
  });

  describe('Language resolution from job.queryDetectedLanguage', () => {
    it('should use Hebrew from job.queryDetectedLanguage when intent not yet available', async () => {
      const mockRequest = {
        params: { requestId: 'req-hebrew-222' },
        traceId: 'trace-222',
        sessionId: 'sess-222',
        headers: {},
        on: vi.fn()
      } as any;

      mockJobStore.getJob.mockResolvedValue({
        status: 'RUNNING',
        ownerSessionId: 'sess-222',
        queryDetectedLanguage: 'he'
      });
      mockJobStore.getStatus.mockResolvedValue({ status: 'RUNNING' });

      mockJobStore.getResult.mockResolvedValue({
        query: {},
        results: []
      });

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      const logCalls = mockLogger.info.mock.calls;
      const languageLog = logCalls.find((call: any[]) => call[0]?.event === 'assistant_sse_language_resolved');
      
      expect(languageLog).toBeDefined();
      expect(languageLog[0].chosen).toBe('he');
      expect(languageLog[0].source).toBe('job.queryDetectedLanguage');
      expect(languageLog[0].candidates.jobQueryDetectedLanguage).toBe('he');
    });

    it('should use queryDetectedLanguage when present (not uiLanguage)', async () => {
      // Priority: intent → queryDetectedLanguage → uiLanguage; do NOT use uiLanguage when queryDetectedLanguage exists
      mockJobStore.getJob.mockResolvedValue({
        status: 'RUNNING',
        ownerSessionId: 'sess-333',
        queryDetectedLanguage: 'en',
        filters: { uiLanguage: 'he' }
      });

      mockJobStore.getResult.mockResolvedValue({
        query: {
          languageContext: { uiLanguage: 'he' }
        },
        results: []
      });

      const mockRequest = {
        params: { requestId: 'req-ui-he-333' },
        traceId: 'trace-333',
        sessionId: 'sess-333',
        userId: 'user-333',
        headers: {},
        on: vi.fn()
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      const logCalls = mockLogger.info.mock.calls;
      const languageLog = logCalls.find((call: any[]) => call[0]?.event === 'assistant_sse_language_resolved');

      expect(languageLog).toBeDefined();
      expect(languageLog[0].chosen).toBe('en');
      expect(languageLog[0].source).toBe('job.queryDetectedLanguage');
      expect(languageLog[0].candidates.uiLanguage).toBe('he');
      expect(languageLog[0].candidates.jobQueryDetectedLanguage).toBe('en');
    });

    it('should output Hebrew narration when intent.language is he (priority over queryDetectedLanguage)', async () => {
      // Priority: intent.language → queryDetectedLanguage → uiLanguage
      mockJobStore.getJob.mockResolvedValue({
        status: 'RUNNING',
        ownerSessionId: 'sess-piza',
        queryDetectedLanguage: 'en',
        intent: { language: 'he' }
      });
      mockJobStore.getStatus.mockResolvedValue({ status: 'RUNNING' });
      mockJobStore.getResult.mockResolvedValue({
        query: { language: 'en' },
        results: []
      });

      const mockRequest = {
        params: { requestId: 'req-piza-he' },
        traceId: 'trace-piza',
        sessionId: 'sess-piza',
        userId: 'user-1',
        headers: {},
        on: vi.fn()
      } as any;

      await orchestrator.handleRequest(mockRequest, mockResponse as Response);

      const languageLog = mockLogger.info.mock.calls.find((call: any[]) => call[0]?.event === 'assistant_sse_language_resolved');
      expect(languageLog).toBeDefined();
      expect(languageLog![0].chosen).toBe('he');
      expect(languageLog![0].source).toBe('job.intent.language');

      const narrationEvent = sseEvents.find(e => e.event === 'narration');
      expect(narrationEvent).toBeDefined();
      expect(narrationEvent!.data).toBeDefined();
      expect(narrationEvent!.data.text).toMatch(/מחפש|עכשיו|תוצאות/);
    });
  });
});
