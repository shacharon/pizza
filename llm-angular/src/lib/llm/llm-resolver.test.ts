/**
 * LLM Resolver Unit Tests
 * 
 * Tests configuration resolution, validation, and fallback behavior
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLLM, getAllResolvedLLMs } from './llm-resolver.js';
import { clearLLMConfigCache } from './llm-config.js';

describe('LLM Resolver', () => {
  // Store original env vars
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    clearLLMConfigCache();
  });

  afterEach(() => {
    // Restore original env
    process.env = originalEnv;
    clearLLMConfigCache();
  });

  describe('resolveLLM - Default Configuration', () => {
    it('should return default model when no overrides set', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');

      assert.strictEqual(resolved.model, 'gpt-4o-mini');
    });

    it('should return purpose-specific timeout when no override', () => {
      clearLLMConfigCache();

      const gateResolved = resolveLLM('gate');
      const intentResolved = resolveLLM('intent');
      const baseFiltersResolved = resolveLLM('baseFilters');
      const routeMapperResolved = resolveLLM('routeMapper');
      const assistantResolved = resolveLLM('assistant');

      assert.strictEqual(gateResolved.timeoutMs, 2500);
      assert.strictEqual(intentResolved.timeoutMs, 2500);
      assert.strictEqual(baseFiltersResolved.timeoutMs, 2000);
      assert.strictEqual(routeMapperResolved.timeoutMs, 3500);
      assert.strictEqual(assistantResolved.timeoutMs, 3000);
    });

    it('should fall back to gpt-4o-mini when LLM_DEFAULT_MODEL not set', () => {
      delete process.env.LLM_DEFAULT_MODEL;
      delete process.env.OPENAI_MODEL;
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');

      assert.strictEqual(resolved.model, 'gpt-4o-mini');
    });
  });

  describe('resolveLLM - Per-Purpose Overrides', () => {
    it('should return per-purpose model when GATE_MODEL is set', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.GATE_MODEL = 'gpt-4o';
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');

      assert.strictEqual(resolved.model, 'gpt-4o');
    });

    it('should return per-purpose model when INTENT_MODEL is set', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.INTENT_MODEL = 'o1-mini';
      clearLLMConfigCache();

      const resolved = resolveLLM('intent');

      assert.strictEqual(resolved.model, 'o1-mini');
    });

    it('should return per-purpose timeout when GATE_TIMEOUT_MS is set', () => {
      process.env.GATE_TIMEOUT_MS = '5000';
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');

      assert.strictEqual(resolved.timeoutMs, 5000);
    });

    it('should return per-purpose timeout when ASSISTANT_TIMEOUT_MS is set', () => {
      process.env.ASSISTANT_TIMEOUT_MS = '8000';
      clearLLMConfigCache();

      const resolved = resolveLLM('assistant');

      assert.strictEqual(resolved.timeoutMs, 8000);
    });

    it('should apply different overrides to different purposes', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.GATE_MODEL = 'gpt-4o';
      process.env.ASSISTANT_MODEL = 'gpt-4o-mini';
      process.env.GATE_TIMEOUT_MS = '3000';
      process.env.ASSISTANT_TIMEOUT_MS = '5000';
      clearLLMConfigCache();

      const gateResolved = resolveLLM('gate');
      const assistantResolved = resolveLLM('assistant');

      assert.strictEqual(gateResolved.model, 'gpt-4o');
      assert.strictEqual(gateResolved.timeoutMs, 3000);
      assert.strictEqual(assistantResolved.model, 'gpt-4o-mini');
      assert.strictEqual(assistantResolved.timeoutMs, 5000);
    });
  });

  describe('resolveLLM - Validation', () => {
    it('should fall back to gpt-4o-mini when model is empty', () => {
      process.env.LLM_DEFAULT_MODEL = '';
      delete process.env.OPENAI_MODEL;
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');
      
      // Should use hardcoded default (gpt-4o-mini) instead of empty string
      assert.strictEqual(resolved.model, 'gpt-4o-mini');
    });

    it('should fall back to purpose default when timeout is zero', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.GATE_TIMEOUT_MS = '0';
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');
      
      // Should use purpose-specific default (2500) instead of 0
      assert.strictEqual(resolved.timeoutMs, 2500);
    });

    it('should throw error when timeout is negative', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.INTENT_TIMEOUT_MS = '-100';
      clearLLMConfigCache();

      assert.throws(
        () => resolveLLM('intent'),
        /Invalid LLM configuration for purpose 'intent': timeout must be positive/
      );
    });

    it('should fall back to purpose default when timeout is NaN', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.ASSISTANT_TIMEOUT_MS = 'invalid';
      clearLLMConfigCache();

      const resolved = resolveLLM('assistant');
      
      // Should use purpose-specific default (3000) instead of NaN
      assert.strictEqual(resolved.timeoutMs, 3000);
    });
  });

  describe('resolveLLM - All Purposes', () => {
    it('should resolve all purposes without errors', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      clearLLMConfigCache();

      const purposes = ['gate', 'intent', 'baseFilters', 'routeMapper', 'assistant'] as const;

      for (const purpose of purposes) {
        assert.doesNotThrow(() => {
          const resolved = resolveLLM(purpose);
          assert.ok(resolved.model);
          assert.ok(resolved.timeoutMs > 0);
        });
      }
    });

    it('should return correct timeouts for all purposes with defaults', () => {
      clearLLMConfigCache();

      const resolved = getAllResolvedLLMs();

      assert.strictEqual(resolved.gate.timeoutMs, 2500);
      assert.strictEqual(resolved.intent.timeoutMs, 2500);
      assert.strictEqual(resolved.baseFilters.timeoutMs, 2000);
      assert.strictEqual(resolved.routeMapper.timeoutMs, 3500);
      assert.strictEqual(resolved.assistant.timeoutMs, 3000);
    });
  });

  describe('resolveLLM - Edge Cases', () => {
    it('should handle OPENAI_MODEL as fallback for LLM_DEFAULT_MODEL', () => {
      delete process.env.LLM_DEFAULT_MODEL;
      process.env.OPENAI_MODEL = 'gpt-4o';
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');

      assert.strictEqual(resolved.model, 'gpt-4o');
    });

    it('should fall back when whitespace-only model provided', () => {
      process.env.LLM_DEFAULT_MODEL = '   ';
      delete process.env.OPENAI_MODEL;
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');
      
      // Should use hardcoded default (gpt-4o-mini) instead of whitespace
      assert.strictEqual(resolved.model, 'gpt-4o-mini');
    });

    it('should handle very large timeout values', () => {
      process.env.GATE_TIMEOUT_MS = '60000';
      clearLLMConfigCache();

      const resolved = resolveLLM('gate');

      assert.strictEqual(resolved.timeoutMs, 60000);
    });

    it('should cache config across multiple resolveLLM calls', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      clearLLMConfigCache();

      const resolved1 = resolveLLM('gate');
      
      // Change env (should not affect cached config)
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o';
      
      const resolved2 = resolveLLM('intent');

      // Both should use the cached config
      assert.strictEqual(resolved1.model, 'gpt-4o-mini');
      assert.strictEqual(resolved2.model, 'gpt-4o-mini');
    });
  });

  describe('getAllResolvedLLMs', () => {
    it('should return all purposes with resolved config', () => {
      process.env.LLM_DEFAULT_MODEL = 'gpt-4o-mini';
      process.env.GATE_MODEL = 'gpt-4o';
      clearLLMConfigCache();

      const all = getAllResolvedLLMs();

      assert.ok(all.gate);
      assert.ok(all.intent);
      assert.ok(all.baseFilters);
      assert.ok(all.routeMapper);
      assert.ok(all.assistant);

      assert.strictEqual(all.gate.model, 'gpt-4o');
      assert.strictEqual(all.intent.model, 'gpt-4o-mini');
    });
  });
});
