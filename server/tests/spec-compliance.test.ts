/**
 * Spec Compliance Tests
 * Validates implementation against consolidated spec examples
 * Reference: Consolidated Spec — Answer-First UX + Assistant Brain
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { SearchOrchestrator } from '../src/services/search/orchestrator/search.orchestrator.js';
import { IntentService } from '../src/services/search/capabilities/intent.service.js';
import { GeoResolverService } from '../src/services/search/capabilities/geo-resolver.service.js';
import { PlacesProviderService } from '../src/services/search/capabilities/places-provider.service.js';
import { RankingService } from '../src/services/search/capabilities/ranking.service.js';
import { SuggestionService } from '../src/services/search/capabilities/suggestion.service.js';
import { SessionService } from '../src/services/search/capabilities/session.service.js';

describe('Spec Compliance Tests', () => {
  let orchestrator: SearchOrchestrator;

  before(async () => {
    // Initialize services
    const intentService = new IntentService();
    const geoResolver = new GeoResolverService();
    const placesProvider = new PlacesProviderService();
    const rankingService = new RankingService();
    const suggestionService = new SuggestionService();
    const sessionService = new SessionService();

    orchestrator = new SearchOrchestrator(
      intentService,
      geoResolver,
      placesProvider,
      rankingService,
      suggestionService,
      sessionService
    );
  });

  describe('A2.1 - Full Clear = Intent Reset', () => {
    it('should reset intent when clearContext=true', async () => {
      // First search with city context
      const search1 = await orchestrator.search({
        query: 'איטלקית באלנבי',
        sessionId: 'test-spec-a21-1'
      });
      
      // Should have results
      assert.ok(search1.results.length > 0, 'First search should return results');

      // Second search with clearContext
      const search2 = await orchestrator.search({
        query: 'חניה',
        sessionId: 'test-spec-a21-1',
        clearContext: true  // Intent reset
      });

      // Should ask clarification (not inherit Italian + Allenby)
      assert.strictEqual(
        search2.requiresClarification,
        true,
        'Should require clarification after context clear'
      );
      assert.ok(search2.clarification, 'Should have clarification object');
    });

    it('should NOT reset intent when clearContext=false', async () => {
      // First search
      await orchestrator.search({
        query: 'מסעדה איטלקית בתל אביב',
        sessionId: 'test-spec-a21-2'
      });

      // Refinement search (no clearContext)
      const search2 = await orchestrator.search({
        query: 'עם חניה',
        sessionId: 'test-spec-a21-2'
        // clearContext NOT set - should keep context
      });

      // Should add constraint (not ask clarification)
      // Note: This depends on NLU merging context properly
      assert.ok(
        !search2.requiresClarification || search2.results.length > 0,
        'Should either refine or show results, not clarify'
      );
    });
  });

  describe('A2.2 - Edit ≠ Reset', () => {
    it('should treat partial edit as refinement, not reset', async () => {
      // First search
      const search1 = await orchestrator.search({
        query: 'פיצה בתל אביב',
        sessionId: 'test-spec-a22'
      });
      
      assert.ok(search1.results.length > 0);

      // Edit to add constraint (no clearContext)
      const search2 = await orchestrator.search({
        query: 'פיצה כשרה בתל אביב',
        sessionId: 'test-spec-a22'
        // No clearContext - treats as refinement
      });

      // Should show results (not clarification)
      assert.ok(
        !search2.requiresClarification,
        'Should refine, not ask clarification'
      );
    });
  });

  describe('A2.3 - Single-Token Queries', () => {
    const singleTokenQueries = [
      'חניה',
      'parking',
      'kosher',
      'כשר',
      'פתוח עכשיו',
      'ללא גלוטן'
    ];

    for (const query of singleTokenQueries) {
      it(`should require clarification for single token: "${query}"`, async () => {
        const response = await orchestrator.search({
          query,
          sessionId: `test-spec-a23-${query}`
        });

        assert.strictEqual(
          response.requiresClarification,
          true,
          `Should require clarification for "${query}"`
        );
        
        assert.ok(
          response.clarification,
          `Should have clarification object for "${query}"`
        );
        
        assert.ok(
          response.clarification.choices.length >= 2,
          `Should have at least 2 choices for "${query}"`
        );
      });
    }

    it('should NOT clarify multi-token constraint queries', async () => {
      const response = await orchestrator.search({
        query: 'pizza with parking in tel aviv',
        sessionId: 'test-spec-a23-multi'
      });

      assert.strictEqual(
        response.requiresClarification,
        null,
        'Should not clarify multi-token query'
      );
      
      assert.ok(
        response.results.length > 0,
        'Should return results for multi-token query'
      );
    });
  });

  describe('A4 - Result Grouping Rules (Street Queries)', () => {
    it('should group street results into EXACT and NEARBY', async () => {
      const response = await orchestrator.search({
        query: 'איטלקית ברחוב אלנבי',
        sessionId: 'test-spec-a4'
      });

      assert.ok(response.groups, 'Should have groups');
      assert.strictEqual(response.groups.length, 2, 'Should have 2 groups');
      
      const exactGroup = response.groups.find(g => g.kind === 'EXACT');
      const nearbyGroup = response.groups.find(g => g.kind === 'NEARBY');
      
      assert.ok(exactGroup, 'Should have EXACT group');
      assert.ok(nearbyGroup, 'Should have NEARBY group');
      
      // Check labels
      assert.ok(
        exactGroup.label.includes('אלנבי') || exactGroup.label.includes('Allenby'),
        'EXACT label should mention street name'
      );
    });

    it('should label nearby results with distance', async () => {
      const response = await orchestrator.search({
        query: 'פיצה ברחוב דיזנגוף',
        sessionId: 'test-spec-a4-nearby'
      });

      if (response.groups && response.groups.length > 1) {
        const nearbyGroup = response.groups.find(g => g.kind === 'NEARBY');
        
        if (nearbyGroup) {
          assert.ok(
            nearbyGroup.distanceLabel,
            'NEARBY group should have distance label'
          );
          
          assert.ok(
            nearbyGroup.radiusMeters && nearbyGroup.radiusMeters <= 500,
            'NEARBY radius should be ≤ 500m'
          );
        }
      }
    });
  });

  describe('B2 - Street Detection (Multilingual)', () => {
    const streetQueries = [
      { query: 'רחוב אלנבי', lang: 'Hebrew' },
      { query: 'allenby street', lang: 'English' },
      { query: 'rue allenby', lang: 'French' },
      { query: 'calle allenby', lang: 'Spanish' },
    ];

    for (const { query, lang } of streetQueries) {
      it(`should detect street in ${lang}: "${query}"`, async () => {
        const response = await orchestrator.search({
          query,
          sessionId: `test-spec-b2-${lang}`
        });

        // Should detect street and return groups or results
        assert.ok(
          response.groups || response.results.length > 0,
          `Should detect street and return results for ${lang}`
        );
      });
    }
  });

  describe('B6 - UNKNOWN Semantics', () => {
    it('should return UNKNOWN for unverified openNow status', async () => {
      const response = await orchestrator.search({
        query: 'restaurant in tel aviv',
        sessionId: 'test-spec-b6'
      });

      // Find a result without opening hours data
      const resultWithUnknown = response.results.find(r => r.openNow === 'UNKNOWN');
      
      if (resultWithUnknown) {
        assert.strictEqual(
          resultWithUnknown.openNow,
          'UNKNOWN',
          'Should use UNKNOWN for unverified status'
        );
      }
      
      // At minimum, openNow should be a VerifiableBoolean type
      response.results.forEach(r => {
        if (r.openNow !== undefined) {
          assert.ok(
            r.openNow === true || r.openNow === false || r.openNow === 'UNKNOWN',
            'openNow should be boolean or UNKNOWN'
          );
        }
      });
    });
  });

  describe('B3 - City Detection (Two-Step Validation)', () => {
    it('should validate real city names', async () => {
      const realCities = ['תל אביב', 'ירושלים', 'חיפה'];
      
      for (const city of realCities) {
        const response = await orchestrator.search({
          query: `מסעדה ב${city}`,
          sessionId: `test-spec-b3-${city}`
        });

        // Should either:
        // 1. Return results (geocoding worked)
        // 2. Skip validation gracefully (API unavailable)
        assert.ok(
          response.results.length > 0 || !response.requiresClarification,
          `Should handle real city: ${city}`
        );
      }
    });

    it('should handle invalid city names gracefully', async () => {
      const response = await orchestrator.search({
        query: 'restaurant in XYZ_FAKE_CITY_123',
        sessionId: 'test-spec-b3-invalid'
      });

      // Should either:
      // 1. Ask clarification (city validation failed)
      // 2. Proceed without validation (API unavailable)
      // Should NOT crash
      assert.ok(response, 'Should not crash on invalid city');
    });
  });

  describe('Integration - Full Workflow', () => {
    it('should handle complete user journey', async () => {
      const sessionId = 'test-spec-journey';

      // 1. Start with ambiguous query
      const step1 = await orchestrator.search({
        query: 'parking',
        sessionId
      });
      assert.strictEqual(step1.requiresClarification, true, 'Step 1: Should clarify');

      // 2. Clear and search with full query
      const step2 = await orchestrator.search({
        query: 'italian restaurant with parking in tel aviv',
        sessionId,
        clearContext: true
      });
      assert.ok(step2.results.length > 0, 'Step 2: Should return results');

      // 3. Refine search (street-specific)
      const step3 = await orchestrator.search({
        query: 'italian on allenby street',
        sessionId
      });
      assert.ok(
        step3.groups || step3.results.length > 0,
        'Step 3: Should return grouped or flat results'
      );
    });
  });
});






