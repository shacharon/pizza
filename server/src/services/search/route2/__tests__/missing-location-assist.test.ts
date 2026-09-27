/**
 * Location question attached on a successful text search.
 * The empty LOCATION_REQUIRED response stays a separate builder and is not this path.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSING_LOCATION_CLARIFY_ASSIST,
  assistForSearchResponse,
  buildDeterministicMissingLocationClarify
} from '../guards/shared/response-builder.js';

describe('missing location assist', () => {
  it('uses the existing Hebrew question and does not mark the search blocked', () => {
    const assist = assistForSearchResponse(true, '');

    assert.equal(assist.type, 'clarify');
    assert.equal(assist.reason, 'MISSING_LOCATION');
    assert.equal(assist.suggestedAction, 'ASK_LOCATION');
    assert.equal(assist.message, 'כדי לחפש מסעדות אני צריך מיקום. תאפשר מיקום או כתוב עיר/אזור.');
    assert.equal(assist.question, 'איפה תרצה לחפש? (עיר או אזור)');
    assert.equal('blocksSearch' in assist, false);
    assert.deepEqual(assist, { ...MISSING_LOCATION_CLARIFY_ASSIST });
  });

  it('keeps the guide assist when a location anchor was present', () => {
    const assist = assistForSearchResponse(false, 'guide text');
    assert.deepEqual(assist, { type: 'guide', message: 'guide text' });
    assert.notEqual((assist as { reason?: string }).reason, 'MISSING_LOCATION');
  });

  it('the empty clarify builder still uses the same words and still has no places', () => {
    const response = buildDeterministicMissingLocationClarify({
      request: { query: 'פיצה', llmProvider: 'openai', sessionId: 's' },
      ctx: { requestId: 'r', startTime: Date.now(), llmProvider: {} as never },
      sessionId: 's',
      sourceLanguage: 'he',
      gateLanguage: 'he',
      confidence: 0.9
    });

    assert.equal(response.results.length, 0);
    assert.equal(response.meta.failureReason, 'LOCATION_REQUIRED');
    assert.equal(response.assist.message, MISSING_LOCATION_CLARIFY_ASSIST.message);
    assert.equal((response.assist as { question?: string }).question, MISSING_LOCATION_CLARIFY_ASSIST.question);
  });
});
