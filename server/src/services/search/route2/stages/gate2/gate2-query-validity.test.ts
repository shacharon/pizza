/**
 * Gate2 query validity – profanity only.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getGate2QueryValidityPreDecision,
  shouldOverrideFoodToClarify
} from './gate2-query-validity.js';

describe('getGate2QueryValidityPreDecision', () => {
  it('passes a short query, a single anchor, gibberish, and a long Hebrew sentence', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision(''), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('a'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('restaurant'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('London'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('ghjk bcdfg'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('מוסך מסעדה בתל אביב'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('מסעדות מומלצות בבלגרד'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('מסעדות מומלצות לבורקס בבלגרד'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('פיצה טובה בתל אביב'), 'PASS');
  });

  it('stops a swear word with no food term', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('wtf dude'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('נא מפגל חדרה'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('putain'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('mierda'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('scheisse'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('cazzo'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('хуй'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('شرموطة'), 'NOT_FOOD');
    assert.strictEqual(getGate2QueryValidityPreDecision('ሻርሙጣ'), 'NOT_FOOD');
  });

  it('asks to clarify when a swear word sits next to food', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('pizza wtf'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('restaurant wtf'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('לך ל עסאסל פיצה'), 'ASK_CLARIFY');
  });
});

describe('shouldOverrideFoodToClarify', () => {
  it('leaves a clean food query alone', () => {
    assert.strictEqual(shouldOverrideFoodToClarify('pizza in tel aviv'), false);
    assert.strictEqual(shouldOverrideFoodToClarify('ghjk bcdfg'), false);
    assert.strictEqual(shouldOverrideFoodToClarify('מוסך מסעדה בתל אביב'), false);
  });

  it('overrides when the query contains a swear word', () => {
    assert.strictEqual(shouldOverrideFoodToClarify('pizza wtf'), true);
  });
});
