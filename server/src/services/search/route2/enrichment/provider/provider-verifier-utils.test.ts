/**
 * Tests for shared provider verifier utils: name normalization, Jaccard, city canonicalization.
 * Covers name_score_too_low and city_mismatch fix behavior.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  NAME_SCORE_MIN_THRESHOLD,
  NAME_SCORE_VERIFIED_THRESHOLD,
  CITY_SCORE_MIN_THRESHOLD,
  normalizeNameForVerifier,
  normalizeName,
  jaccardTokenOverlap,
  toCanonicalCity,
  passesVerifierNameCityRule,
  safeDecodePath,
  slugTokenMatch,
  tokensFromNormalized,
  scoreNameCandidate,
  scoreCityCandidate,
} from './provider-verifier-utils.js';

describe('provider-verifier-utils', () => {
  describe('normalizeNameForVerifier', () => {
    it('strips diacritics, punctuation, maps | - _ to space, removes city/brand suffix', () => {
      assert.strictEqual(
        normalizeNameForVerifier('Pizza House | Wolt'),
        'pizza house',
        'Strip brand suffix and normalize'
      );
      assert.strictEqual(
        normalizeNameForVerifier('pizza-house-tel-aviv'),
        'pizza house tel aviv',
        'Hyphens to space (trailing city stripped only when preceded by | or -)'
      );
      assert.strictEqual(
        normalizeNameForVerifier("Café Résumé"),
        'cafe resume',
        'Strip diacritics'
      );
    });

    it('removes noise tokens', () => {
      assert.strictEqual(
        normalizeNameForVerifier('Pizza House restaurant delivery'),
        'pizza house',
        'Noise tokens removed'
      );
    });
  });

  describe('jaccardTokenOverlap', () => {
    it('returns 1 when token sets are identical', () => {
      assert.strictEqual(jaccardTokenOverlap('pizza house', 'pizza house'), 1);
    });

    it('returns 0 when no overlap', () => {
      assert.strictEqual(jaccardTokenOverlap('pizza house', 'sushi bar'), 0);
    });

    it('returns Jaccard |A∩B|/|A∪B| for partial overlap', () => {
      const score = jaccardTokenOverlap('pizza house', 'pizza');
      assert.ok(score >= NAME_SCORE_MIN_THRESHOLD, `Score ${score} should be >= 0.35`);
      assert.ok(score < 1, 'Partial overlap < 1');
    });

    it('correct-ish name passes threshold (name_score_too_low fix)', () => {
      const googleNorm = normalizeNameForVerifier('Pizza House');
      const candidateNorm = normalizeNameForVerifier('pizza-house-tel-aviv');
      const score = jaccardTokenOverlap(googleNorm, candidateNorm);
      assert.ok(
        score >= NAME_SCORE_MIN_THRESHOLD,
        `Normalized "Pizza House" vs "pizza-house-tel-aviv" should score >= 0.35, got ${score}`
      );
    });

    it('Hebrew vs Latin transliteration: קלארו vs claro yields score > 0', () => {
      const googleNorm = normalizeNameForVerifier('קלארו');
      const candidateNorm = normalizeNameForVerifier('claro');
      const score = jaccardTokenOverlap(googleNorm, candidateNorm);
      assert.ok(score > 0, `קלארו vs claro should score > 0 via transliteration, got ${score}`);
    });

    it('Hebrew/English mixed: Mashya vs משייה | Mashya yields score > 0 (overlapping token)', () => {
      const googleNorm = normalizeNameForVerifier('Mashya');
      const candidateNorm = normalizeNameForVerifier('משייה | Mashya');
      const score = jaccardTokenOverlap(googleNorm, candidateNorm);
      assert.ok(score > 0, `Mashya vs משייה | Mashya should score > 0 when overlapping token exists, got ${score}`);
    });

    it('exact Hebrew match: חדר פרטי vs חדר פרטי yields 1', () => {
      const googleNorm = normalizeNameForVerifier('חדר פרטי');
      const candidateNorm = normalizeNameForVerifier('חדר פרטי');
      const score = jaccardTokenOverlap(googleNorm, candidateNorm);
      assert.strictEqual(score, 1, 'Exact Hebrew name should score 1');
    });
  });

  describe('toCanonicalCity', () => {
    it('maps HE/EN variants to same canonical (city_mismatch fix)', () => {
      const expected = 'tel_aviv';
      assert.strictEqual(toCanonicalCity('ת״א'), expected);
      assert.strictEqual(toCanonicalCity('תל אביב'), expected);
      assert.strictEqual(toCanonicalCity('תל-אביב'), expected);
      assert.strictEqual(toCanonicalCity('Tel Aviv'), expected);
      assert.strictEqual(toCanonicalCity('Tel-Aviv'), expected);
    });

    it('returns null for empty or unknown city', () => {
      assert.strictEqual(toCanonicalCity(null), null);
      assert.strictEqual(toCanonicalCity(''), null);
      assert.strictEqual(toCanonicalCity('  '), null);
      assert.strictEqual(toCanonicalCity('Unknown Village'), null);
    });

    it('maps Wolt-style slug to canonical', () => {
      assert.strictEqual(toCanonicalCity('tel-aviv'), 'tel_aviv');
      assert.strictEqual(toCanonicalCity('rishon-lezion'), 'rishon');
    });

    it('Tel Aviv alias: tlv => tel_aviv', () => {
      assert.strictEqual(toCanonicalCity('tlv'), 'tel_aviv');
      assert.strictEqual(toCanonicalCity('TLV'), 'tel_aviv');
    });
  });

  describe('passesVerifierNameCityRule', () => {
    it('accepts when score >= 0.65 and cityMatch', () => {
      assert.strictEqual(passesVerifierNameCityRule(0.65, true), true);
      assert.strictEqual(passesVerifierNameCityRule(0.8, true), true);
      assert.strictEqual(passesVerifierNameCityRule(0.64, true), false);
    });

    it('rejects when cityMatch is false (even with high score unless >= 0.80 with cityMatch)', () => {
      assert.strictEqual(passesVerifierNameCityRule(0.8, false), false);
      assert.strictEqual(passesVerifierNameCityRule(0.65, false), false);
    });
  });

  describe('safeDecodePath', () => {
    it('decodes percent-encoded Hebrew path', () => {
      const raw = '/next/restaurants/menu/delivery/42084/%D7%A4%D7%99%D7%A6%D7%94-%D7%A0%D7%99%D7%A0%D7%92%D7%94';
      const decoded = safeDecodePath(raw);
      assert.ok(decoded.includes('פיצה'), 'Decoded path should contain Hebrew פיצה');
      assert.ok(decoded.includes('נינג'), 'Decoded path should contain Hebrew נינג');
    });

    it('returns raw path on decode error', () => {
      const invalid = '/path/%XX';
      assert.strictEqual(safeDecodePath(invalid), invalid);
    });
  });

  describe('slugTokenMatch', () => {
    it('returns true when url name contains at least 2 distinct tokens from restaurant name', () => {
      const restNorm = normalizeNameForVerifier("פיצה נינג'ה גדרה");
      const urlNorm = normalizeNameForVerifier('פיצה נינגה ninja pizza');
      assert.strictEqual(slugTokenMatch(restNorm, urlNorm), true, 'פיצה+נינגה/גדרה vs slug with פיצה נינגה ninja pizza');
    });

    it('returns false when fewer than 2 tokens match', () => {
      const restNorm = normalizeNameForVerifier('Pizza House');
      const urlNorm = normalizeNameForVerifier('sushi bar');
      assert.strictEqual(slugTokenMatch(restNorm, urlNorm), false);
    });

    it('Hebrew name vs Latin slug: מסעדת פאסטל vs pastella => true (transliteration substring)', () => {
      const restNorm = normalizeNameForVerifier('מסעדת פאסטל');
      const urlNorm = normalizeNameForVerifier('pastella');
      assert.strictEqual(slugTokenMatch(restNorm, urlNorm), true, 'פאסטל transliterates to pastl, substring of pastella');
    });
  });

  describe('tokensFromNormalized', () => {
    it('splits by space and keeps all non-empty tokens (Hebrew + Latin)', () => {
      assert.deepStrictEqual(tokensFromNormalized('pizza house tel aviv'), ['pizza', 'house', 'tel', 'aviv']);
      assert.deepStrictEqual(tokensFromNormalized('א ב'), ['א', 'ב'], 'Short/Hebrew tokens kept for name scoring');
    });
  });

  describe('normalizeName', () => {
    it('aliases normalizeNameForVerifier (lower, trim, strip diacritics)', () => {
      assert.strictEqual(normalizeName('  Café Résumé  '), normalizeNameForVerifier('  Café Résumé  '));
      assert.strictEqual(normalizeName('Pizza House'), 'pizza house');
    });
  });

  describe('scoreNameCandidate', () => {
    it('title/snippet contains restaurant name => primaryMatch true, nameScore >= threshold', () => {
      const r = scoreNameCandidate(
        { title: 'Pizza House', snippet: null, pathSlug: null },
        'Pizza House'
      );
      assert.strictEqual(r.primaryMatch, true, 'Title has token from restaurant name');
      assert.ok(r.nameScore >= NAME_SCORE_VERIFIED_THRESHOLD, `nameScore ${r.nameScore} >= 0.65`);
      assert.ok(r.usedFields.includes('title'));
    });

    it('slug-only (no title/snippet) => path used as primary, nameScore > 0 when path matches', () => {
      const r = scoreNameCandidate(
        { title: null, snippet: null, pathSlug: 'pizza-house-tel-aviv' },
        'Pizza House'
      );
      assert.strictEqual(r.primaryMatch, true, 'Path is used as primary when title/snippet empty');
      assert.ok(r.nameScore > 0, 'Slug matching restaurant name yields non-zero score');
      assert.ok(r.usedFields.includes('path'));
    });

    it('slug-only with no token overlap => nameScore 0', () => {
      const r = scoreNameCandidate(
        { title: null, snippet: null, pathSlug: 'sushi-bar' },
        'Pizza House'
      );
      assert.strictEqual(r.primaryMatch, false);
      assert.strictEqual(r.nameScore, 0);
    });

    it('Hebrew name vs English in title (alias/translit) => primaryMatch and score >= threshold', () => {
      const r = scoreNameCandidate(
        { title: 'Pastella - Italian Restaurant | Wolt', snippet: 'Order from Pastella in Tel Aviv', pathSlug: 'pastella' },
        'מסעדת פאסטל'
      );
      assert.strictEqual(r.primaryMatch, true, 'Title/snippet has Pastella vs פאסטל');
      assert.ok(r.nameScore >= NAME_SCORE_VERIFIED_THRESHOLD, `nameScore ${r.nameScore} >= 0.65`);
    });

    it('candidate title with restaurant name only => primaryMatch and score >= threshold', () => {
      const r = scoreNameCandidate(
        { title: 'Cafe Cafe', snippet: null, pathSlug: 'cafe-cafe' },
        'Cafe Cafe'
      );
      assert.strictEqual(r.primaryMatch, true);
      assert.ok(r.nameScore >= NAME_SCORE_VERIFIED_THRESHOLD);
    });
  });

  describe('scoreCityCandidate', () => {
    it('city in title/snippet (match) => 1', () => {
      const s = scoreCityCandidate({ title: 'Pizza House - Tel Aviv', snippet: null }, 'Tel Aviv');
      assert.strictEqual(s, 1, 'Tel Aviv in title => 1');
    });

    it('no city in title/snippet => 0.6 (unknown)', () => {
      const s = scoreCityCandidate({ title: 'Pizza House', snippet: 'Order delivery' }, 'Tel Aviv');
      assert.strictEqual(s, 0.6, 'No city text => 0.6');
    });

    it('city mismatch (Ramat Gan in candidate vs Tel Aviv) => 0', () => {
      const s = scoreCityCandidate(
        { title: 'Pizza House - Ramat Gan', snippet: null },
        'Tel Aviv'
      );
      assert.strictEqual(s, 0, 'Different city => 0');
    });

    it('cityScore >= CITY_SCORE_MIN_THRESHOLD when match or unknown', () => {
      assert.ok(scoreCityCandidate({ title: 'Pizza - Tel Aviv', snippet: null }, 'Tel Aviv') >= CITY_SCORE_MIN_THRESHOLD);
      assert.ok(scoreCityCandidate({ title: 'Pizza', snippet: null }, 'Tel Aviv') >= CITY_SCORE_MIN_THRESHOLD);
      assert.strictEqual(scoreCityCandidate({ title: 'Pizza - Ramat Gan', snippet: null }, 'Tel Aviv') >= CITY_SCORE_MIN_THRESHOLD, false);
    });

    it('Tel Aviv alias: toCanonicalCity maps TLV and ת״א to tel_aviv', () => {
      assert.strictEqual(toCanonicalCity('TLV'), 'tel_aviv');
      assert.strictEqual(toCanonicalCity('ת״א'), 'tel_aviv');
    });
  });
});
