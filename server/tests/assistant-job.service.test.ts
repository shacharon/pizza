/**
 * Phase 4: Assistant Job Service Tests
 */

import { describe, it, beforeEach, mock } from 'node:test';
import assert from 'node:assert';
import { AssistantJobService } from '../src/services/search/assistant/assistant-job.service.js';
import type { LLMProvider } from '../src/llm/types.js';
import type { IRequestStateStore, RequestState } from '../src/infra/state/request-state.store.js';
import type { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';
import type { CoreSearchResult } from '../src/services/search/types/search.types.js';

describe('AssistantJobService - Phase 4', () => {
  let mockLLM: LLMProvider;
  let mockStateStore: IRequestStateStore;
  let mockWSManager: WebSocketManager;
  let service: AssistantJobService;
  let publishedMessages: any[];

  beforeEach(() => {
    publishedMessages = [];

    // Mock LLM with streaming support
    mockLLM = {
      complete: mock.fn(async () => 'Mock completion'),
      completeJSON: mock.fn(async () => ({ message: 'Mock JSON' })),
      completeStream: mock.fn(async (messages, onChunk, opts) => {
        // Simulate streaming chunks
        const chunks = ['Found ', '10 ', 'great ', 'places!'];
        for (const chunk of chunks) {
          onChunk(chunk);
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        return chunks.join('');
      })
    } as any;

    // Mock state store
    mockStateStore = {
      get: mock.fn(async (requestId: string) => {
        // Return mock state with properly structured CoreSearchResult
        const mockCoreResult: CoreSearchResult = {
          requestId,
          sessionId: 'test-session',
          query: {
            original: 'pizza in tel aviv',
            parsed: {
              query: 'pizza',
              searchMode: 'textsearch' as const,
              filters: {},
              languageContext: {
                uiLanguage: 'en' as const,
                requestLanguage: 'en' as const,
                googleLanguage: 'en' as const
              },
              originalQuery: 'pizza in tel aviv'
            } as any,
            language: 'en'
          },
          results: [
            { id: 'r1', name: 'Pizza Place 1', placeId: 'place1' } as any,
            { id: 'r2', name: 'Pizza Place 2', placeId: 'place2' } as any,
            { id: 'r3', name: 'Pizza Place 3', placeId: 'place3' } as any
          ],
          chips: [
            { id: 'chip-1', emoji: '⭐', label: 'Top Rated', action: 'sort' as const },
            { id: 'chip-2', emoji: '📍', label: 'Nearby', action: 'sort' as const }
          ],
          truthState: {} as any,
          meta: {} as any
        };

        return {
          requestId,
          sessionId: 'test-session',
          coreResult: mockCoreResult,
          assistantStatus: 'pending' as const,
          seed: 12345,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + 300_000
        };
      }),
      set: mock.fn(async () => {}),
      delete: mock.fn(async () => {}),
      cleanup: mock.fn(async () => 0),
      shutdown: mock.fn(() => {})
    };

    // Mock WebSocket manager
    mockWSManager = {
      publish: mock.fn((requestId: string, message: any) => {
        publishedMessages.push({ requestId, ...message });
      })
    } as any;

    service = new AssistantJobService(mockLLM, mockStateStore, mockWSManager);
  });

  it('should stream assistant narration and publish chunks', async () => {
    await service.startJob('test-req-123');

    // Verify state was loaded
    assert.strictEqual((mockStateStore.get as any).mock.calls.length, 1);

    // Verify streaming status published
    const statusStreamingMsg = publishedMessages.find(
      m => m.type === 'status' && m.status === 'streaming'
    );
    assert.ok(statusStreamingMsg, 'Should publish streaming status');

    // Verify stream deltas published
    const deltaMessages = publishedMessages.filter(m => m.type === 'stream.delta');
    assert.ok(deltaMessages.length > 0, 'Should publish stream deltas');

    // Verify stream.done published
    const doneMsg = publishedMessages.find(m => m.type === 'stream.done');
    assert.ok(doneMsg, 'Should publish stream.done');
    assert.ok(doneMsg.fullText, 'Stream.done should include fullText');

    // Verify recommendations published
    const recMsg = publishedMessages.find(m => m.type === 'recommendation');
    assert.ok(recMsg, 'Should publish recommendations');
    assert.ok(Array.isArray(recMsg.actions), 'Recommendations should include actions array');

    // Verify completed status published
    const statusCompletedMsg = publishedMessages.find(
      m => m.type === 'status' && m.status === 'completed'
    );
    assert.ok(statusCompletedMsg, 'Should publish completed status');

    // Verify state was updated
    assert.ok((mockStateStore.set as any).mock.calls.length >= 2, 'Should update state multiple times');
  });

  it('should handle missing state gracefully', async () => {
    // Override get to return null
    (mockStateStore.get as any) = mock.fn(async () => null);

    await service.startJob('non-existent-req');

    // Should not throw, just log and return
    assert.strictEqual(publishedMessages.length, 0, 'Should not publish any messages');
  });

  it('should generate deterministic recommendations', async () => {
    await service.startJob('test-req-123');

    const recMsg = publishedMessages.find(m => m.type === 'recommendation');
    assert.ok(recMsg, 'Should generate recommendations');
    assert.ok(recMsg.actions.length > 0, 'Should have at least one action');
    assert.ok(recMsg.actions.length <= 5, 'Should have at most 5 actions');

    // Verify action structure
    const action = recMsg.actions[0];
    assert.ok(action.id, 'Action should have id');
    assert.ok(action.label, 'Action should have label');
    assert.ok('enabled' in action, 'Action should have enabled flag');
  });

  it('should persist assistant output and recommendations to state', async () => {
    await service.startJob('test-req-123');

    // Find the final state.set call
    const setCalls = (mockStateStore.set as any).mock.calls;
    const finalSetCall = setCalls[setCalls.length - 1];
    assert.ok(finalSetCall, 'Should call set at least once');

    const [requestId, finalState] = finalSetCall.arguments;
    assert.strictEqual(finalState.assistantStatus, 'completed');
    assert.ok(finalState.assistantOutput, 'Should have assistantOutput');
    assert.ok(Array.isArray(finalState.recommendations), 'Should have recommendations array');
  });

  it('should handle LLM errors gracefully', async () => {
    // Mock LLM to throw error
    mockLLM.completeStream = mock.fn(async () => {
      throw new Error('LLM service unavailable');
    });

    await service.startJob('test-req-error');

    // Should publish error messages
    const errorMsg = publishedMessages.find(m => m.type === 'error');
    assert.ok(errorMsg, 'Should publish error message');
    assert.strictEqual(errorMsg.error, 'ASSISTANT_FAILED');

    const statusFailedMsg = publishedMessages.find(
      m => m.type === 'status' && m.status === 'failed'
    );
    assert.ok(statusFailedMsg, 'Should publish failed status');
  });

  it('should use fallback message when LLM is null', async () => {
    const serviceWithoutLLM = new AssistantJobService(null, mockStateStore, mockWSManager);
    publishedMessages = [];

    // Re-wire mock to use new service
    mockWSManager.publish = mock.fn((requestId: string, message: any) => {
      publishedMessages.push({ requestId, ...message });
    });

    await serviceWithoutLLM.startJob('test-req-fallback');

    // Should still publish messages with fallback text
    const doneMsg = publishedMessages.find(m => m.type === 'stream.done');
    assert.ok(doneMsg, 'Should publish stream.done even without LLM');
    assert.ok(doneMsg.fullText, 'Should have fallback text');
  });
});
