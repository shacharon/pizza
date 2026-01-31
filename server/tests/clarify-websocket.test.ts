/**
 * Integration Test: CLARIFY WebSocket Publishing
 * 
 * Tests that the publishAssistant method exists and works correctly
 * for publishing CLARIFY messages via WebSocket.
 */

import assert from 'assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { createServer } from 'http';
import { WebSocketManager } from '../src/infra/websocket/websocket-manager.js';

describe('CLARIFY WebSocket Publishing', () => {
  let server: any;
  let wsManager: WebSocketManager;

  beforeEach(() => {
    // Disable auth requirement for testing
    process.env.WS_REQUIRE_AUTH = 'false';
    
    server = createServer();
    wsManager = new WebSocketManager(server, {
      path: '/ws-test',
      heartbeatIntervalMs: 30000,
      allowedOrigins: ['*']
    });
  });

  afterEach(() => {
    wsManager.shutdown();
    server.close();
  });

  it('should have publishAssistant method', () => {
    assert.strictEqual(typeof wsManager.publishAssistant, 'function', 'publishAssistant should be a function');
  });

  it('should publish CLARIFY message without crashing', () => {
    const result = wsManager.publishAssistant('test-request-123', {
      type: 'CLARIFY',
      message: 'Please provide your location',
      question: null,
      blocksSearch: true
    });

    assert.ok(result, 'publishAssistant should return a result');
    assert.strictEqual(typeof result, 'object', 'Result should be an object');
    assert.ok('attempted' in result, 'Result should have attempted property');
    assert.ok('sent' in result, 'Result should have sent property');
    assert.ok('failed' in result, 'Result should have failed property');
  });

  it('should return zero counts when no subscribers', () => {
    const result = wsManager.publishAssistant('test-request-456', {
      type: 'CLARIFY',
      message: 'Location required',
      question: null,
      blocksSearch: true
    });

    assert.strictEqual(result.attempted, 0, 'No clients should be attempted');
    assert.strictEqual(result.sent, 0, 'No messages should be sent');
    assert.strictEqual(result.failed, 0, 'No sends should fail');
  });

  it('should accept all required CLARIFY fields', () => {
    const result = wsManager.publishAssistant('test-request-789', {
      type: 'CLARIFY',
      message: 'כדי לחפש מסעדות לידי אני צריך מיקום',
      question: 'אפשר לשתף את המיקום שלך?',
      blocksSearch: true,
      uiLanguage: 'he'
    });

    assert.strictEqual(result.attempted, 0, 'Should complete without error');
  });

  it('should accept optional fields', () => {
    const result = wsManager.publishAssistant('test-request-999', {
      type: 'CLARIFY',
      message: 'Test',
      blocksSearch: false
    });

    assert.ok(result, 'Should work with minimal fields');
  });

  it('should work with other assistant types', () => {
    const types = ['GATE_FAIL', 'SUMMARY', 'SEARCH_FAILED', 'GENERIC_QUERY_NARRATION', 'NUDGE_REFINE'] as const;
    
    types.forEach(type => {
      const result = wsManager.publishAssistant(`test-${type}`, {
        type,
        message: `Test message for ${type}`,
        question: null,
        blocksSearch: type === 'GATE_FAIL'
      });
      
      assert.ok(result, `Should work with type: ${type}`);
    });
  });
});

console.log('✅ All CLARIFY WebSocket tests defined');
