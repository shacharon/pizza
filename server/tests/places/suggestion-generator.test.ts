/**
 * Unit tests for SuggestionGenerator
 * Tests contextual suggestion generation based on results
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SuggestionGenerator } from '../../src/services/places/suggestions/suggestion-generator.js';

describe('SuggestionGenerator', () => {
    const generator = new SuggestionGenerator();

    const mockResults = [
        {
            placeId: '1',
            name: 'Pizza Place 1',
            rating: 4.8,
            priceLevel: 2,
            delivery: true,
            openNow: true
        },
        {
            placeId: '2',
            name: 'Pizza Place 2',
            rating: 4.2,
            priceLevel: 1,
            delivery: false,
            openNow: true
        }
    ];

    it('should suggest delivery if available', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza' },
            mockResults,
            'en'
        );

        const deliverySuggestion = suggestions.find(s => s.id === 'delivery');
        assert.ok(deliverySuggestion, 'Should suggest delivery');
        assert.strictEqual(deliverySuggestion?.emoji, '🚗');
        assert.strictEqual(deliverySuggestion?.label, 'Delivery');
    });

    test('should suggest budget if cheap options exist', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza' },
            mockResults,
            'en'
        );

        const budgetSuggestion = suggestions.find(s => s.id === 'budget');
        assert.ok(budgetSuggestion, 'Should suggest budget');
        assert.strictEqual(budgetSuggestion?.emoji, '💰');
    });

    test('should suggest top rated if highly-rated options exist', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza' },
            mockResults,
            'en'
        );

        const topRatedSuggestion = suggestions.find(s => s.id === 'toprated');
        assert.ok(topRatedSuggestion, 'Should suggest top rated');
        assert.strictEqual(topRatedSuggestion?.emoji, '⭐');
    });

    test('should always suggest map view', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza' },
            mockResults,
            'en'
        );

        const mapSuggestion = suggestions.find(s => s.id === 'map');
        assert.ok(mapSuggestion, 'Should always suggest map');
        assert.strictEqual(mapSuggestion?.action, 'map');
    });

    test('should limit suggestions to 5 max', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza' },
            mockResults,
            'en'
        );

        assert.ok(suggestions.length <= 5, 'Should limit to 5 suggestions');
    });

    test('should provide Hebrew labels', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza' },
            mockResults,
            'he'
        );

        const deliverySuggestion = suggestions.find(s => s.id === 'delivery');
        assert.strictEqual(deliverySuggestion?.label, 'משלוחים');

        const mapSuggestion = suggestions.find(s => s.id === 'map');
        assert.strictEqual(mapSuggestion?.label, 'מפה');
    });

    test('should suggest broadening when no results', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza', temporal: ['opennow'] },
            [], // No results
            'en'
        );

        const anytimeSuggestion = suggestions.find(s => s.id === 'anytime');
        assert.ok(anytimeSuggestion, 'Should suggest removing temporal filter');
        
        const expandSuggestion = suggestions.find(s => s.id === 'expand');
        assert.ok(expandSuggestion, 'Should suggest expanding area');
    });

    test('should NOT suggest delivery if already filtered', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza', delivery: true },
            mockResults,
            'en'
        );

        const deliverySuggestion = suggestions.find(s => s.id === 'delivery');
        assert.ok(!deliverySuggestion, 'Should not suggest already-applied filter');
    });

    test('should NOT suggest opennow if already filtered', () => {
        const suggestions = generator.generate(
            { foodType: 'pizza', temporal: ['opennow'] },
            mockResults,
            'en'
        );

        const opennowSuggestion = suggestions.find(s => s.id === 'opennow');
        assert.ok(!opennowSuggestion, 'Should not suggest already-applied filter');
    });

    test('should get suggestion by ID', () => {
        const suggestion = generator.getSuggestionById('delivery', 'en');
        
        assert.ok(suggestion);
        assert.strictEqual(suggestion?.id, 'delivery');
        assert.strictEqual(suggestion?.label, 'Delivery');
        assert.strictEqual(suggestion?.filter, 'delivery');
    });

    test('should return null for invalid suggestion ID', () => {
        const suggestion = generator.getSuggestionById('invalid', 'en');
        assert.strictEqual(suggestion, null);
    });
});

