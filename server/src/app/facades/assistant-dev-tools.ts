/**
 * Assistant Dev Tools
 * Utilities for testing deduplication and routing
 * 
 * Usage in browser console:
 *   (window as any).assistantDevTools.simulateDuplicates()
 *   (window as any).assistantDevTools.simulateReconnectBacklog()
 */

import type { AssistantMessageType } from './assistant-routing.types';

export class AssistantDevTools {
  /**
   * Simulate duplicate events for testing deduplication
   */
  static simulateDuplicates(
    requestId: string = 'test-request-1',
    type: AssistantMessageType = 'SUMMARY'
  ): void {
    console.group('[DEV] Simulating Duplicates');
    console.log('RequestId:', requestId);
    console.log('Type:', type);
    console.log('Sending 3 identical messages...');

    const payload = {
      type: 'assistant',
      requestId,
      payload: {
        type,
        message: 'Test duplicate message',
        question: null,
        blocksSearch: false
      }
    };

    // Send same message 3 times
    for (let i = 0; i < 3; i++) {
      console.log(`Duplicate #${i + 1}:`, payload);
      window.dispatchEvent(new CustomEvent('test:assistant-message', { detail: payload }));
    }

    console.log('Expected: 1 message rendered, 2 dropped as duplicates');
    console.groupEnd();
  }

  /**
   * Simulate reconnection backlog for testing deduplication
   */
  static simulateReconnectBacklog(requestId: string = 'test-request-2'): void {
    console.group('[DEV] Simulating Reconnect Backlog');
    console.log('RequestId:', requestId);
    console.log('Scenario: WS reconnects and sends backlog of messages');

    const messages = [
      { type: 'PROGRESS', message: 'Searching...', seq: 1 },
      { type: 'PROGRESS', message: 'Found 10 results', seq: 2 },
      { type: 'SUMMARY', message: 'Here are your results', seq: 3 },
    ];

    messages.forEach((msg, i) => {
      const payload = {
        type: 'assistant',
        requestId,
        payload: {
          type: msg.type,
          message: msg.message,
          question: null,
          blocksSearch: false,
          seq: msg.seq
        }
      };

      console.log(`Backlog message #${i + 1}:`, payload);
      window.dispatchEvent(new CustomEvent('test:assistant-message', { detail: payload }));
    });

    console.log('Expected: All messages deduplicated, no duplicates rendered');
    console.groupEnd();
  }

  /**
   * Enable verbose logging
   */
  static enableVerboseLogging(): void {
    (window as any).__ASSISTANT_DEBUG__ = true;
    console.log('[DEV] Verbose assistant logging enabled');
  }

  /**
   * Disable verbose logging
   */
  static disableVerboseLogging(): void {
    (window as any).__ASSISTANT_DEBUG__ = false;
    console.log('[DEV] Verbose assistant logging disabled');
  }
}

// Expose to window for browser console access
if (typeof window !== 'undefined') {
  (window as any).assistantDevTools = AssistantDevTools;
  console.log('[DEV] Assistant dev tools available at: window.assistantDevTools');
}
