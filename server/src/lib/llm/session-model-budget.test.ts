import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MODEL_CALLS_PER_SESSION_DAY,
  ModelBudgetExceededError,
  consumeSessionModelCall,
  modelBudgetLog,
  type ModelBudgetStore
} from './session-model-budget.js';
import { SEARCH_REQUESTS_PER_MINUTE, buildRateLimitKey } from '../../middleware/rate-limit.middleware.js';

function memoryStore(): ModelBudgetStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async increment(key: string) {
      const next = (counts.get(key) ?? 0) + 1;
      counts.set(key, next);
      return next;
    }
  };
}

describe('search rate key', () => {
  it('joins IP and session', () => {
    assert.equal(
      buildRateLimitKey('search', '1.2.3.4', 'sess_abcdef123456'),
      'search:1.2.3.4:sess_abcdef123456'
    );
  });

  it('uses nosession when the session id is missing', () => {
    assert.equal(buildRateLimitKey('search', '1.2.3.4'), 'search:1.2.3.4:nosession');
    assert.equal(buildRateLimitKey('search', '1.2.3.4', ''), 'search:1.2.3.4:nosession');
  });

  it('caps search at 30 requests a minute', () => {
    assert.equal(SEARCH_REQUESTS_PER_MINUTE, 30);
    const routerSource = readFileSync(new URL('../../routes/v1/index.ts', import.meta.url), 'utf8');
    assert.match(routerSource, /maxRequests:\s*SEARCH_REQUESTS_PER_MINUTE/);
    assert.match(routerSource, /includeSession:\s*true/);
  });
});

describe('consumeSessionModelCall', () => {
  it('allows 40 calls and refuses the 41st', async () => {
    const store = memoryStore();
    const sessionId = 'sess_abcdef123456';
    for (let i = 0; i < MODEL_CALLS_PER_SESSION_DAY; i++) {
      await consumeSessionModelCall(sessionId, store);
    }
    await assert.rejects(
      () => consumeSessionModelCall(sessionId, store),
      (error: unknown) => {
        assert.ok(error instanceof ModelBudgetExceededError);
        assert.equal(error.message, 'Try again later');
        assert.equal(error.message.includes('pizza on Allenby'), false);
        return true;
      }
    );
  });

  it('logs the count and an 8-character session prefix', () => {
    const fields = modelBudgetLog(41, 'sess_abcdef123456');
    assert.equal(fields.event, 'model_budget_exceeded');
    assert.equal(fields.count, 41);
    assert.equal(fields.sessionPrefix, 'sess_abc');
    assert.equal(fields.sessionPrefix.length, 8);
    assert.equal('query' in fields, false);
    assert.equal(modelBudgetLog(41, undefined).sessionPrefix, 'none');
  });
});
