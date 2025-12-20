/**
 * Unit tests for SmartDefaultsEngine
 * Tests auto-apply logic, filter tracking, transparency
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SmartDefaultsEngine } from '../../src/services/places/defaults/smart-defaults.js';

describe('SmartDefaultsEngine', () => {
    const engine = new SmartDefaultsEngine();

    it('should auto-apply opennow by default', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', location: 'ashkelon' },
            'pizza in ashkelon',
            []
        );

        assert.ok(enhanced.temporal?.includes('opennow'), 'Should auto-apply opennow');
        assert.ok(enhanced.autoAppliedFilters.includes('opennow'), 'Should track opennow as auto-applied');
    });

    test('should NOT auto-apply opennow when user specifies time', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', location: 'ashkelon' },
            'pizza in ashkelon tomorrow',
            []
        );

        assert.ok(!enhanced.temporal?.includes('opennow'), 'Should not auto-apply opennow for future time');
    });

    test('should track user-requested dietary filters', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', dietary: ['gluten-free', 'vegan'] },
            'gluten free vegan pizza',
            []
        );

        assert.ok(enhanced.userRequestedFilters.includes('dietary:gluten-free'));
        assert.ok(enhanced.userRequestedFilters.includes('dietary:vegan'));
    });

    test('should track user-requested price filter', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', price: { max: 50 } },
            'cheap pizza',
            []
        );

        assert.ok(enhanced.userRequestedFilters.includes('price'), 'Should track price as user-requested');
    });

    test('should track user-requested delivery filter', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', delivery: true },
            'pizza delivery',
            []
        );

        assert.ok(enhanced.userRequestedFilters.includes('delivery'), 'Should track delivery as user-requested');
    });

    test('should apply radius for city locations', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', location: 'tel aviv' },
            'pizza in tel aviv',
            []
        );

        assert.ok(enhanced.autoAppliedFilters.includes('radius:5000'), 'Should apply 5km radius for cities');
    });

    test('should apply distance ranking for "near me" queries', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza' },
            'pizza near me',
            []
        );

        assert.ok(enhanced.autoAppliedFilters.includes('rankby:distance'), 'Should apply distance ranking for "near me"');
    });

    test('should remove auto-applied filter', () => {
        let enhanced = engine.applyDefaults(
            { foodType: 'pizza', temporal: ['opennow'] },
            'pizza',
            []
        );

        // Remove opennow
        enhanced = engine.removeAutoApplied(enhanced, 'opennow');

        assert.ok(!enhanced.autoAppliedFilters.includes('opennow'), 'Should remove from auto-applied');
        assert.ok(!enhanced.temporal?.includes('opennow'), 'Should remove from parsed intent');
    });

    test('should get filter labels in English', () => {
        const label = engine.getFilterLabel('opennow', 'en');
        assert.strictEqual(label, 'Open now');
    });

    test('should get filter labels in Hebrew', () => {
        const label = engine.getFilterLabel('opennow', 'he');
        assert.strictEqual(label, 'פתוח עכשיו');
    });

    test('should handle Hebrew "near me" queries', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza' },
            'פיצה קרוב אליי',
            []
        );

        assert.ok(enhanced.autoAppliedFilters.includes('rankby:distance'), 'Should detect Hebrew "near me"');
    });

    test('should NOT apply opennow for queries with "any time"', () => {
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza' },
            'pizza any time',
            []
        );

        assert.ok(!enhanced.temporal?.includes('opennow'), 'Should not apply opennow for "any time"');
    });
});

