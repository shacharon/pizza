/**
 * Assistant Query Language Tests
 * Verifies assistant responds in query's detected language
 * 
 * GOAL: English query → English assistant, Hebrew query → Hebrew assistant
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import { searchRoute2 } from '../src/services/search/route2/route2.orchestrator.js';
import { createLLMProvider } from '../src/lib/llm/index.js';
import type { SearchRequest } from '../src/services/search/types/search-request.dto.js';

describe('Assistant Query Language', () => {
  let llmProvider: any;

  beforeAll(() => {
    llmProvider = createLLMProvider('assistant');
  });

  describe('English queries', () => {
    it('should respond in English for "what the weather is?"', async () => {
      const request: SearchRequest = {
        query: 'what the weather is?',
        filters: {},
        sessionId: 'test-session-en-1',
        locale: 'en',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-en-1',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Verify queryLanguage was detected as English
      expect(ctx).toHaveProperty('queryLanguage', 'en');

      // Verify assistant message exists (GATE_FAIL expected)
      expect(response.assist).toBeDefined();
      expect(response.assist.type).toBe('GATE_FAIL');

      // Verify message is in English (contains English words, no Hebrew)
      const message = response.assist.message || '';
      expect(message.length).toBeGreaterThan(0);

      // Should NOT contain Hebrew characters
      const hebrewRegex = /[\u0590-\u05FF]/;
      expect(hebrewRegex.test(message)).toBe(false);

      // Should contain English words
      const hasEnglish = /[a-zA-Z]{3,}/.test(message);
      expect(hasEnglish).toBe(true);
    }, 30000);

    it('should respond in English for "pizza near me" with no location', async () => {
      const request: SearchRequest = {
        query: 'pizza near me',
        filters: {},
        sessionId: 'test-session-en-2',
        locale: 'en',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-en-2',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Verify queryLanguage was detected as English
      expect(ctx).toHaveProperty('queryLanguage', 'en');

      // Verify assistant message exists (CLARIFY expected for missing location)
      expect(response.assist).toBeDefined();

      const message = response.assist.message || '';

      // Should NOT contain Hebrew characters
      const hebrewRegex = /[\u0590-\u05FF]/;
      expect(hebrewRegex.test(message)).toBe(false);
    }, 30000);
  });

  describe('Hebrew queries', () => {
    it('should respond in Hebrew for "מה מזג האוויר?"', async () => {
      const request: SearchRequest = {
        query: 'מה מזג האוויר?',
        filters: {},
        sessionId: 'test-session-he-1',
        locale: 'he',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-he-1',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Verify queryLanguage was detected as Hebrew
      expect(ctx).toHaveProperty('queryLanguage', 'he');

      // Verify assistant message exists (GATE_FAIL expected)
      expect(response.assist).toBeDefined();
      expect(response.assist.type).toBe('GATE_FAIL');

      // Verify message is in Hebrew (contains Hebrew characters)
      const message = response.assist.message || '';
      expect(message.length).toBeGreaterThan(0);

      // Should contain Hebrew characters
      const hebrewRegex = /[\u0590-\u05FF]/;
      expect(hebrewRegex.test(message)).toBe(true);
    }, 30000);

    it('should respond in Hebrew for "פיצה" with no location', async () => {
      const request: SearchRequest = {
        query: 'פיצה',
        filters: {},
        sessionId: 'test-session-he-2',
        locale: 'he',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-he-2',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Verify queryLanguage was detected as Hebrew
      expect(ctx).toHaveProperty('queryLanguage', 'he');

      // Verify assistant message exists
      expect(response.assist).toBeDefined();

      const message = response.assist.message || '';

      // Should contain Hebrew characters
      const hebrewRegex = /[\u0590-\u05FF]/;
      expect(hebrewRegex.test(message)).toBe(true);
    }, 30000);
  });

  describe('Mixed queries', () => {
    it('should respond in Hebrew for "פיצה pizza" (Hebrew detected)', async () => {
      const request: SearchRequest = {
        query: 'פיצה pizza',
        filters: {},
        sessionId: 'test-session-mixed-1',
        locale: 'en',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-mixed-1',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Verify queryLanguage was detected as Hebrew (even though locale is en)
      expect(ctx).toHaveProperty('queryLanguage', 'he');

      // Verify assistant message is in Hebrew (ignoring UI locale)
      expect(response.assist).toBeDefined();

      const message = response.assist.message || '';

      // Should contain Hebrew characters
      const hebrewRegex = /[\u0590-\u05FF]/;
      expect(hebrewRegex.test(message)).toBe(true);
    }, 30000);
  });

  describe('Edge cases', () => {
    it('should handle empty query gracefully', async () => {
      const request: SearchRequest = {
        query: '',
        filters: {},
        sessionId: 'test-session-empty',
        locale: 'en',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-empty',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Empty query defaults to English
      expect(ctx).toHaveProperty('queryLanguage', 'en');
    }, 30000);

    it('should handle emoji-only query', async () => {
      const request: SearchRequest = {
        query: '🍕🍔🍝',
        filters: {},
        sessionId: 'test-session-emoji',
        locale: 'he',
        userLocation: null
      };

      const ctx = {
        requestId: 'test-req-emoji',
        startTime: Date.now(),
        llmProvider
      };

      const response = await searchRoute2(request, ctx as any);

      // Emoji-only defaults to English (no Hebrew chars)
      expect(ctx).toHaveProperty('queryLanguage', 'en');
    }, 30000);
  });
});
