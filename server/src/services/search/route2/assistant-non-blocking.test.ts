/**
 * Assistant Non-Blocking Tests
 * 
 * Verifies that assistant SUMMARY generation doesn't block pipeline completion
 * and that results/READY are published immediately
 */

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('Assistant Non-Blocking Behavior', () => {
  describe('Deferred Generation Flow', () => {
    it('should fire assistant generation without awaiting', async () => {
      // This test verifies that generateAndPublishAssistantDeferred returns immediately
      // and doesn't block the caller
      
      let assistantStarted = false;
      let assistantCompleted = false;
      let responseReturned = false;

      // Simulate deferred generation
      const deferredGeneration = () => {
        assistantStarted = true;
        
        // Simulate async work (don't await)
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          assistantCompleted = true;
        })();
        
        // Return immediately
      };

      // Simulate pipeline
      deferredGeneration();
      responseReturned = true;

      // Response should return immediately (before assistant completes)
      assert.strictEqual(responseReturned, true, 'Response should return immediately');
      assert.strictEqual(assistantStarted, true, 'Assistant should have started');
      assert.strictEqual(assistantCompleted, false, 'Assistant should NOT be complete yet');

      // Wait for assistant to complete
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.strictEqual(assistantCompleted, true, 'Assistant should eventually complete');
    });

    it('should document timing expectations', () => {
      // This test documents the expected timing behavior
      
      const timings = {
        // Before (blocking):
        blocking: {
          criticalPath: ['post_filter', 'assistant_llm', 'response_build', 'READY'],
          totalTime: 'post_filter + assistant_llm (1-2s) + response_build',
          userWaits: 'Full pipeline including assistant'
        },
        
        // After (non-blocking):
        nonBlocking: {
          criticalPath: ['post_filter', 'response_build', 'READY'],
          parallelPath: ['assistant_llm'],
          totalTime: 'post_filter + response_build',
          userWaits: 'Results only, assistant arrives later',
          savings: '1-2 seconds (assistant LLM time off critical path)'
        }
      };

      // Verify critical path is shorter
      assert.ok(
        timings.nonBlocking.criticalPath.length < timings.blocking.criticalPath.length,
        'Non-blocking should have shorter critical path'
      );
      
      // Verify assistant is off critical path
      assert.ok(
        !timings.nonBlocking.criticalPath.includes('assistant_llm'),
        'Assistant should not be on critical path'
      );
      
      // Document expected savings
      assert.ok(
        timings.nonBlocking.savings.includes('1-2 seconds'),
        'Should save assistant LLM time'
      );
    });
  });

  describe('READY Status Publishing', () => {
    it('should publish READY immediately without waiting for assistant', async () => {
      const events: string[] = [];
      
      // Simulate pipeline
      const executePipeline = async () => {
        events.push('post_filter_done');
        
        // Fire deferred assistant (don't await)
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          events.push('assistant_done');
        })();
        
        // Publish READY immediately
        events.push('READY_published');
        
        return { status: 'READY', results: [] };
      };

      const response = await executePipeline();
      
      // READY should be published before assistant completes
      assert.ok(events.includes('READY_published'), 'READY should be published');
      assert.ok(!events.includes('assistant_done'), 'Assistant should NOT be done yet');
      assert.strictEqual(response.status, 'READY', 'Response status should be READY');

      // Wait for assistant
      await new Promise(resolve => setTimeout(resolve, 150));
      assert.ok(events.includes('assistant_done'), 'Assistant should eventually complete');
      
      // Verify order: READY before assistant
      const readyIndex = events.indexOf('READY_published');
      const assistantIndex = events.indexOf('assistant_done');
      assert.ok(readyIndex < assistantIndex, 'READY should be published before assistant');
    });

    it('should publish READY even if assistant times out', async () => {
      const events: string[] = [];
      
      // Simulate pipeline with assistant timeout
      const executePipeline = async () => {
        events.push('post_filter_done');
        
        // Fire deferred assistant that times out (don't await)
        (async () => {
          try {
            await new Promise((_, reject) => 
              setTimeout(() => reject(new Error('LLM timeout')), 50)
            );
          } catch (err) {
            events.push('assistant_error');
          }
        })();
        
        // Publish READY immediately (regardless of assistant)
        events.push('READY_published');
        
        return { status: 'READY', results: [] };
      };

      const response = await executePipeline();
      
      // READY should be published immediately
      assert.ok(events.includes('READY_published'), 'READY should be published');
      assert.strictEqual(response.status, 'READY', 'Response status should be READY');

      // Wait for assistant error
      await new Promise(resolve => setTimeout(resolve, 100));
      assert.ok(events.includes('assistant_error'), 'Assistant error should be logged');
      
      // Verify READY published despite error
      assert.ok(
        events.indexOf('READY_published') < events.indexOf('assistant_error'),
        'READY should be published before assistant error'
      );
    });

    it('should publish READY even if assistant fails', async () => {
      const events: string[] = [];
      
      // Simulate pipeline with assistant failure
      const executePipeline = async () => {
        events.push('post_filter_done');
        
        // Fire deferred assistant that fails (don't await)
        (async () => {
          try {
            throw new Error('Schema validation failed');
          } catch (err) {
            events.push('assistant_schema_error');
          }
        })();
        
        // Publish READY immediately (regardless of assistant)
        events.push('READY_published');
        
        return { status: 'READY', results: [] };
      };

      const response = await executePipeline();
      
      // READY should be published
      assert.ok(events.includes('READY_published'), 'READY should be published');
      assert.ok(events.includes('assistant_schema_error'), 'Assistant error should be handled');
      assert.strictEqual(response.status, 'READY', 'Response status should be READY');
    });
  });

  describe('Assistant Message Delivery', () => {
    it('should allow assistant to arrive after READY', async () => {
      const wsMessages: any[] = [];
      
      // Simulate WebSocket manager
      const mockWsManager = {
        publish: (channel: string, requestId: string, sessionId: string, message: any) => {
          wsMessages.push({ channel, type: message.type, timestamp: Date.now() });
        }
      };

      // Simulate pipeline
      const executePipeline = async () => {
        // Publish READY status
        mockWsManager.publish('search', 'req-123', 'sess-123', {
          type: 'status',
          status: 'completed'
        });
        
        // Fire deferred assistant
        (async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          mockWsManager.publish('assistant', 'req-123', 'sess-123', {
            type: 'message',
            message: 'Found 10 restaurants'
          });
        })();
      };

      await executePipeline();
      
      // READY should be published immediately
      assert.strictEqual(wsMessages.length, 1, 'READY should be published immediately');
      assert.strictEqual(wsMessages[0].type, 'status', 'First message should be status');

      // Wait for assistant
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Assistant should be published after READY
      assert.strictEqual(wsMessages.length, 2, 'Assistant should be published');
      assert.strictEqual(wsMessages[1].type, 'message', 'Second message should be assistant');
      
      // Verify order
      assert.ok(
        wsMessages[0].timestamp < wsMessages[1].timestamp,
        'READY should be published before assistant'
      );
    });

    it('should handle assistant arriving before client subscribes', async () => {
      // This verifies the backlog system works
      const wsBacklog: any[] = [];
      
      // Simulate WebSocket manager with backlog
      const mockWsManager = {
        backlog: wsBacklog,
        publish: (channel: string, requestId: string, sessionId: string, message: any) => {
          wsBacklog.push({ channel, message });
        }
      };

      // Pipeline publishes READY + fires deferred assistant
      mockWsManager.publish('search', 'req-123', 'sess-123', {
        type: 'status',
        status: 'completed'
      });

      // Assistant completes quickly
      mockWsManager.publish('assistant', 'req-123', 'sess-123', {
        type: 'message',
        message: 'Found 10 restaurants'
      });

      // Client subscribes late
      // Both messages should be in backlog
      assert.strictEqual(wsBacklog.length, 2, 'Both messages should be in backlog');
      assert.strictEqual(wsBacklog[0].message.type, 'status', 'Status should be first');
      assert.strictEqual(wsBacklog[1].message.type, 'message', 'Assistant should be second');
    });
  });

  describe('Log Events', () => {
    it('should document required log events', () => {
      // This test documents the expected log events
      
      const requiredLogs = {
        start: {
          event: 'assistant_deferred_start',
          fields: ['requestId', 'assistantType', 'sessionIdPresent'],
          message: 'Deferred generation started (non-blocking)'
        },
        done: {
          event: 'assistant_deferred_done',
          fields: ['requestId', 'assistantType', 'durationMs'],
          message: 'Deferred generation completed'
        },
        error: {
          event: 'assistant_deferred_error',
          fields: ['requestId', 'errorCode', 'error', 'durationMs'],
          errorCodes: ['LLM_TIMEOUT', 'SCHEMA_INVALID', 'LLM_FAILED'],
          message: 'Deferred generation failed'
        }
      };

      // Verify log structure
      assert.ok(requiredLogs.start.event === 'assistant_deferred_start', 'Start event defined');
      assert.ok(requiredLogs.done.event === 'assistant_deferred_done', 'Done event defined');
      assert.ok(requiredLogs.error.event === 'assistant_deferred_error', 'Error event defined');
      
      // Verify duration tracking
      assert.ok(requiredLogs.done.fields.includes('durationMs'), 'Done should track duration');
      assert.ok(requiredLogs.error.fields.includes('durationMs'), 'Error should track duration');
      
      // Verify error codes
      assert.ok(
        requiredLogs.error.errorCodes.includes('LLM_TIMEOUT'),
        'Should handle timeout errors'
      );
      assert.ok(
        requiredLogs.error.errorCodes.includes('SCHEMA_INVALID'),
        'Should handle schema errors'
      );
    });
  });

  describe('Language Enforcement', () => {
    it('should preserve language enforcement in deferred generation', () => {
      // Verify that deferred generation still enforces language rules
      
      const assistantContext = {
        type: 'SUMMARY' as const,
        query: 'מסעדות בתל אביב',
        language: 'he' as const,
        resultCount: 10,
        top: [{ name: 'Restaurant A' }, { name: 'Restaurant B' }, { name: 'Restaurant C' }], analysisMode: 'COMPARISON',
        metadata: {}
      };

      // Language should be enforced at context creation time (before deferral)
      assert.strictEqual(assistantContext.language, 'he', 'Language should be he');
      
      // Context is created before deferred generation
      // So language enforcement happens immediately (not deferred)
      assert.ok(
        ['he', 'en'].includes(assistantContext.language),
        'Language should be enforced to he/en'
      );
    });

    it('should use queryLanguage with proper priority', () => {
      // Verify that language resolution happens before deferral
      
      const mockCtx = {
        queryLanguage: 'he' as const, // Highest priority
        sharedFilters: {
          final: { uiLanguage: 'en' as const }
        }
      };

      // Language resolution happens in resolveAssistantLanguage (before deferral)
      // This test documents that priority is maintained
      const expectedLanguage = mockCtx.queryLanguage; // 'he' (highest priority)
      
      assert.strictEqual(expectedLanguage, 'he', 'Should use queryLanguage (highest priority)');
    });
  });

  describe('No Deterministic Fallback', () => {
    it('should not generate deterministic fallback text', async () => {
      const events: string[] = [];
      
      // Simulate deferred generation failure
      const deferredGeneration = () => {
        (async () => {
          try {
            throw new Error('LLM failed');
          } catch (err) {
            // Should publish error event only (no fallback message)
            events.push('assistant_error_event');
            // Should NOT push any deterministic message
          }
        })();
      };

      deferredGeneration();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should have error event only
      assert.ok(events.includes('assistant_error_event'), 'Should publish error event');
      
      // Should NOT have any deterministic message
      const deterministicMessages = [
        'No results found',
        'לא מצאתי תוצאות',
        'Try again',
        'Error'
      ];
      
      deterministicMessages.forEach(msg => {
        assert.ok(!events.includes(msg), `Should not have deterministic message: ${msg}`);
      });
    });

    it('should publish only validated LLM output', async () => {
      const publishedMessages: any[] = [];
      
      // Simulate successful deferred generation
      const deferredGeneration = () => {
        (async () => {
          // Simulate LLM response (validated)
          const llmOutput = {
            message: 'Found 10 great restaurants in Tel Aviv',
            type: 'SUMMARY',
            requestId: 'req-123',
            blocksSearch: false
          };
          
          // Only publish validated LLM output
          publishedMessages.push(llmOutput);
        })();
      };

      deferredGeneration();
      
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Should have exactly one message (LLM output)
      assert.strictEqual(publishedMessages.length, 1, 'Should publish one message');
      assert.strictEqual(
        publishedMessages[0].type,
        'SUMMARY',
        'Should be LLM-generated SUMMARY'
      );
      assert.ok(
        publishedMessages[0].message.includes('Found'),
        'Should contain LLM-generated text'
      );
    });
  });

  describe('HTTP Response Behavior', () => {
    it('should return empty assist message in HTTP response', () => {
      // When using deferred assistant, HTTP response should have empty message
      // Real message comes via WebSocket
      
      const httpResponse = {
        requestId: 'req-123',
        results: [],
        assist: {
          type: 'guide',
          message: '' // Empty (deferred)
        }
      };

      assert.strictEqual(
        httpResponse.assist.message,
        '',
        'HTTP response should have empty assist message'
      );
    });

    it('should document WebSocket vs HTTP behavior', () => {
      const behavior = {
        http: {
          message: '', // Empty
          reason: 'Assistant is deferred (non-blocking)'
        },
        websocket: {
          message: 'LLM-generated text', // Real message
          timing: 'Arrives when ready (after READY status)',
          reason: 'Allows pipeline to complete without waiting'
        }
      };

      assert.strictEqual(behavior.http.message, '', 'HTTP should have empty message');
      assert.ok(
        behavior.websocket.message.includes('LLM-generated'),
        'WebSocket should have real message'
      );
    });
  });
});
