/**
 * Clarification Integration Tests
 * Tests the full clarification flow through SearchOrchestrator
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert';
import { SearchOrchestrator } from '../src/services/search/orchestrator/search.orchestrator.js';
import { IntentService } from '../src/services/search/capabilities/intent.service.js';
import { GeoResolverService } from '../src/services/search/capabilities/geo-resolver.service.js';
import { PlacesProviderService } from '../src/services/search/capabilities/places-provider.service.js';
import { RankingService } from '../src/services/search/capabilities/ranking.service.js';
import { SuggestionService } from '../src/services/search/capabilities/suggestion.service.js';
import { SessionService } from '../src/services/search/capabilities/session.service.js';
import { GeocodingService } from '../src/services/search/geocoding/geocoding.service.js';

describe('Clarification Integration', () => {
  let orchestrator: SearchOrchestrator;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;

  before(() => {
    // Create geocoding service if API key available
    const geocodingService = apiKey ? new GeocodingService(apiKey) : undefined;

    // Create intent service with geocoding
    const intentService = new IntentService(undefined, geocodingService);
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

  describe('Single-token query clarification', () => {
    it('should return clarification for "חניה" (parking)', async () => {
      const response = await orchestrator.search({
        query: 'חניה',
        sessionId: 'test-parking-1'
      });

      assert.strictEqual(response.requiresClarification, true);
      assert.ok(response.clarification);
      assert.ok(response.clarification.question.includes('חניה'));
      assert.strictEqual(response.results.length, 0);
      assert.ok(response.clarification.choices.length >= 2);
    });

    it('should return clarification for "parking" (English)', async () => {
      const response = await orchestrator.search({
        query: 'parking',
        sessionId: 'test-parking-2'
      });

      assert.strictEqual(response.requiresClarification, true);
      assert.ok(response.clarification);
      assert.strictEqual(response.results.length, 0);
    });

    it('should return clarification for "כשר" (kosher)', async () => {
      const response = await orchestrator.search({
        query: 'כשר',
        sessionId: 'test-kosher-1'
      });

      assert.strictEqual(response.requiresClarification, true);
      assert.ok(response.clarification);
      assert.ok(response.clarification.question.includes('כשר'));
    });

    it('should return clarification for "פתוח" (open)', async () => {
      const response = await orchestrator.search({
        query: 'פתוח',
        sessionId: 'test-open-1'
      });

      assert.strictEqual(response.requiresClarification, true);
      assert.ok(response.clarification);
    });
  });

  describe('Multi-token queries should NOT get clarification', () => {
    it('should search normally for "pizza with parking"', async () => {
      const response = await orchestrator.search({
        query: 'pizza with parking',
        sessionId: 'test-multi-1'
      });

      assert.strictEqual(response.requiresClarification, undefined);
      assert.strictEqual(response.clarification, undefined);
      // Should have attempted search (may have results or not depending on location)
    });

    it('should search normally for "מסעדה עם חניה"', async () => {
      const response = await orchestrator.search({
        query: 'מסעדה עם חניה',
        sessionId: 'test-multi-2'
      });

      assert.strictEqual(response.requiresClarification, undefined);
      assert.strictEqual(response.clarification, undefined);
    });
  });

  describe('Cuisine keywords should NOT get clarification', () => {
    it('should search normally for "pizza"', async () => {
      const response = await orchestrator.search({
        query: 'pizza',
        sessionId: 'test-pizza-1'
      });

      assert.strictEqual(response.requiresClarification, undefined);
      assert.strictEqual(response.clarification, undefined);
    });

    it('should search normally for "sushi"', async () => {
      const response = await orchestrator.search({
        query: 'sushi',
        sessionId: 'test-sushi-1'
      });

      assert.strictEqual(response.requiresClarification, undefined);
      assert.strictEqual(response.clarification, undefined);
    });
  });

  describe('Response structure', () => {
    it('should have proper clarification structure', async () => {
      const response = await orchestrator.search({
        query: 'delivery',
        sessionId: 'test-structure-1'
      });

      if (response.clarification) {
        assert.ok(response.clarification.question);
        assert.ok(Array.isArray(response.clarification.choices));
        assert.ok(response.clarification.choices.length > 0);

        // Check choice structure
        const choice = response.clarification.choices[0];
        assert.ok(choice.id);
        assert.ok(choice.label);
        assert.ok(choice.constraintPatch);
      }
    });

    it('should include both Hebrew and English questions', async () => {
      const response = await orchestrator.search({
        query: 'משלוח',
        sessionId: 'test-bilingual-1'
      });

      if (response.clarification) {
        assert.ok(response.clarification.question);
        assert.ok(response.clarification.questionHe);
        assert.ok(response.clarification.questionEn);
      }
    });
  });

  describe('Metadata for clarification responses', () => {
    it('should have correct metadata for clarification response', async () => {
      const response = await orchestrator.search({
        query: 'vegan',
        sessionId: 'test-meta-1'
      });

      if (response.requiresClarification) {
        assert.ok(response.meta);
        assert.strictEqual(response.meta.source, 'clarification');
        assert.ok(response.meta.tookMs > 0);
        assert.ok(response.meta.confidence >= 0 && response.meta.confidence <= 1);
      }
    });
  });
});












