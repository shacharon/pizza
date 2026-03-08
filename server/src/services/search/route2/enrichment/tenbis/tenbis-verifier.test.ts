/**
 * 10bis Verifier - Unit Tests
 *
 * Tests deterministic verification before tenbis=FOUND:
 * 1) VALID: correct path + same city + high name score => VERIFIED => tenbis=FOUND
 * 2) REJECT: path invalid (missing /menu/ or not under /restaurants/) => tenbis=NOT_FOUND
 * 3) REJECT: city mismatch => tenbis=NOT_FOUND
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyTenbisCandidate, type TenbisVerifierInput } from './tenbis-verifier.js';

/** Fixtures: Google Place (intent) side */
const GOOGLE_PLACE = {
  name: 'Pizza House',
  city: 'Tel Aviv',
} as const;

/** Fixtures: 10bis candidate (CSE/Brave result) */
const CANDIDATES = {
  /** Correct path (/next/ + /restaurants/ + /menu/) + same city + same name => VERIFY */
  valid: {
    candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/19288/pizza-house',
    candidateTitle: 'Pizza House',
    candidateSnippet: null,
  },
  /** Path missing /menu/ => NOT_FOUND */
  pathMissingMenu: {
    candidateUrl: 'https://www.10bis.co.il/next/restaurants/delivery/19288/pizza-house',
    candidateTitle: 'Pizza House - Tel Aviv',
    candidateSnippet: 'Order delivery in Tel Aviv',
  },
  /** Path not under /restaurants/ (e.g. category page) => NOT_FOUND */
  pathNotRestaurants: {
    candidateUrl: 'https://www.10bis.co.il/next/category/food/pizza-house',
    candidateTitle: 'Pizza House - Tel Aviv',
    candidateSnippet: 'Order in Tel Aviv',
  },
  /** Same name, different city => city mismatch => NOT_FOUND */
  cityMismatch: {
    candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/19288/pizza-house',
    candidateTitle: 'Pizza House - Ramat Gan',
    candidateSnippet: 'Order delivery in Ramat Gan',
  },
} as const;

describe('10bis Verifier', () => {
  describe('VALID: correct path + same city + high name score', () => {
    it('returns verified => tenbis=FOUND', () => {
      const input: TenbisVerifierInput = {
        candidateUrl: CANDIDATES.valid.candidateUrl,
        candidateTitle: CANDIDATES.valid.candidateTitle,
        candidateSnippet: CANDIDATES.valid.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyTenbisCandidate(input);

      assert.strictEqual(result.verified, true, 'Should be verified');
      assert.strictEqual(result.reason, undefined, 'No reject reason');
    });
  });

  describe('VALID: candidate_city_missing ACCEPT when job.cityText exists', () => {
    it('accepts when path matches /next/restaurants/menu/delivery/<id>/ and name matches, no city in candidate', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/19288/pizza-house',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });

      assert.strictEqual(result.verified, true, 'Should accept: job has cityText, candidate has no city in URL/title/snippet');
      assert.strictEqual(result.reason, undefined);
    });

    it('accepts when path and slug match, title/snippet omitted (Brave flow)', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: CANDIDATES.valid.candidateUrl,
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });

      assert.strictEqual(result.verified, true, 'Should accept: job.cityText exists, candidate city not required');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('REJECT: path invalid', () => {
    it('missing /menu/ => tenbis=NOT_FOUND', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: CANDIDATES.pathMissingMenu.candidateUrl,
        candidateTitle: CANDIDATES.pathMissingMenu.candidateTitle,
        candidateSnippet: CANDIDATES.pathMissingMenu.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.strictEqual(
        result.reason,
        'path_must_match_delivery_menu',
        'Reject when path does not match /next/restaurants/menu/delivery/<id>/'
      );
    });

    it('path not under /restaurants/ (no /restaurants/, no /menu/) => tenbis=NOT_FOUND', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: CANDIDATES.pathNotRestaurants.candidateUrl,
        candidateTitle: CANDIDATES.pathNotRestaurants.candidateTitle,
        candidateSnippet: CANDIDATES.pathNotRestaurants.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.strictEqual(
        result.reason,
        'path_must_match_delivery_menu',
        'Path without /next/restaurants/menu/delivery/<id>/ is rejected'
      );
    });

    it('accepts /next/en/restaurants/menu/delivery/<id>/<slug> (locale variant)', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/en/restaurants/menu/delivery/12345/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, '/next/en/... path should be accepted');
      assert.strictEqual(result.reason, undefined);
    });

    it('non-restaurant page (/search in path) => tenbis=NOT_FOUND', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/search?q=pizza',
        candidateTitle: 'Pizza House - Tel Aviv',
        candidateSnippet: 'Order in Tel Aviv',
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });

      assert.strictEqual(result.verified, false);
      assert.strictEqual(result.reason, 'path_must_match_delivery_menu');
    });
  });

  describe('REJECT: city mismatch', () => {
    it('Google=Tel Aviv, candidate=Ramat Gan => tenbis=NOT_FOUND', () => {
      const input: TenbisVerifierInput = {
        candidateUrl: CANDIDATES.cityMismatch.candidateUrl,
        candidateTitle: CANDIDATES.cityMismatch.candidateTitle,
        candidateSnippet: CANDIDATES.cityMismatch.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyTenbisCandidate(input);

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.strictEqual(result.reason, 'city_mismatch', 'Reject reason should be city_mismatch');
    });
  });

  describe('Name score: title/snippet primary, path secondary', () => {
    it('same name in title and slug => verified', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/12345/cafe-cafe',
        candidateTitle: 'Cafe Cafe - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Cafe Cafe',
      });

      assert.strictEqual(result.verified, true, 'Title has name => primary match => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('clear match: Pizza House in title vs pizza-house slug => verified', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/19288/pizza-house',
        candidateTitle: 'Pizza House - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });

      assert.strictEqual(result.verified, true, 'Title has name => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('slug-only (no title/snippet) with matching path => PASS (path-as-primary)', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/19288/pizza-house',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Path pizza-house matches Pizza House => path-as-primary => verified');
      assert.strictEqual(result.reason, undefined);
    });

    it('10bis menu URL with Hebrew tail segment (path-as-primary)', () => {
      const result = verifyTenbisCandidate({
        candidateUrl:
          'https://www.10bis.co.il/next/restaurants/menu/delivery/42084/%D7%A4%D7%99%D7%A6%D7%94-%D7%A0%D7%99%D7%A0%D7%92%D7%94--ninja-pizza',
        candidateTitle: null,
        candidateSnippet: null,
        googleCity: 'גדרה',
        googleRestaurantName: "פיצה נינג'ה גדרה",
      });
      assert.strictEqual(result.verified, true, 'Decoded path has פיצה נינגה ninja pizza => matches restaurant');
      assert.strictEqual(result.reason, undefined);
    });

    it('Google name with pipes/English/Hebrew vs 10bis title => normalized overlap passes threshold', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/99999/mashya',
        candidateTitle: 'משייה | Mashya - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'משייה | Mashya',
      });
      assert.strictEqual(result.verified, true, 'משייה | Mashya both sides => full token overlap');
      assert.strictEqual(result.reason, undefined);
    });

    it('פיצה נינג\'ה גדרה: title has name => verified', () => {
      const result = verifyTenbisCandidate({
        candidateUrl:
          'https://www.10bis.co.il/next/restaurants/menu/delivery/42084/%D7%A4%D7%99%D7%A6%D7%94-%D7%A0%D7%99%D7%A0%D7%92%D7%94--ninja-pizza',
        candidateTitle: "פיצה נינג'ה גדרה - גדרה",
        candidateSnippet: null,
        googleCity: 'גדרה',
        googleRestaurantName: "פיצה נינג'ה גדרה",
      });
      assert.strictEqual(result.verified, true, 'Title has restaurant name => primary match');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('Real case: Hebrew name in path (טאיזו)', () => {
    it('restaurantName=טאיזו with title containing name => verified', () => {
      const result = verifyTenbisCandidate({
        candidateUrl: 'https://www.10bis.co.il/next/restaurants/menu/delivery/12345/%D7%98%D7%90%D7%99%D7%96%D7%95',
        candidateTitle: 'טאיזו - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'טאיזו',
      });
      assert.strictEqual(result.verified, true, 'Title has טאיזו => verified');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('Other reject reasons', () => {
    it('rejects when googleCity is missing', () => {
      const result = verifyTenbisCandidate({
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
});
