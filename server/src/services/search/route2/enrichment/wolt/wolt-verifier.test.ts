/**
 * Wolt Verifier - Unit Tests
 *
 * Tests deterministic verification before wolt=FOUND:
 * 1) VALID: same city + high name score + /restaurant/ path => VERIFIED => wolt=FOUND
 * 2) REJECT: city mismatch (Google=Tel Aviv, candidate=Ramat Gan) => wolt=NOT_FOUND
 * 3) REJECT: name mismatch (low score) => wolt=NOT_FOUND
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyWoltCandidate, type WoltVerifierInput } from './wolt-verifier.js';

/** Fixtures: Google Place (intent) side */
const GOOGLE_PLACE = {
  name: 'Pizza House',
  city: 'Tel Aviv',
} as const;

/** Fixtures: Wolt candidate (CSE/Brave result) */
const CANDIDATES = {
  /** Same city + same name + /restaurant/ path => should VERIFY */
  valid: {
    candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
    candidateTitle: 'Pizza House - Tel Aviv',
    candidateSnippet: 'Order delivery in Tel Aviv',
  },
  /** Candidate in Ramat Gan => city mismatch => NOT_FOUND */
  cityMismatch: {
    candidateUrl: 'https://wolt.com/en/isr/ramat-gan/restaurant/pizza-house',
    candidateTitle: 'Pizza House - Ramat Gan',
    candidateSnippet: 'Order delivery in Ramat Gan',
  },
  /** Different restaurant name => low name score => NOT_FOUND */
  nameMismatch: {
    candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/sushi-place',
    candidateTitle: 'Sushi Place - Tel Aviv',
    candidateSnippet: 'Sushi delivery in Tel Aviv',
  },
} as const;

describe('Wolt Verifier', () => {
  describe('VALID: same city + high name score + /restaurant/ path', () => {
    it('returns verified => wolt=FOUND', () => {
      const input: WoltVerifierInput = {
        candidateUrl: CANDIDATES.valid.candidateUrl,
        candidateTitle: CANDIDATES.valid.candidateTitle,
        candidateSnippet: CANDIDATES.valid.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyWoltCandidate(input);

      assert.strictEqual(result.verified, true, 'Should be verified');
      assert.strictEqual(result.reason, undefined, 'No reject reason');
    });

    it('verifies when city comes from URL only (no title/snippet city)', () => {
      const input: WoltVerifierInput = {
        candidateUrl: CANDIDATES.valid.candidateUrl,
        candidateTitle: 'Pizza House',
        candidateSnippet: 'Order now',
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyWoltCandidate(input);

      assert.strictEqual(result.verified, true, 'City from URL path should match');
    });

    it('cityText=תל אביב + url contains /tel-aviv/ => ACCEPT when title has name (primary match)', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/halevantini',
        candidateTitle: 'Halevantini - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'תל אביב',
        googleRestaurantName: 'Halevantini',
      });

      assert.strictEqual(result.verified, true, 'Title has restaurant name => primary match');
      assert.strictEqual(result.reason, undefined);
    });

    it('Wolt תל אביב מול /tel-aviv/ מתקבל when title has name', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/he/isr/tel-aviv/restaurant/pizza-place',
        candidateTitle: 'Pizza Place - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'תל אביב',
        googleRestaurantName: 'Pizza Place',
      });

      assert.strictEqual(result.verified, true, 'Title has restaurant name => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('cityText=ראשון לציון + url area slug => ACCEPT when title has name', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/rishon-lezion-hashfela-area/restaurant/some-place',
        candidateTitle: 'Some Place - Rishon',
        candidateSnippet: null,
        googleCity: 'ראשון לציון',
        googleRestaurantName: 'Some Place',
      });

      assert.strictEqual(result.verified, true, 'Title has restaurant name => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('city canonicalization: ת״א / תל אביב / Tel-Aviv all match same canonical (no city_mismatch)', () => {
      const url = 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house';
      for (const city of ['ת״א', 'תל אביב', 'תל-אביב', 'Tel Aviv', 'Tel-Aviv']) {
        const result = verifyWoltCandidate({
          candidateUrl: url,
          candidateTitle: 'Pizza House',
          candidateSnippet: null,
          googleCity: city,
          googleRestaurantName: 'Pizza House',
        });
        assert.strictEqual(result.verified, true, `City variant "${city}" should match tel_aviv`);
        assert.strictEqual(result.reason, undefined);
      }
    });

    it('path with /restaurant/ passes (verifier only requires /restaurant/ or /venue/; /isr/ not required)', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/restaurant/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Path has /restaurant/ and name matches');
    });

    it('name_score: correct-ish name passes after normalization (Jaccard >= 0.35)', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house-tel-aviv',
        candidateTitle: 'Pizza House | Wolt',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Pizza House vs pizza-house-tel-aviv / brand suffix should pass');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('REJECT: city mismatch', () => {
    it('Google=Tel Aviv, candidate=Ramat Gan => wolt=NOT_FOUND', () => {
      const input: WoltVerifierInput = {
        candidateUrl: CANDIDATES.cityMismatch.candidateUrl,
        candidateTitle: CANDIDATES.cityMismatch.candidateTitle,
        candidateSnippet: CANDIDATES.cityMismatch.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyWoltCandidate(input);

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.strictEqual(result.reason, 'city_mismatch', 'Reject reason should be city_mismatch');
    });
  });

  describe('REJECT: name mismatch (low score)', () => {
    it('different restaurant name => low name score => wolt=NOT_FOUND', () => {
      const input: WoltVerifierInput = {
        candidateUrl: CANDIDATES.nameMismatch.candidateUrl,
        candidateTitle: CANDIDATES.nameMismatch.candidateTitle,
        candidateSnippet: CANDIDATES.nameMismatch.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyWoltCandidate(input);

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.ok(
        result.reason?.startsWith('name_score_too_low:'),
        `Reject reason should be name_score_too_low, got: ${result.reason}`
      );
    });
  });

  describe('Golden: Brave-style correct-ish link => FOUND', () => {
    it('Brave returns Wolt link with slug + city variant (same script) => verified', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
        candidateTitle: 'Pizza House - מסעדה איטלקית | Wolt',
        candidateSnippet: 'Order delivery in Tel Aviv',
        googleCity: 'תל אביב',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Correct-ish Brave link should become FOUND');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('Other reject reasons', () => {
    it('accepts /venue/ path (venue treated as restaurant page)', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/venue/pizza-house',
        candidateTitle: 'Pizza House - Tel Aviv',
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });
      assert.strictEqual(result.verified, true, '/venue/ path should be accepted like /restaurant/');
      assert.strictEqual(result.reason, undefined);
    });

    it('rejects when googleCity is missing', () => {
      const result = verifyWoltCandidate({
        candidateUrl: CANDIDATES.valid.candidateUrl,
        candidateTitle: CANDIDATES.valid.candidateTitle,
        candidateSnippet: CANDIDATES.valid.candidateSnippet,
        googleCity: null,
        googleRestaurantName: GOOGLE_PLACE.name,
      });

      assert.strictEqual(result.verified, false);
      assert.strictEqual(result.reason, 'google_city_missing');
    });
  });

  describe('No undefined reference (e.g. googleCityToWoltSlug)', () => {
    it('verifier runs with googleCity and does not throw ReferenceError', () => {
      assert.doesNotThrow(() => {
        const result = verifyWoltCandidate({
          candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pizza-house',
          candidateTitle: 'Pizza House - Tel Aviv',
          candidateSnippet: null,
          googleCity: 'Tel Aviv',
          googleRestaurantName: 'Pizza House',
        });
        assert.strictEqual(result.verified, true);
      }, 'Verifier must use toCanonicalCity only; no googleCityToWoltSlug');
    });
  });

  describe('Title/snippet primary; path secondary only', () => {
    it('Hebrew name vs English slug: PASS when title/snippet has match', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pastella',
        candidateTitle: 'Pastella - Italian Restaurant | Wolt',
        candidateSnippet: 'Order from Pastella in Tel Aviv',
        googleCity: 'תל אביב',
        googleRestaurantName: 'מסעדת פאסטל',
      });
      assert.strictEqual(result.verified, true, 'Title/snippet contain Pastella => primary match => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('Slug-only with matching path => PASS (path-as-primary)', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pastella',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'תל אביב',
        googleRestaurantName: 'מסעדת פאסטל',
      });
      assert.strictEqual(result.verified, true, 'Path pastella matches פאסטל => path-as-primary => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('False positive slug-only: FAIL when path does not match restaurant name', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/pastella',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Sushi Bar',
      });
      assert.strictEqual(result.verified, false);
      assert.ok(result.reason?.startsWith('name_score_too_low'), result.reason);
    });

    it('Tel Aviv vs city mismatch (candidate city different) => FAIL', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/ramat-gan/restaurant/pizza-house',
        candidateTitle: 'Pizza House - Ramat Gan',
        candidateSnippet: 'Order in Ramat Gan',
        googleCity: 'תל אביב',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, false);
      assert.strictEqual(result.reason, 'city_mismatch');
    });
  });

  describe('Bilingual and transliteration', () => {
    it('"משייה | Mashya" matches Wolt /restaurant/mashya', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/mashya',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'משייה | Mashya',
      });
      assert.strictEqual(result.verified, true, 'Bilingual name: path mashya matches Mashya variant');
      assert.strictEqual(result.reason, undefined);
    });

    it('"משייה | Mashya" matches Wolt /restaurant/meshya (transliteration variant)', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/meshya',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'משייה | Mashya',
      });
      assert.strictEqual(result.verified, true, 'Path meshya matches משייה transliteration');
      assert.strictEqual(result.reason, undefined);
    });

    it('"פופינה" matches /restaurant/popina', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/popina',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'פופינה',
      });
      assert.strictEqual(result.verified, true, 'פופינה transliterates to popina');
      assert.strictEqual(result.reason, undefined);
    });

    it('יפו-תל אביב style name matches candidate with hyphen/slug', () => {
      const result = verifyWoltCandidate({
        candidateUrl: 'https://wolt.com/en/isr/tel-aviv/restaurant/cafe-yafo',
        candidateTitle: 'Cafe Yafo',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'קפה יפו תל אביב',
      });
      assert.strictEqual(result.verified, true, 'Aliases יפו/yafo, קפה/cafe; path and title match');
      assert.strictEqual(result.reason, undefined);
    });
  });
});
