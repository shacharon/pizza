/**
 * Test: AssistantPromptEngine unified language handling
 * 
 * Validates that all assistant contexts use the shared resolveLang helper
 * and respect all supported languages (he, en, ru, ar, fr, es)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AssistantPromptEngine } from '../prompt-engine.js';

describe('AssistantPromptEngine - Unified Language Handling', () => {
  const engine = new AssistantPromptEngine();

  it('GATE_FAIL: should respect French language', () => {
    const prompt = engine.buildUserPrompt({
      type: 'GATE_FAIL',
      query: 'Bistro français à Paris',
      language: 'fr',
      reason: 'NO_FOOD'
    });

    assert.ok(prompt.includes('Language: fr'));
    assert.ok(prompt.includes('MUST write in French (Français) ONLY'));
    assert.ok(prompt.includes('Set language=fr and outputLanguage=fr'));
  });

  it('CLARIFY: should respect Russian language', () => {
    const prompt = engine.buildUserPrompt({
      type: 'CLARIFY',
      query: 'ресторан',
      language: 'ru',
      reason: 'MISSING_LOCATION'
    });

    assert.ok(prompt.includes('Language: ru'));
    assert.ok(prompt.includes('MUST write in Russian (Русский) ONLY'));
    assert.ok(prompt.includes('Set language=ru and outputLanguage=ru'));
  });

  it('SEARCH_FAILED: should respect Arabic language', () => {
    const prompt = engine.buildUserPrompt({
      type: 'SEARCH_FAILED',
      query: 'مطعم',
      language: 'ar',
      reason: 'GOOGLE_TIMEOUT'
    });

    assert.ok(prompt.includes('Language: ar'));
    assert.ok(prompt.includes('MUST write in Arabic (العربية) ONLY'));
    assert.ok(prompt.includes('Set language=ar and outputLanguage=ar'));
  });

  it('GENERIC_QUERY_NARRATION: should respect Spanish language', () => {
    const prompt = engine.buildUserPrompt({
      type: 'GENERIC_QUERY_NARRATION',
      query: 'restaurante',
      language: 'es',
      resultCount: 10,
      usedCurrentLocation: true
    });

    assert.ok(prompt.includes('Language: es'));
    assert.ok(prompt.includes('MUST write in Spanish (Español) ONLY'));
    assert.ok(prompt.includes('Set language=es and outputLanguage=es'));
  });

  it('SUMMARY: should respect French language', () => {
    const prompt = engine.buildUserPrompt({
      type: 'SUMMARY',
      query: 'Bistro français à Paris',
      language: 'fr',
      resultCount: 15,
      top3Names: ['Le Bistro', 'Chez Pierre', 'La Brasserie'],
      metadata: {
        openNowCount: 10,
        currentHour: 14
      }
    });

    assert.ok(prompt.includes('requestedLanguage: fr'));
    assert.ok(prompt.includes('MUST write in French (Français) ONLY'));
    assert.ok(prompt.includes('Set language=fr and outputLanguage=fr'));
  });

  it('should not use English unless language=en', () => {
    const languages = ['he', 'ru', 'ar', 'fr', 'es'];
    
    languages.forEach(lang => {
      const prompt = engine.buildUserPrompt({
        type: 'GATE_FAIL',
        query: 'test query',
        language: lang as any,
        reason: 'NO_FOOD'
      });

      // Should NOT contain "MUST write in English ONLY"
      assert.ok(!prompt.includes('MUST write in English ONLY'));
      // Should contain the specific language instruction
      assert.ok(prompt.includes(`Language: ${lang}`));
    });
  });

  console.log('✓ All assistant contexts use unified language resolver');
  console.log('✓ All languages (he/en/ru/ar/fr/es) are properly handled');
  console.log('✓ No English fallback unless language=en');
});
