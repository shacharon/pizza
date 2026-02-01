/**
 * Assistant Language Propagation Test
 * Verifies that assistantLanguage and uiLanguage from WS envelope
 * are correctly propagated to assistant card messages
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SearchAssistantHandler } from '../search-assistant.facade';
import { AssistantDedupService } from '../assistant-dedup.service';

describe('Assistant Language Propagation', () => {
  let handler: SearchAssistantHandler;

  beforeEach(() => {
    handler = new SearchAssistantHandler(new AssistantDedupService());
  });

  it('should propagate assistantLanguage to card message', () => {
    // Given: WS message with assistantLanguage="ru"
    handler.addMessage(
      'SUMMARY',
      'Найдены рестораны',
      'req-123',
      null,
      false,
      'ru' // assistantLanguage from envelope
    );

    // Then: Card message should have language="ru"
    const cards = handler.assistantCardMessages();
    expect(cards.length).toBe(1);
    expect(cards[0].language).toBe('ru');
    expect(cards[0].type).toBe('SUMMARY');
  });

  it('should propagate uiLanguage when assistantLanguage is missing', () => {
    // Given: WS message with only uiLanguage (no assistantLanguage)
    // Simulated by passing uiLanguage as the language parameter
    handler.addMessage(
      'CLARIFY',
      'هل تريد مطعم قريب؟',
      'req-456',
      'أين تريد أن تأكل؟',
      true,
      'ar' // uiLanguage from envelope (fallback)
    );

    // Then: Card message should have language="ar"
    const cards = handler.assistantCardMessages();
    expect(cards.length).toBe(1);
    expect(cards[0].language).toBe('ar');
    expect(cards[0].type).toBe('CLARIFY');
  });

  it('should handle missing language gracefully', () => {
    // Given: WS message with no language fields
    handler.addMessage(
      'GATE_FAIL',
      'Not food related',
      'req-789',
      null,
      true
      // No language parameter
    );

    // Then: Card message should exist but language is undefined (UI will use fallback)
    const cards = handler.assistantCardMessages();
    expect(cards.length).toBe(1);
    expect(cards[0].language).toBeUndefined();
    expect(cards[0].type).toBe('GATE_FAIL');
  });

  it('should preserve language across multiple messages', () => {
    // Given: Multiple messages with different languages
    handler.addMessage('SUMMARY', 'Found 5 restaurants', 'req-1', null, false, 'en');
    handler.addMessage('SUMMARY', 'נמצאו 3 מסעדות', 'req-2', null, false, 'he');
    handler.addMessage('SUMMARY', 'Найдено 7 ресторанов', 'req-3', null, false, 'ru');

    // Then: Each card should have its own language
    const cards = handler.assistantCardMessages();
    expect(cards.length).toBe(3);
    expect(cards[0].language).toBe('en');
    expect(cards[1].language).toBe('he');
    expect(cards[2].language).toBe('ru');
  });

  it('should deduplicate messages but preserve language', () => {
    // Given: Duplicate messages with same language
    handler.addMessage('SUMMARY', 'Test message', 'req-dup', null, false, 'fr');
    handler.addMessage('SUMMARY', 'Test message', 'req-dup', null, false, 'fr'); // Duplicate

    // Then: Only one message should exist (deduplicated), with correct language
    const cards = handler.assistantCardMessages();
    expect(cards.length).toBe(1);
    expect(cards[0].language).toBe('fr');
  });
});
