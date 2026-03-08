/**
 * Gate2 query validity – unit tests.
 * Ensures gibberish, anchor-only, and profanity rules behave as expected.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  getGate2QueryValidityPreDecision,
  shouldOverrideFoodToClarify
} from './gate2-query-validity.js';

describe('getGate2QueryValidityPreDecision', () => {
  it('returns ASK_CLARIFY for empty or too short query', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision(''), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('a'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('  '), 'ASK_CLARIFY');
  });

  it('returns ASK_CLARIFY for anchor-only single token (do not pass for "restaurant" or city alone)', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('restaurant'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('restaurants'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('cafe'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('מסעדה'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('London'), 'ASK_CLARIFY');
    assert.strictEqual(getGate2QueryValidityPreDecision('paris'), 'ASK_CLARIFY');
  });

  it('returns PASS for valid food query (not anchor-only)', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('pizza'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('pizza in tel aviv'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('restaurants near me'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('restaurant near me'), 'PASS');
    assert.strictEqual(getGate2QueryValidityPreDecision('שווארמיה בתל אביב'), 'PASS');
  });

  it('"restaurant" with profanity/noise does not pass as FOOD', () => {
    const out = getGate2QueryValidityPreDecision('restaurant wtf');
    assert.ok(out !== 'PASS', `keyword+profanity must not PASS, got ${out}`);
  });

  it('returns ASK_CLARIFY for gibberish (consonant-heavy tokens)', () => {
    // Need 2+ tokens with 4+ chars and no vowel; "xyzq" has 'y', "abcdef" has vowels
    assert.strictEqual(getGate2QueryValidityPreDecision('ghjk bcdfg'), 'ASK_CLARIFY');
  });

  it('returns NOT_FOOD for profanity fragment with no food term', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('wtf dude'), 'NOT_FOOD');
  });

  it('returns ASK_CLARIFY for profanity fragment with food term (mixed)', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('pizza wtf'), 'ASK_CLARIFY');
  });

  it('noisy/hostile/partial-profanity: Hebrew hostile with location anchor → NOT_FOOD or ASK_CLARIFY', () => {
    const out = getGate2QueryValidityPreDecision('לך ל עסאסל בתל אביב');
    assert.ok(out === 'NOT_FOOD' || out === 'ASK_CLARIFY', `expected NOT_FOOD or ASK_CLARIFY, got ${out}`);
  });

  it('noisy/hostile: Hebrew profanity + city → NOT_FOOD', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('נא מפגל חדרה'), 'NOT_FOOD');
  });

  it('mixed intent: non-food venue + food anchor (e.g. garage restaurant) → ASK_CLARIFY', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('מוסך מסעדה בתל אביב'), 'ASK_CLARIFY');
  });

  it('valid Hebrew food query → PASS (FOOD)', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('פיצה טובה בתל אביב'), 'PASS');
  });

  it('valid Hebrew food + open-now + city → PASS (FOOD)', () => {
    assert.strictEqual(getGate2QueryValidityPreDecision('סושי פתוח עכשיו בחדרה'), 'PASS');
  });
});

describe('shouldOverrideFoodToClarify', () => {
  it('returns false for clean food query', () => {
    assert.strictEqual(shouldOverrideFoodToClarify('pizza in tel aviv'), false);
  });

  it('returns true for gibberish', () => {
    assert.strictEqual(shouldOverrideFoodToClarify('ghjk bcdfg'), true);
  });

  it('returns true for profanity fragment', () => {
    assert.strictEqual(shouldOverrideFoodToClarify('pizza wtf'), true);
  });

  it('returns true for mixed non-food venue + food anchor', () => {
    assert.strictEqual(shouldOverrideFoodToClarify('מוסך מסעדה בתל אביב'), true);
  });
});
