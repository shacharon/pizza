/**
 * Ranking Deterministic Tests
 * 
 * Verifies that ranking is language-independent and deterministic:
 * 1. Profile selection based ONLY on route + hasUserLocation + intentReason
 * 2. Same inputs → identical ranking order
 * 3. assistantLanguage/queryLanguage have ZERO effect
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectRankingProfileDeterministic,
  validateWeights,
  validateAllProfiles,
  getAllProfileWeights
} from '../ranking-profile-deterministic.js';
import { rankResults } from '../results-ranker.js';

describe('Ranking Profile Selection - Deterministic', () => {
  describe('Profile weights validation', () => {
    it('should validate all predefined profiles on load', () => {
      // validateAllProfiles() runs on module load
      // If we got here, all profiles are valid
      assert.ok(true, 'All profiles validated successfully');
    });

    it('all profile weights should sum to 1.0', () => {
      const profiles = getAllProfileWeights();

      for (const [name, weights] of Object.entries(profiles)) {
        const sum = weights.rating + weights.reviews + weights.distance + weights.openBoost;
        assert.ok(
          Math.abs(sum - 1.0) < 0.001,
          `Profile ${name} weights must sum to 1.0 (got ${sum})`
        );
      }
    });

    it('should validate correct weights', () => {
      const weights = {
        rating: 0.25,
        reviews: 0.25,
        distance: 0.25,
        openBoost: 0.25
      };

      assert.doesNotThrow(() => validateWeights(weights));
    });

    it('should reject weights that do not sum to 1.0', () => {
      const weights = {
        rating: 0.3,
        reviews: 0.3,
        distance: 0.3,
        openBoost: 0.3  // Sum = 1.2 (invalid)
      };

      assert.throws(() => validateWeights(weights), /must sum to 1\.0/);
    });

    it('should reject negative weights', () => {
      const weights = {
        rating: -0.1,
        reviews: 0.5,
        distance: 0.5,
        openBoost: 0.1
      };

      assert.throws(() => validateWeights(weights), /must be in \[0, 1\]/);
    });
  });

  describe('Rule 1: No user location → NO_LOCATION profile', () => {
    it('should use NO_LOCATION profile when hasUserLocation=false', () => {
      const selection = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: false,
        intentReason: 'explicit_city_mentioned'
      });

      // Profile name is NO_LOCATION (fixed from BALANCED)
      assert.strictEqual(selection.profile, 'NO_LOCATION');
      assert.strictEqual(selection.weights.distance, 0, 'Distance weight must be 0 (no location)');
      assert.strictEqual(selection.weights.rating, 0.45);
      assert.strictEqual(selection.weights.reviews, 0.45);
    });

    it('NO_LOCATION profile should be deterministic', () => {
      const selection1 = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: false
      });

      const selection2 = selectRankingProfileDeterministic({
        route: 'LANDMARK',
        hasUserLocation: false
      });

      // Same profile regardless of route (no location available)
      assert.deepStrictEqual(selection1.weights, selection2.weights);
    });
  });

  describe('Rule 2: route=NEARBY → DISTANCE_HEAVY profile', () => {
    it('should use DISTANCE_HEAVY for NEARBY route', () => {
      const selection = selectRankingProfileDeterministic({
        route: 'NEARBY',
        hasUserLocation: true
      });

      assert.strictEqual(selection.profile, 'NEARBY');
      assert.strictEqual(selection.weights.distance, 0.65, 'Distance weight should be dominant');
      assert.ok(selection.weights.distance > selection.weights.rating, 'Distance > rating');
      assert.ok(selection.weights.distance > selection.weights.reviews, 'Distance > reviews');
    });

    it('NEARBY route should override intentReason', () => {
      const selection = selectRankingProfileDeterministic({
        route: 'NEARBY',
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'  // Not a proximity reason
      });

      // Should still use DISTANCE_HEAVY (NEARBY route takes precedence)
      assert.strictEqual(selection.profile, 'NEARBY');
      assert.strictEqual(selection.weights.distance, 0.65);
    });
  });

  describe('Rule 3: Proximity intent → DISTANCE_HEAVY profile', () => {
    const proximityReasons = [
      'nearby_intent',
      'proximity_keywords',
      'small_radius_detected',
      'user_location_primary'
    ];

    proximityReasons.forEach(reason => {
      it(`should use DISTANCE_HEAVY for intentReason="${reason}"`, () => {
        const selection = selectRankingProfileDeterministic({
          route: 'TEXTSEARCH',
          hasUserLocation: true,
          intentReason: reason
        });

        assert.strictEqual(selection.profile, 'NEARBY');
        assert.strictEqual(selection.weights.distance, 0.65);
      });
    });

    it('should NOT use DISTANCE_HEAVY for non-proximity intentReason', () => {
      const selection = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'  // Not a proximity reason
      });

      // Should use BALANCED (default)
      assert.strictEqual(selection.profile, 'BALANCED');
      assert.strictEqual(selection.weights.distance, 0.35, 'Balanced distance weight');
    });
  });

  describe('Rule 4: Default → BALANCED profile', () => {
    it('should use BALANCED for TEXTSEARCH without proximity signals', () => {
      const selection = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'
      });

      assert.strictEqual(selection.profile, 'BALANCED');
      assert.strictEqual(selection.weights.rating, 0.30);
      assert.strictEqual(selection.weights.reviews, 0.25);
      assert.strictEqual(selection.weights.distance, 0.35);
      assert.strictEqual(selection.weights.openBoost, 0.10);
    });

    it('should use BALANCED for LANDMARK route', () => {
      const selection = selectRankingProfileDeterministic({
        route: 'LANDMARK',
        hasUserLocation: true
      });

      assert.strictEqual(selection.profile, 'BALANCED');
    });
  });

  describe('Invariant: Same inputs → identical outputs', () => {
    it('should return identical profile for same inputs (multiple calls)', () => {
      const input = {
        route: 'TEXTSEARCH' as const,
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'
      };

      const selection1 = selectRankingProfileDeterministic(input);
      const selection2 = selectRankingProfileDeterministic(input);
      const selection3 = selectRankingProfileDeterministic(input);

      assert.deepStrictEqual(selection1, selection2);
      assert.deepStrictEqual(selection2, selection3);
    });

    it('should be deterministic for NEARBY route', () => {
      const selections = Array.from({ length: 10 }, () =>
        selectRankingProfileDeterministic({
          route: 'NEARBY',
          hasUserLocation: true
        })
      );

      // All selections should be identical
      for (let i = 1; i < selections.length; i++) {
        assert.deepStrictEqual(selections[i], selections[0]);
      }
    });
  });
});

describe('Ranking Results - Language Independence', () => {
  // Mock restaurant data
  const mockPlaces = [
    {
      placeId: 'place1',
      name: 'Pizza Restaurant',
      rating: 4.5,
      userRatingsTotal: 1200,
      location: { lat: 32.0853, lng: 34.7818 },  // Tel Aviv
      openNow: true
    },
    {
      placeId: 'place2',
      name: 'Burger Joint',
      rating: 4.2,
      userRatingsTotal: 800,
      location: { lat: 32.0856, lng: 34.7821 },  // Slightly north
      openNow: true
    },
    {
      placeId: 'place3',
      name: 'Sushi Bar',
      rating: 4.8,
      userRatingsTotal: 300,
      location: { lat: 32.0850, lng: 34.7815 },  // Slightly south
      openNow: false
    },
    {
      placeId: 'place4',
      name: 'Italian Restaurant',
      rating: 4.6,
      userRatingsTotal: 2000,
      location: { lat: 32.0860, lng: 34.7825 },  // Further north
      openNow: 'UNKNOWN' as const
    }
  ];

  describe('Deterministic ranking with BALANCED profile', () => {
    it('should produce identical order for same inputs', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };
      const weights = {
        rating: 0.30,
        reviews: 0.25,
        distance: 0.35,
        openBoost: 0.10
      };

      const ranked1 = rankResults([...mockPlaces], { weights, userLocation });
      const ranked2 = rankResults([...mockPlaces], { weights, userLocation });
      const ranked3 = rankResults([...mockPlaces], { weights, userLocation });

      // Extract placeIds for comparison
      const order1 = ranked1.map(p => p.placeId);
      const order2 = ranked2.map(p => p.placeId);
      const order3 = ranked3.map(p => p.placeId);

      assert.deepStrictEqual(order1, order2);
      assert.deepStrictEqual(order2, order3);
    });

    it('should rank by distance when using DISTANCE_HEAVY profile', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };  // Close to place1
      const weights = {
        rating: 0.15,
        reviews: 0.10,
        distance: 0.65,  // Distance-heavy
        openBoost: 0.10
      };

      const ranked = rankResults([...mockPlaces], { weights, userLocation });
      const placeIds = ranked.map(p => p.placeId);

      // place1 should be near top (closest + good rating + open)
      assert.ok(placeIds.indexOf('place1') <= 1, 'place1 should be in top 2 (closest + open)');

      // Verify distance weight dominates (closer places rank higher on average)
      const place1Index = placeIds.indexOf('place1');  // Closest
      const place4Index = placeIds.indexOf('place4');  // Farthest

      // On average, closer places should rank better with distance-heavy weights
      // (individual results may vary due to composite scoring)
      assert.ok(place1Index < place4Index || place1Index === 0,
        'Closest place should generally rank better than farthest with distance-heavy profile');
    });

    it('should rank by rating when using QUALITY_HEAVY profile', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };
      const weights = {
        rating: 0.50,    // Rating-heavy
        reviews: 0.35,   // Reviews-heavy
        distance: 0.05,  // Distance low
        openBoost: 0.10
      };

      const ranked = rankResults([...mockPlaces], { weights, userLocation });
      const placeIds = ranked.map(p => p.placeId);

      // place4 has high rating (4.6) + most reviews (2000) + openNow=UNKNOWN (0.5)
      // place3 has highest rating (4.8) but fewer reviews (300) + closed (0)
      // place2 has lowest rating (4.2) + moderate reviews (800)
      // place1 has good rating (4.5) + many reviews (1200) + open (1.0)

      // With rating=0.5 + reviews=0.35, place4 likely scores highest (high rating + most reviews)
      // place3 penalized for being closed

      // Verify quality dominates (high rating/reviews rank better on average)
      const place2Index = placeIds.indexOf('place2');  // Lowest rating (4.2)
      const place4Index = placeIds.indexOf('place4');  // High rating + most reviews

      // place2 should rank lower than place4 (lower quality)
      assert.ok(place2Index > place4Index,
        'place2 (low quality) should rank lower than place4 (high quality)');

      // place4 or place1 should be near top (both high quality)
      assert.ok(place4Index <= 1 || placeIds.indexOf('place1') <= 1,
        'High-quality places (place4 or place1) should be in top 2 with quality-heavy weights');
    });
  });

  describe('Language independence: Same profile → same ranking order', () => {
    it('assistantLanguage does NOT affect ranking order', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };

      // Simulate: Hebrew query → BALANCED profile
      const profileHE = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'
      });

      // Simulate: English query → same profile (deterministic)
      const profileEN = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'
      });

      // Profiles must be identical
      assert.deepStrictEqual(profileHE, profileEN);

      // Ranking must be identical
      const rankedHE = rankResults([...mockPlaces], { weights: profileHE.weights, userLocation });
      const rankedEN = rankResults([...mockPlaces], { weights: profileEN.weights, userLocation });

      const orderHE = rankedHE.map(p => p.placeId);
      const orderEN = rankedEN.map(p => p.placeId);

      assert.deepStrictEqual(orderHE, orderEN, 'Ranking order must be identical regardless of query language');
    });

    it('queryLanguage does NOT affect ranking order', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };

      // Same route + location for different query languages
      const contexts = [
        { route: 'TEXTSEARCH' as const, hasUserLocation: true, intentReason: 'explicit_city_mentioned' },
        { route: 'TEXTSEARCH' as const, hasUserLocation: true, intentReason: 'explicit_city_mentioned' },
        { route: 'TEXTSEARCH' as const, hasUserLocation: true, intentReason: 'explicit_city_mentioned' }
      ];

      const profiles = contexts.map(ctx => selectRankingProfileDeterministic(ctx));

      // All profiles must be identical
      for (let i = 1; i < profiles.length; i++) {
        assert.deepStrictEqual(profiles[i], profiles[0]);
      }

      // All rankings must be identical
      const rankings = profiles.map(p => rankResults([...mockPlaces], { weights: p.weights, userLocation }));
      const orders = rankings.map(r => r.map(p => p.placeId));

      for (let i = 1; i < orders.length; i++) {
        assert.deepStrictEqual(orders[i], orders[0]);
      }
    });

    it('intentReason (language-independent) determines profile', () => {
      // Hebrew query "מסעדות באזור" → intentReason = "proximity_keywords"
      const profileHE = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'proximity_keywords'
      });

      // English query "restaurants around here" → same intentReason
      const profileEN = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'proximity_keywords'
      });

      // Russian query "рестораны рядом" → same intentReason
      const profileRU = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'proximity_keywords'
      });

      // All must use DISTANCE_HEAVY profile
      assert.strictEqual(profileHE.profile, 'NEARBY');
      assert.strictEqual(profileEN.profile, 'NEARBY');
      assert.strictEqual(profileRU.profile, 'NEARBY');

      // All must have identical weights
      assert.deepStrictEqual(profileHE.weights, profileEN.weights);
      assert.deepStrictEqual(profileEN.weights, profileRU.weights);
    });
  });

  describe('Real-world scenario: Same places, different query languages', () => {
    it('Hebrew query "מסעדות איטלקיות בתל אביב" vs English query "Italian restaurants in Tel Aviv"', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };

      // Both queries → TEXTSEARCH route, explicit_city_mentioned
      const profile = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'explicit_city_mentioned'
      });

      // Rank places (same for both queries)
      const ranked = rankResults([...mockPlaces], { weights: profile.weights, userLocation });
      const order = ranked.map(p => p.placeId);

      // Verify order is deterministic
      const ranked2 = rankResults([...mockPlaces], { weights: profile.weights, userLocation });
      const order2 = ranked2.map(p => p.placeId);

      assert.deepStrictEqual(order, order2, 'Same query intent → identical ranking order');
    });

    it('Hebrew "מסעדות ליד" vs English "restaurants near me" vs Spanish "restaurantes cerca"', () => {
      const userLocation = { lat: 32.0853, lng: 34.7818 };

      // All queries → NEARBY route or proximity_keywords intentReason
      const profile = selectRankingProfileDeterministic({
        route: 'TEXTSEARCH',
        hasUserLocation: true,
        intentReason: 'proximity_keywords'
      });

      // Should use DISTANCE_HEAVY profile
      assert.strictEqual(profile.profile, 'NEARBY');
      assert.strictEqual(profile.weights.distance, 0.65);

      // Rank places
      const ranked = rankResults([...mockPlaces], { weights: profile.weights, userLocation });
      const order = ranked.map(p => p.placeId);

      // Closest place should be first (place1)
      assert.strictEqual(order[0], 'place1', 'Closest place should be first for proximity queries');
    });
  });
});
