/**
 * Assistant Publisher Unit Tests
 * 
 * Verifies WS channel publishing logic
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { publishAssistantMessage } from './assistant-publisher.js';
import { ASSISTANT_WS_CHANNEL } from './constants.js';
import type { NarratorOutput } from './narrator.types.js';

describe('Assistant Publisher', () => {
  let mockWsManager: any;
  let mockNarrator: NarratorOutput;

  beforeEach(() => {
    // Mock WebSocket Manager
    mockWsManager = {
      publishToChannel: vi.fn()
    };

    // Mock narrator output
    mockNarrator = {
      type: 'SUMMARY',
      message: 'Found 5 results near you',
      question: null,
      suggestedAction: null,
      blocksSearch: false
    };
  });

  it('should publish to assistant channel with correct payload structure', () => {
    const requestId = 'req-123';
    const sessionId = 'session-456';

    publishAssistantMessage(mockWsManager, requestId, sessionId, mockNarrator);

    // Verify publishToChannel was called
    expect(mockWsManager.publishToChannel).toHaveBeenCalledTimes(1);

    // Verify channel name uses constant
    const [channel, reqId, sessId, payload] = mockWsManager.publishToChannel.mock.calls[0];
    expect(channel).toBe(ASSISTANT_WS_CHANNEL);
    expect(channel).toBe('assistant'); // Ensures constant matches expected value
    expect(reqId).toBe(requestId);
    expect(sessId).toBe(sessionId);

    // Verify payload structure
    expect(payload).toMatchObject({
      type: 'assistant_message',
      requestId,
      narrator: mockNarrator
    });
    expect(payload.timestamp).toBeGreaterThan(0);
  });

  it('should handle undefined sessionId gracefully', () => {
    const requestId = 'req-789';

    publishAssistantMessage(mockWsManager, requestId, undefined, mockNarrator);

    expect(mockWsManager.publishToChannel).toHaveBeenCalledTimes(1);
    const [, , sessId] = mockWsManager.publishToChannel.mock.calls[0];
    expect(sessId).toBeUndefined();
  });

  it('should not throw if WS manager throws (error is caught and logged)', () => {
    mockWsManager.publishToChannel = vi.fn().mockImplementation(() => {
      throw new Error('WebSocket error');
    });

    // Should not throw
    expect(() => {
      publishAssistantMessage(mockWsManager, 'req-999', 'session-999', mockNarrator);
    }).not.toThrow();
  });

  it('should preserve all narrator fields in payload', () => {
    const complexNarrator: NarratorOutput = {
      type: 'CLARIFY',
      message: 'Please specify location',
      question: 'Where would you like to search?',
      suggestedAction: 'enable_location',
      blocksSearch: true
    };

    publishAssistantMessage(mockWsManager, 'req-complex', 'session-complex', complexNarrator);

    const payload = mockWsManager.publishToChannel.mock.calls[0][3];
    expect(payload.narrator).toEqual(complexNarrator);
  });
});

describe('Assistant WS Channel Constant', () => {
  it('should export assistant channel constant', () => {
    expect(ASSISTANT_WS_CHANNEL).toBe('assistant');
  });

  it('should be a const (immutable)', () => {
    // TypeScript enforces this, but verify runtime behavior
    expect(() => {
      // @ts-expect-error Testing immutability
      (ASSISTANT_WS_CHANNEL as any) = 'other';
    }).toThrow();
  });
});
