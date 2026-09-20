import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { classifySearchOutcome } from './search-audit.js';
import type { SearchResponse } from '../types/search-response.dto.js';

function res(partial: Partial<SearchResponse>): SearchResponse {
  return {
    requestId: 'r1',
    sessionId: 's1',
    query: { original: 'pizza', parsed: null as never, language: 'en' },
    results: [],
    chips: [],
    assist: { type: 'guide', message: '' },
    meta: { tookMs: 1, mode: 'textsearch', appliedFilters: [], confidence: 1, source: 'route2', failureReason: 'NONE' },
    ...partial,
  } as SearchResponse;
}

describe('classifySearchOutcome', () => {
  test('results with places is good', () => {
    const c = classifySearchOutcome(res({ results: [{ name: 'A' }] as never }));
    assert.equal(c.good, true);
    assert.equal(c.kind, 'results');
  });

  test('clarify is not good', () => {
    const c = classifySearchOutcome(
      res({ assist: { type: 'clarify', message: 'where?' }, meta: { failureReason: 'LOCATION_REQUIRED' } as never })
    );
    assert.equal(c.good, false);
    assert.equal(c.kind, 'clarify');
  });

  test('timeout error', () => {
    const err = new Error('timeout');
    err.name = 'TimeoutError';
    const c = classifySearchOutcome(null, err);
    assert.equal(c.kind, 'timeout');
    assert.equal(c.good, false);
  });
});
