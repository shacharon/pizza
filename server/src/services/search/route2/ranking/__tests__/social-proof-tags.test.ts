/**
 * Unit tests for social-proof tags (pure function + boost)
 * Edge cases: missing rating/reviewCount, boundaries, multiple tags
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeSocialProofTags, getSocialProofBoost } from '../social-proof-tags.js';

describe('computeSocialProofTags', () => {
  describe('Hidden Gem (rating >= 4.5, 20 <= reviewCount <= 250)', () => {
    it('returns HIDDEN_GEM at boundary 4.5 and 20', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 20), ['HIDDEN_GEM']);
    });
    it('returns HIDDEN_GEM at boundary 4.5 and 250', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 250), ['HIDDEN_GEM']);
    });
    it('returns HIDDEN_GEM in middle range', () => {
      assert.deepEqual(computeSocialProofTags(4.7, 100), ['HIDDEN_GEM']);
    });
    it('does not return HIDDEN_GEM when reviewCount < 20', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 19), []);
    });
    it('does not return HIDDEN_GEM when reviewCount > 250', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 251), []);
    });
    it('does not return HIDDEN_GEM when rating < 4.5', () => {
      assert.deepEqual(computeSocialProofTags(4.4, 100), []);
    });
  });

  describe('Crowd Favorite (rating >= 4.3, reviewCount >= 1000)', () => {
    it('returns CROWD_FAVORITE and POPULAR_RELIABLE at boundary 4.3 and 1000', () => {
      assert.deepEqual(computeSocialProofTags(4.3, 1000), ['CROWD_FAVORITE', 'POPULAR_RELIABLE']);
    });
    it('returns CROWD_FAVORITE and POPULAR_RELIABLE for 4.5 and 2000 (no Hidden Gem: 2000 > 250)', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 2000), ['CROWD_FAVORITE', 'POPULAR_RELIABLE']);
    });
    it('returns only POPULAR_RELIABLE when reviewCount < 1000 (4.3, 999)', () => {
      assert.deepEqual(computeSocialProofTags(4.3, 999), ['POPULAR_RELIABLE']);
    });
    it('returns only POPULAR_RELIABLE when rating 4.2 and 5000 (Crowd Favorite needs 4.3+)', () => {
      assert.deepEqual(computeSocialProofTags(4.2, 5000), ['POPULAR_RELIABLE']);
    });
  });

  describe('Popular & Reliable (rating >= 4.2, reviewCount >= 300)', () => {
    it('returns POPULAR_RELIABLE at boundary 4.2 and 300', () => {
      assert.deepEqual(computeSocialProofTags(4.2, 300), ['POPULAR_RELIABLE']);
    });
    it('returns POPULAR_RELIABLE only for 4.5 and 500 (500 < 1000 so no Crowd Favorite)', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 500), ['POPULAR_RELIABLE']);
    });
    it('does not return POPULAR_RELIABLE when reviewCount < 300', () => {
      assert.deepEqual(computeSocialProofTags(4.2, 299), []);
    });
    it('does not return POPULAR_RELIABLE when rating < 4.2', () => {
      assert.deepEqual(computeSocialProofTags(4.1, 1000), []);
    });
  });

  describe('missing or invalid inputs', () => {
    it('returns [] when rating is undefined', () => {
      assert.deepEqual(computeSocialProofTags(undefined, 100), []);
    });
    it('returns [] when rating is null', () => {
      assert.deepEqual(computeSocialProofTags(null, 100), []);
    });
    it('returns [] when reviewCount is undefined', () => {
      assert.deepEqual(computeSocialProofTags(4.5, undefined), []);
    });
    it('returns [] when reviewCount is null', () => {
      assert.deepEqual(computeSocialProofTags(4.5, null), []);
    });
    it('returns [] when reviewCount is 0', () => {
      assert.deepEqual(computeSocialProofTags(4.5, 0), []);
    });
    it('returns [] when reviewCount is negative', () => {
      assert.deepEqual(computeSocialProofTags(4.5, -1), []);
    });
    it('returns [] when rating is NaN', () => {
      assert.deepEqual(computeSocialProofTags(Number.NaN, 100), []);
    });
    it('returns [] when reviewCount is NaN', () => {
      assert.deepEqual(computeSocialProofTags(4.5, Number.NaN), []);
    });
  });

  describe('multiple tags', () => {
    it('can return all three when criteria met', () => {
      // 4.5+, 20-250 => HIDDEN_GEM; 4.3+, 1000+ => CROWD_FAVORITE; 4.2+, 300+ => POPULAR_RELIABLE
      // No single (rating, count) satisfies all three: Hidden Gem caps at 250, others need 300+ and 1000+
      const tags = computeSocialProofTags(4.5, 1000);
      assert.ok(tags.includes('HIDDEN_GEM') === false); // 1000 > 250
      assert.ok(tags.includes('CROWD_FAVORITE'));
      assert.ok(tags.includes('POPULAR_RELIABLE'));
    });
    it('returns POPULAR_RELIABLE only for 4.5 and 300 (above Hidden Gem max 250)', () => {
      const tags = computeSocialProofTags(4.5, 300);
      assert.ok(tags.includes('POPULAR_RELIABLE'));
      assert.ok(tags.includes('HIDDEN_GEM') === false);
      assert.ok(tags.includes('CROWD_FAVORITE') === false);
    });
  });
});

describe('getSocialProofBoost', () => {
  it('returns 0 when tags is empty', () => {
    assert.equal(getSocialProofBoost([], { HIDDEN_GEM: 2 }), 0);
  });
  it('returns 0 when tags is null/undefined', () => {
    assert.equal(getSocialProofBoost(null, { HIDDEN_GEM: 2 }), 0);
    assert.equal(getSocialProofBoost(undefined, { HIDDEN_GEM: 2 }), 0);
  });
  it('returns 0 when weights is null/undefined', () => {
    assert.equal(getSocialProofBoost(['HIDDEN_GEM'], null), 0);
    assert.equal(getSocialProofBoost(['HIDDEN_GEM'], undefined), 0);
  });
  it('sums boost for each tag', () => {
    assert.equal(
      getSocialProofBoost(
        ['HIDDEN_GEM', 'POPULAR_RELIABLE'],
        { HIDDEN_GEM: 2, POPULAR_RELIABLE: 1.5 }
      ),
      3.5
    );
  });
  it('ignores missing weight for a tag', () => {
    assert.equal(
      getSocialProofBoost(['HIDDEN_GEM', 'CROWD_FAVORITE'], { HIDDEN_GEM: 2 }),
      2
    );
  });
});
