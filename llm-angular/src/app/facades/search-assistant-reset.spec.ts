/**
 * Search Assistant Reset Tests
 * Tests that assistant messages are properly cleared on new search
 * and that old requestId messages are ignored
 */

import { TestBed } from '@angular/core/testing';
import { SearchAssistantHandler } from './search-assistant.facade';
import { AssistantDedupService } from './assistant-dedup.service';

describe('SearchAssistantHandler - Message Reset & RequestId Scoping', () => {
  let handler: SearchAssistantHandler;
  let dedupService: AssistantDedupService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SearchAssistantHandler,
        AssistantDedupService
      ]
    });

    handler = TestBed.inject(SearchAssistantHandler);
    dedupService = TestBed.inject(AssistantDedupService);
  });

  describe('reset() - Full message clearing', () => {
    it('should clear all messages when reset() is called', () => {
      // Add some messages
      handler.addMessage('SUMMARY', 'Test summary', 'req-1');
      handler.addMessage('CLARIFY', 'Test clarify', 'req-1', 'Question?');
      handler.addMessage('GATE_FAIL', 'Test gate fail', 'req-1');

      // Verify messages exist
      expect(handler.messages().length).toBe(3);
      expect(handler.cardMessages().length).toBe(3);

      // Reset
      handler.reset();

      // Verify all messages cleared
      expect(handler.messages().length).toBe(0);
      expect(handler.cardMessages().length).toBe(0);
      expect(handler.lineMessages().length).toBe(0);
      expect(handler.narration()).toBe('');
      expect(handler.status()).toBe('pending');
      expect(handler.requestId()).toBeUndefined();
    });

    it('should clear dedupe service when reset() is called', () => {
      // Add message
      handler.addMessage('SUMMARY', 'Test', 'req-1');

      // Spy on dedupe service (Jest syntax)
      const clearAllSpy = jest.spyOn(dedupService, 'clearAll');

      // Reset
      handler.reset();

      // Verify dedupe service cleared
      expect(clearAllSpy).toHaveBeenCalled();
    });
  });

  describe('Message scoping by requestId', () => {
    it('should store requestId with each message', () => {
      // Add messages with different requestIds
      handler.addMessage('SUMMARY', 'Summary 1', 'req-1');
      handler.addMessage('SUMMARY', 'Summary 2', 'req-2');

      const messages = handler.messages();
      
      // Verify both messages have requestIds
      expect(messages[0].requestId).toBe('req-1');
      expect(messages[1].requestId).toBe('req-2');
    });

    it('should keep messages from different requestIds separate', () => {
      // Add messages for req-1
      handler.addMessage('SUMMARY', 'Summary 1', 'req-1');
      handler.addMessage('CLARIFY', 'Clarify 1', 'req-1');

      // Add messages for req-2
      handler.addMessage('SUMMARY', 'Summary 2', 'req-2');

      const messages = handler.messages();
      
      // Verify all messages are stored
      expect(messages.length).toBe(3);

      // Verify requestIds
      const req1Messages = messages.filter(m => m.requestId === 'req-1');
      const req2Messages = messages.filter(m => m.requestId === 'req-2');
      
      expect(req1Messages.length).toBe(2);
      expect(req2Messages.length).toBe(1);
    });
  });

  describe('resetIfGlobal() - Selective clearing (LEGACY)', () => {
    it('should clear messages without requestId', () => {
      // Add message without requestId
      handler.setMessage('Global message');

      expect(handler.narration()).toBe('Global message');

      // Reset global
      handler.resetIfGlobal();

      // Verify cleared
      expect(handler.narration()).toBe('');
    });

    it('should preserve messages with requestId', () => {
      // Add message with requestId
      handler.addMessage('SUMMARY', 'Card-bound message', 'req-1');

      expect(handler.messages().length).toBe(1);

      // Reset global
      handler.resetIfGlobal();

      // Verify preserved
      expect(handler.messages().length).toBe(1);
      expect(handler.messages()[0].requestId).toBe('req-1');
    });
  });

  describe('Card vs Line channel routing', () => {
    it('should route SUMMARY, CLARIFY, GATE_FAIL to card channel', () => {
      handler.addMessage('SUMMARY', 'Test summary', 'req-1');
      handler.addMessage('CLARIFY', 'Test clarify', 'req-1', 'Question?');
      handler.addMessage('GATE_FAIL', 'Test fail', 'req-1');

      expect(handler.cardMessages().length).toBe(3);
    });

    it('should clear line messages but preserve card messages in resetIfGlobal()', () => {
      // Add line message (simulated - would normally come from routeMessage)
      handler.routeMessage('PROGRESS', 'Progress...', 'req-1');

      // Add card message
      handler.addMessage('SUMMARY', 'Summary', 'req-1');

      expect(handler.lineMessages().length).toBe(1);
      expect(handler.cardMessages().length).toBe(1);

      // Reset global
      handler.resetIfGlobal();

      // Line cleared, card preserved
      expect(handler.lineMessages().length).toBe(0);
      expect(handler.cardMessages().length).toBe(1);
    });
  });

  describe('Deduplication', () => {
    it('should not add duplicate messages', () => {
      // Add message
      handler.addMessage('SUMMARY', 'Test summary', 'req-1');

      // Try to add same message again
      handler.addMessage('SUMMARY', 'Test summary', 'req-1');

      // Should only have one message (deduped)
      const summaryMessages = handler.cardMessages().filter(m => m.type === 'SUMMARY');
      expect(summaryMessages.length).toBe(1);
    });

    it('should allow same message type for different requestIds', () => {
      // Add SUMMARY for req-1
      handler.addMessage('SUMMARY', 'Summary 1', 'req-1');

      // Add SUMMARY for req-2
      handler.addMessage('SUMMARY', 'Summary 2', 'req-2');

      // Should have both messages
      const messages = handler.messages();
      expect(messages.length).toBe(2);
    });
  });

  describe('blocksSearch flag', () => {
    it('should track blocksSearch flag for CLARIFY messages', () => {
      handler.addMessage('CLARIFY', 'Need clarification', 'req-1', 'What do you mean?', true);

      expect(handler.blocksSearch()).toBe(true);
    });

    it('should clear blocksSearch flag on reset', () => {
      handler.addMessage('CLARIFY', 'Need clarification', 'req-1', 'What do you mean?', true);

      expect(handler.blocksSearch()).toBe(true);

      handler.reset();

      expect(handler.blocksSearch()).toBe(false);
    });
  });
});
