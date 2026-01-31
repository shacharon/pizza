/**
 * Sequential Search Test - Assistant Message Uniqueness
 * Verifies that assistant messages are NOT reused across different queries
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SearchAssistantHandler } from '../../../../../facades/search-assistant.facade';
import { AssistantDedupService } from '../../../../../facades/assistant-dedup.service';

describe('AssistantPanel - Sequential Search State Management', () => {
  let handler: SearchAssistantHandler;
  let dedupService: AssistantDedupService;

  beforeEach(() => {
    dedupService = new AssistantDedupService();
    handler = new SearchAssistantHandler();
    // Inject mock dedup service
    (handler as any).dedupService = dedupService;
  });

  describe('RequestId-Keyed State', () => {

    it('should clear assistant state on new search (reset)', () => {
      // Setup: Add a message for first search
      handler.addMessage(
        'SUMMARY',
        'מצאתי מסעדות איטלקיות בגדרה',
        'req-italian-gedera',
        null,
        false
      );

      // Verify message exists
      assert.strictEqual(handler.messages().length, 1);
      assert.strictEqual(handler.messages()[0].message, 'מצאתי מסעדות איטלקיות בגדרה');
      assert.strictEqual(handler.messages()[0].requestId, 'req-italian-gedera');

      // NEW SEARCH: Reset clears all state
      handler.reset();

      // Verify state is cleared
      assert.strictEqual(handler.messages().length, 0, 'Messages should be cleared');
      assert.strictEqual(handler.narration(), '', 'Narration should be cleared');
      assert.strictEqual(handler.requestId(), undefined, 'RequestId should be cleared');
      assert.strictEqual(handler.blocksSearch(), false, 'BlocksSearch should be reset');
    });

    it('should NOT carry over messages from previous search', () => {
      // Search 1: Italian in Gedera
      handler.addMessage(
        'SUMMARY',
        'מצאתי מסעדות איטלקיות בגדרה',
        'req-1-italian-gedera',
        null,
        false
      );

      assert.strictEqual(handler.messages().length, 1);
      assert.strictEqual(handler.messages()[0].message, 'מצאתי מסעדות איטלקיות בגדרה');

      // NEW SEARCH: Reset for fresh search
      handler.reset();

      // Search 2: Romantic kosher in Tel Aviv
      handler.addMessage(
        'SUMMARY',
        'מצאתי מסעדות רומנטיות כשרות בתל אביב',
        'req-2-romantic-tlv',
        null,
        false
      );

      // Verify: Only NEW message present (no carry-over)
      assert.strictEqual(handler.messages().length, 1, 'Should have only 1 message');
      assert.strictEqual(
        handler.messages()[0].message,
        'מצאתי מסעדות רומנטיות כשרות בתל אביב',
        'Should show NEW message, not old one'
      );
      assert.strictEqual(
        handler.messages()[0].requestId,
        'req-2-romantic-tlv',
        'RequestId should match current search'
      );
    });

    it('should handle 3 sequential searches without message leakage', () => {
      // Search 1: Italian
      handler.addMessage('SUMMARY', 'Italian restaurants in Gedera', 'req-1', null, false);
      assert.strictEqual(handler.messages().length, 1);
      assert.ok(handler.messages()[0].message.includes('Italian'));

      handler.reset();

      // Search 2: Sushi
      handler.addMessage('SUMMARY', 'Sushi bars in Tel Aviv', 'req-2', null, false);
      assert.strictEqual(handler.messages().length, 1);
      assert.ok(handler.messages()[0].message.includes('Sushi'));
      assert.ok(!handler.messages()[0].message.includes('Italian'), 'Should NOT contain old message');

      handler.reset();

      // Search 3: Generic
      handler.addMessage('SUMMARY', 'Good restaurants near you', 'req-3', null, false);
      assert.strictEqual(handler.messages().length, 1);
      assert.ok(handler.messages()[0].message.includes('restaurants'));
      assert.ok(!handler.messages()[0].message.includes('Sushi'), 'Should NOT contain old message');
      assert.ok(!handler.messages()[0].message.includes('Italian'), 'Should NOT contain old message');
    });
  });

  describe('Message Routing and Deduplication', () => {

    it('should route SUMMARY to card channel', () => {
      const decision = handler.routeMessage(
        'SUMMARY',
        'מצאתי 5 מסעדות',
        'req-1',
        { question: null, blocksSearch: false }
      );

      assert.strictEqual(decision.channel, 'card', 'SUMMARY should route to card channel');
      assert.strictEqual(decision.dedupDropped, false, 'First message should not be dropped');
      assert.strictEqual(handler.cardMessages().length, 1, 'Card messages should have 1 entry');
    });

    it('should deduplicate identical messages for same requestId', () => {
      // First message
      const decision1 = handler.routeMessage(
        'SUMMARY',
        'מצאתי 5 מסעדות',
        'req-1',
        { question: null, blocksSearch: false }
      );

      // Duplicate message (same requestId, type, message)
      const decision2 = handler.routeMessage(
        'SUMMARY',
        'מצאתי 5 מסעדות',
        'req-1',
        { question: null, blocksSearch: false }
      );

      assert.strictEqual(decision1.dedupDropped, false, 'First message should not be dropped');
      assert.strictEqual(decision2.dedupDropped, true, 'Duplicate should be dropped');
      assert.strictEqual(handler.cardMessages().length, 1, 'Should have only 1 card message');
    });

    it('should NOT deduplicate messages from different requestIds', () => {
      // Message for req-1
      handler.routeMessage(
        'SUMMARY',
        'מצאתי מסעדות איטלקיות בגדרה',
        'req-1',
        {}
      );

      // Clear for new search (simulates handler.reset())
      handler.reset();

      // Message for req-2 (same text but different requestId)
      handler.routeMessage(
        'SUMMARY',
        'מצאתי מסעדות איטלקיות בגדרה',
        'req-2',
        {}
      );

      // Should have 1 message (old one was cleared)
      assert.strictEqual(handler.cardMessages().length, 1);
      assert.strictEqual(handler.cardMessages()[0].requestId, 'req-2');
    });
  });

  describe('Language Handling', () => {

    it('should handle Hebrew messages correctly', () => {
      handler.addMessage(
        'SUMMARY',
        'מצאתי מסעדות איטלקיות בגדרה',
        'req-hebrew',
        null,
        false
      );

      const msg = handler.messages()[0];
      assert.ok(msg.message.includes('מצאתי'), 'Should contain Hebrew text');
      assert.ok(msg.message.includes('איטלקיות'), 'Should contain cuisine in Hebrew');
      assert.ok(msg.message.includes('בגדרה'), 'Should contain city in Hebrew');
    });

    it('should handle English messages correctly', () => {
      handler.addMessage(
        'SUMMARY',
        'Found Italian restaurants in Gedera',
        'req-english',
        null,
        false
      );

      const msg = handler.messages()[0];
      assert.ok(msg.message.includes('Found'), 'Should contain English text');
      assert.ok(msg.message.includes('Italian'), 'Should contain cuisine in English');
      assert.ok(msg.message.includes('Gedera'), 'Should contain city in English');
    });

    it('should NOT mix languages across sequential searches', () => {
      // Search 1: Hebrew
      handler.addMessage('SUMMARY', 'מצאתי מסעדות איטלקיות', 'req-1', null, false);
      assert.ok(handler.messages()[0].message.includes('מצאתי'));

      handler.reset();

      // Search 2: English
      handler.addMessage('SUMMARY', 'Found Italian restaurants', 'req-2', null, false);

      // Should have only English message (no Hebrew)
      assert.strictEqual(handler.messages().length, 1);
      assert.ok(handler.messages()[0].message.includes('Found'));
      assert.ok(!handler.messages()[0].message.includes('מצאתי'), 'Should NOT have Hebrew from old search');
    });
  });

  describe('BlocksSearch State Management', () => {

    it('should clear blocksSearch flag on new search', () => {
      // Search 1: CLARIFY (blocks search)
      handler.addMessage(
        'CLARIFY',
        'מה תרצה לאכול?',
        'req-1',
        'איזה סוג אוכל?',
        true // blocksSearch = true
      );

      assert.strictEqual(handler.blocksSearch(), true, 'Should block search initially');

      // NEW SEARCH: Reset should clear blocksSearch
      handler.reset();

      assert.strictEqual(handler.blocksSearch(), false, 'Should NOT block after reset');
      assert.strictEqual(handler.messages().length, 0, 'Messages should be cleared');
    });

    it('should handle transition from CLARIFY to SUMMARY correctly', () => {
      // First: CLARIFY message (blocks)
      handler.addMessage('CLARIFY', 'מה תרצה לאכול?', 'req-1', 'איזה אוכל?', true);
      assert.strictEqual(handler.blocksSearch(), true);

      // User answers clarification, triggers new search
      handler.reset();

      // Second: SUMMARY message (does not block)
      handler.addMessage('SUMMARY', 'מצאתי 5 מסעדות', 'req-2', null, false);

      assert.strictEqual(handler.blocksSearch(), false, 'SUMMARY should not block');
      assert.strictEqual(handler.messages().length, 1);
      assert.strictEqual(handler.messages()[0].type, 'SUMMARY');
    });
  });

  describe('Edge Cases', () => {

    it('should handle empty messages gracefully', () => {
      handler.addMessage('SUMMARY', '', 'req-empty', null, false);

      // Should still add the message (even if empty)
      assert.strictEqual(handler.messages().length, 1);
      assert.strictEqual(handler.messages()[0].message, '');
    });

    it('should handle rapid sequential searches', () => {
      // Rapid fire 3 searches
      handler.addMessage('SUMMARY', 'Message 1', 'req-1', null, false);
      handler.reset();

      handler.addMessage('SUMMARY', 'Message 2', 'req-2', null, false);
      handler.reset();

      handler.addMessage('SUMMARY', 'Message 3', 'req-3', null, false);

      // Should only have the latest message
      assert.strictEqual(handler.messages().length, 1);
      assert.strictEqual(handler.messages()[0].message, 'Message 3');
      assert.strictEqual(handler.messages()[0].requestId, 'req-3');
    });

    it('should handle multiple message types for same requestId', () => {
      // CLARIFY first
      handler.addMessage('CLARIFY', 'Need clarification', 'req-1', 'What food?', true);

      // Then SUMMARY (same requestId - rare but possible if backend sends both)
      handler.addMessage('SUMMARY', 'Found 5 results', 'req-1', null, false);

      // Should have 2 messages for same requestId
      assert.strictEqual(handler.messages().length, 2);
      assert.strictEqual(handler.messages()[0].type, 'CLARIFY');
      assert.strictEqual(handler.messages()[1].type, 'SUMMARY');
    });
  });
});
