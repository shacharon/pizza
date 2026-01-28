/**
 * Integration tests for CLARIFY blocksSearch enforcement and intent timeout handling
 * 
 * Tests:
 * 1. CLARIFY always blocks search (blocksSearch=true enforced, ignoring LLM output)
 * 2. Intent LLM timeout handled deterministically (no unhandled rejections)
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

describe('CLARIFY blocksSearch Enforcement', () => {
  let mockWsManager: any;
  let mockContext: any;
  let mockLLMProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWsManager = {
      publishToChannel: jest.fn()
    };

    mockLLMProvider = {
      completeJSON: jest.fn(),
      complete: jest.fn()
    };

    mockContext = {
      requestId: 'test-req-123',
      sessionId: 'test-session-456',
      llmProvider: mockLLMProvider,
      userRegionCode: 'IL',
      traceId: 'test-trace',
      startTime: Date.now()
    };
  });

  it('should enforce blocksSearch=true for CLARIFY when LLM says false', async () => {
    // Mock LLM to return blocksSearch=false
    mockLLMProvider.completeJSON.mockResolvedValue({
      data: {
        type: 'CLARIFY',
        message: 'איפה אתה רוצה לחפש?',
        question: 'באיזה אזור?',
        suggestedAction: 'ASK_LOCATION',
        blocksSearch: false // LLM incorrectly says false
      },
      usage: { promptTokens: 100, completionTokens: 50 },
      model: 'gpt-4'
    });

    const { generateAndPublishAssistant } = await import(
      '../src/services/search/route2/assistant/assistant-integration.js'
    );

    const assistantContext = {
      type: 'CLARIFY' as const,
      reason: 'MISSING_LOCATION' as const,
      query: 'מסעדות לידי',
      language: 'he' as const
    };

    const message = await generateAndPublishAssistant(
      mockContext,
      'test-req-123',
      'test-session-456',
      assistantContext,
      'fallback message',
      mockWsManager
    );

    // Assert message was published
    expect(mockWsManager.publishToChannel).toHaveBeenCalledTimes(1);
    
    const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];
    
    // CRITICAL: blocksSearch must be true (enforced, ignoring LLM)
    expect(publishedMessage.payload.blocksSearch).toBe(true);
    expect(publishedMessage.payload.type).toBe('CLARIFY');
    expect(message).toContain('איפה');
  });

  it('should keep blocksSearch=true for CLARIFY when LLM says true', async () => {
    // Mock LLM to return blocksSearch=true
    mockLLMProvider.completeJSON.mockResolvedValue({
      data: {
        type: 'CLARIFY',
        message: 'איפה אתה רוצה לחפש?',
        question: 'באיזה אזור?',
        suggestedAction: 'ASK_LOCATION',
        blocksSearch: true // LLM correctly says true
      },
      usage: { promptTokens: 100, completionTokens: 50 },
      model: 'gpt-4'
    });

    const { generateAndPublishAssistant } = await import(
      '../src/services/search/route2/assistant/assistant-integration.js'
    );

    const assistantContext = {
      type: 'CLARIFY' as const,
      reason: 'MISSING_LOCATION' as const,
      query: 'מסעדות לידי',
      language: 'he' as const
    };

    await generateAndPublishAssistant(
      mockContext,
      'test-req-123',
      'test-session-456',
      assistantContext,
      'fallback message',
      mockWsManager
    );

    const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];
    
    // blocksSearch should remain true
    expect(publishedMessage.payload.blocksSearch).toBe(true);
  });

  it('should NOT enforce blocksSearch for non-CLARIFY types', async () => {
    // Mock LLM to return SUMMARY with blocksSearch=false
    mockLLMProvider.completeJSON.mockResolvedValue({
      data: {
        type: 'SUMMARY',
        message: 'מצאתי 5 מסעדות',
        question: null,
        suggestedAction: 'NONE',
        blocksSearch: false
      },
      usage: { promptTokens: 100, completionTokens: 50 },
      model: 'gpt-4'
    });

    const { generateAndPublishAssistant } = await import(
      '../src/services/search/route2/assistant/assistant-integration.js'
    );

    const assistantContext = {
      type: 'SUMMARY' as const,
      query: 'פיצה בתל אביב',
      language: 'he' as const,
      resultCount: 5,
      top3Names: ['Pizza 1', 'Pizza 2', 'Pizza 3']
    };

    await generateAndPublishAssistant(
      mockContext,
      'test-req-123',
      'test-session-456',
      assistantContext,
      'fallback message',
      mockWsManager
    );

    const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];
    
    // blocksSearch should stay false (no enforcement for SUMMARY)
    expect(publishedMessage.payload.blocksSearch).toBe(false);
    expect(publishedMessage.payload.type).toBe('SUMMARY');
  });
});

describe('Intent LLM Timeout Handling', () => {
  let mockContext: any;
  let mockLLMProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLLMProvider = {
      completeJSON: jest.fn(),
      complete: jest.fn()
    };

    mockContext = {
      requestId: 'test-req-123',
      sessionId: 'test-session-456',
      llmProvider: mockLLMProvider,
      userRegionCode: 'IL',
      traceId: 'test-trace',
      startTime: Date.now(),
      stages: {}
    };
  });

  it('should handle intent LLM timeout and return fallback (no unhandled rejection)', async () => {
    // Mock LLM to throw timeout error
    mockLLMProvider.completeJSON.mockRejectedValue(new Error('Request aborted due to timeout'));

    const { executeIntentStage } = await import(
      '../src/services/search/route2/stages/intent/intent.stage.js'
    );

    const request = {
      query: 'פיצה בתל אביב',
      filters: {}
    };

    // Should NOT throw - must handle timeout gracefully
    const result = await executeIntentStage(request, mockContext);

    // Assert fallback result returned
    expect(result).toBeDefined();
    expect(result.route).toBe('TEXTSEARCH');
    expect(result.confidence).toBe(0.3);
    expect(result.reason).toBe('fallback_timeout'); // CRITICAL: deterministic reason
    expect(result.language).toBe('he');
    expect(result.regionCandidate).toBe('IL');
  });

  it('should handle intent LLM abort error and return fallback', async () => {
    // Mock LLM to throw abort error
    mockLLMProvider.completeJSON.mockRejectedValue(new Error('AbortError: The operation was aborted'));

    const { executeIntentStage } = await import(
      '../src/services/search/route2/stages/intent/intent.stage.js'
    );

    const request = {
      query: 'סושי בחיפה',
      filters: {}
    };

    const result = await executeIntentStage(request, mockContext);

    expect(result.route).toBe('TEXTSEARCH');
    expect(result.reason).toBe('fallback_timeout');
    expect(result.confidence).toBe(0.3);
  });

  it('should handle intent LLM non-timeout error with generic fallback reason', async () => {
    // Mock LLM to throw generic error
    mockLLMProvider.completeJSON.mockRejectedValue(new Error('OpenAI API error: rate limit exceeded'));

    const { executeIntentStage } = await import(
      '../src/services/search/route2/stages/intent/intent.stage.js'
    );

    const request = {
      query: 'המבורגר בירושלים',
      filters: {}
    };

    const result = await executeIntentStage(request, mockContext);

    expect(result.route).toBe('TEXTSEARCH');
    expect(result.reason).toBe('fallback_error'); // NOT fallback_timeout
    expect(result.confidence).toBe(0.3);
  });

  it('should handle intent LLM schema invalid response', async () => {
    // Mock LLM to return invalid/empty response
    mockLLMProvider.completeJSON.mockResolvedValue({
      data: null, // Invalid
      usage: { promptTokens: 100, completionTokens: 0 },
      model: 'gpt-4'
    });

    const { executeIntentStage } = await import(
      '../src/services/search/route2/stages/intent/intent.stage.js'
    );

    const request = {
      query: 'שווארמה באשדוד',
      filters: {}
    };

    const result = await executeIntentStage(request, mockContext);

    expect(result.route).toBe('TEXTSEARCH');
    expect(result.reason).toBe('fallback'); // Schema invalid
    expect(result.confidence).toBe(0.3);
  });

  it('should continue pipeline after intent timeout (integration scenario)', async () => {
    // Mock intent stage to timeout
    mockLLMProvider.completeJSON.mockRejectedValue(new Error('timeout exceeded'));

    const { executeIntentStage } = await import(
      '../src/services/search/route2/stages/intent/intent.stage.js'
    );

    const request = {
      query: 'מסעדות פתוחות',
      filters: {}
    };

    // Execute intent stage (will timeout and return fallback)
    const intentResult = await executeIntentStage(request, mockContext);

    // Pipeline should continue with fallback
    expect(intentResult.route).toBe('TEXTSEARCH');
    expect(intentResult.reason).toBe('fallback_timeout');
    
    // Verify no unhandled promise rejection occurred
    // (test would fail if promise rejection was unhandled)
  });
});

describe('Near-Me CLARIFY with blocksSearch', () => {
  let mockWsManager: any;
  let mockLLMProvider: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockWsManager = {
      publishToChannel: jest.fn()
    };

    mockLLMProvider = {
      completeJSON: jest.fn().mockResolvedValue({
        data: {
          type: 'CLARIFY',
          message: 'כדי לחפש מסעדות לידי אני צריך מיקום',
          question: 'תאפשר מיקום או כתוב עיר/אזור',
          suggestedAction: 'ASK_LOCATION',
          blocksSearch: false // LLM might say false
        },
        usage: { promptTokens: 100, completionTokens: 50 },
        model: 'gpt-4'
      })
    };
  });

  it('should enforce blocksSearch=true for "לידי" without location', async () => {
    const mockContext = {
      requestId: 'test-req-789',
      sessionId: 'test-session-789',
      llmProvider: mockLLMProvider,
      userRegionCode: 'IL',
      userLocation: undefined, // No location
      traceId: 'test-trace',
      startTime: Date.now()
    };

    const { generateAndPublishAssistant } = await import(
      '../src/services/search/route2/assistant/assistant-integration.js'
    );

    const assistantContext = {
      type: 'CLARIFY' as const,
      reason: 'MISSING_LOCATION' as const,
      query: 'מסעדות לידי', // "near me"
      language: 'he' as const
    };

    await generateAndPublishAssistant(
      mockContext,
      'test-req-789',
      'test-session-789',
      assistantContext,
      'כדי לחפש מסעדות לידי אני צריך מיקום',
      mockWsManager
    );

    const publishedMessage = mockWsManager.publishToChannel.mock.calls[0][3];

    // CRITICAL: Must block search even if LLM said false
    expect(publishedMessage.payload.blocksSearch).toBe(true);
    expect(publishedMessage.payload.type).toBe('CLARIFY');
    expect(publishedMessage.payload.question).toContain('מיקום');
  });
});
