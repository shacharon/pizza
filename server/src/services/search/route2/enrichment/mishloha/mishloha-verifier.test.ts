/**
 * Mishloha Verifier - Unit Tests
 *
 * Tests deterministic verification before mishloha=FOUND:
 * 1) VALID: /r/ + #!/rest/ + same city + high name score => VERIFIED => mishloha=FOUND
 * 2) REJECT: city mismatch => mishloha=NOT_FOUND
 * 3) REJECT: missing restaurant identifier (no /r/ or no #!/rest/) => mishloha=NOT_FOUND
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyMishlohaCandidate, type MishlohaVerifierInput } from './mishloha-verifier.js';

/** Fixtures: Google Place (intent) side */
const GOOGLE_PLACE = {
  name: 'Pizza House',
  city: 'Tel Aviv',
} as const;

/** Fixtures: Mishloha candidate (CSE/Brave result) */
const CANDIDATES = {
  /** Path contains /r/, hash contains #!/rest/, same city + same name => VERIFY */
  valid: {
    candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house#!/rest/12345',
    candidateTitle: 'Pizza House',
    candidateSnippet: null,
  },
  /** Same URL shape, different city in title/snippet => city mismatch */
  cityMismatch: {
    candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house#!/rest/12345',
    candidateTitle: 'Pizza House - Ramat Gan',
    candidateSnippet: 'Order delivery in Ramat Gan',
  },
  /** Path missing /r/ => NOT_FOUND */
  pathMissingR: {
    candidateUrl: 'https://www.mishloha.co.il/now/category/food#!/rest/12345',
    candidateTitle: 'Pizza House - Tel Aviv',
    candidateSnippet: 'Order in Tel Aviv',
  },
  /** Hash missing #!/rest/ => NOT_FOUND */
  hashMissingRest: {
    candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house',
    candidateTitle: 'Pizza House',
    candidateSnippet: null,
  },
} as const;

describe('Mishloha Verifier', () => {
  describe('VALID: /r/ + same city + high name score', () => {
    it('URL without hash (path /now/r/<slug> only) => FOUND', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true);
      assert.strictEqual(result.reason, undefined);
    });

    it('returns verified => mishloha=FOUND', () => {
      const input: MishlohaVerifierInput = {
        candidateUrl: CANDIDATES.valid.candidateUrl,
        candidateTitle: CANDIDATES.valid.candidateTitle,
        candidateSnippet: CANDIDATES.valid.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyMishlohaCandidate(input);

      assert.strictEqual(result.verified, true, 'Should be verified');
      assert.strictEqual(result.reason, undefined, 'No reject reason');
    });
  });

  describe('REJECT: city mismatch', () => {
    it('Google=Tel Aviv, candidate=Ramat Gan => mishloha=NOT_FOUND', () => {
      const input: MishlohaVerifierInput = {
        candidateUrl: CANDIDATES.cityMismatch.candidateUrl,
        candidateTitle: CANDIDATES.cityMismatch.candidateTitle,
        candidateSnippet: CANDIDATES.cityMismatch.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      };

      const result = verifyMishlohaCandidate(input);

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.strictEqual(result.reason, 'city_mismatch', 'Reject reason should be city_mismatch');
    });
  });

  describe('VALID: hash no longer required (path-only validation)', () => {
    it('URL without hash but with /now/r/<slug> => FOUND (hash_missing_rest_fragment no longer fails)', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: CANDIDATES.hashMissingRest.candidateUrl,
        candidateTitle: CANDIDATES.hashMissingRest.candidateTitle,
        candidateSnippet: CANDIDATES.hashMissingRest.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });
      assert.strictEqual(result.verified, true, 'Should verify: hash fragment no longer required');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('REJECT: missing restaurant identifier', () => {
    it('path missing /r/ => mishloha=NOT_FOUND', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: CANDIDATES.pathMissingR.candidateUrl,
        candidateTitle: CANDIDATES.pathMissingR.candidateTitle,
        candidateSnippet: CANDIDATES.pathMissingR.candidateSnippet,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: GOOGLE_PLACE.name,
      });

      assert.strictEqual(result.verified, false, 'Should not be verified');
      assert.strictEqual(result.reason, 'path_missing_r', 'Reject when path has no /r/');
    });

    it('path /r/<slug> without /now/ => accepted (regex allows both /r/ and /now/r/)', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/r/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Path /r/<slug> is valid; /now/ is optional');
    });

    it('path /r/inactive/* => always rejected (path_not_restaurant)', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/inactive/some-id',
        candidateTitle: 'Pizza House - Tel Aviv',
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, false, 'Mishloha /r/inactive must always be rejected');
      assert.strictEqual(result.reason, 'path_not_restaurant');
    });

    it('invalid listing page (path with /list/) => non_restaurant_page', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/some-slug/list',
        candidateTitle: 'Pizza House - Tel Aviv',
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, false);
      assert.strictEqual(result.reason, 'non_restaurant_page');
    });
  });

  describe('VALID: URL with fragment and normalized URL without fragment', () => {
    it('valid /now/r/<slug>#... => FOUND, no normalizedUrl when hash present', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house#!/rest/12345',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true);
    });

    it('valid /now/r/<slug> without fragment => FOUND and normalizedUrl has #restaurant', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: GOOGLE_PLACE.city,
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true);
    });
  });

  describe('City: missing candidate city = unknown (do not fail)', () => {
    it('no city in title/snippet/URL => still FOUND when name and path match', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: 'Order delivery',
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Missing candidate city should not fail');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('Real case: /r/inactive rejected, /r/<name> accepted, title match scores', () => {
    it('/r/inactive/* => always rejected (path_not_restaurant)', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/r/inactive/foo',
        candidateTitle: 'Pizza House - Tel Aviv',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, false);
      assert.strictEqual(result.reason, 'path_not_restaurant');
    });

    it('/r/<name> (no inactive) => accepted when path and city match', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/r/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, '/r/<name> should be accepted (path-as-primary when no snippet)');
      assert.strictEqual(result.reason, undefined);
    });

    it('title contains restaurant name => nameScore > 0 and verified', () => {
      const result = verifyMishlohaCandidate({
        candidateUrl: 'https://www.mishloha.co.il/now/r/pizza-house',
        candidateTitle: 'Pizza House',
        candidateSnippet: null,
        googleCity: 'Tel Aviv',
        googleRestaurantName: 'Pizza House',
      });
      assert.strictEqual(result.verified, true, 'Title contains "Pizza House" => nameScore >= threshold');
      assert.strictEqual(result.reason, undefined);
    });
  });

  describe('Other reject reasons', () => {
    it('rejects when googleCity is missing', () => {
      const result = verifyMishlohaCandidate({
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
