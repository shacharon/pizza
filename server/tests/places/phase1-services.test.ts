/**
 * Simple tests for Phase 1 services
 * Tests basic functionality to verify they work
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../src/services/places/session/session-manager.js';
import { GeocodeCache } from '../../src/services/places/cache/geocode-cache.js';
import { SmartDefaultsEngine } from '../../src/services/places/defaults/smart-defaults.js';
import { SuggestionGenerator } from '../../src/services/places/suggestions/suggestion-generator.js';

describe('Phase 1 Services', () => {
    it('SessionManager - create and retrieve session', () => {
        const manager = new SessionManager();
        manager.update('test-1', 'pizza in ashkelon', { foodType: 'pizza', location: 'ashkelon' }, []);
        
        const context = manager.get('test-1');
        assert.equal(context?.sessionId, 'test-1');
        assert.equal(context?.baseQuery, 'pizza in ashkelon');
        
        manager.destroy();
    });

    it('SessionManager - detect refinement', () => {
        const manager = new SessionManager();
        manager.update('test-1', 'pizza in ashkelon', { foodType: 'pizza', location: 'ashkelon' }, []);
        
        const context = manager.get('test-1');
        const isRefinement = manager.isRefinement('gluten free', context!);
        assert.equal(isRefinement, true);
        
        manager.destroy();
    });

    it('GeocodeCache - store and retrieve coordinates', () => {
        const cache = new GeocodeCache();
        const coords = { lat: 31.668, lng: 34.574 };
        
        cache.set('ashkelon', 'he', coords);
        const retrieved = cache.get('ashkelon', 'he');
        
        assert.deepEqual(retrieved, coords);
    });

    it('GeocodeCache - track hits and misses', () => {
        const cache = new GeocodeCache();
        cache.set('ashkelon', 'he', { lat: 31.668, lng: 34.574 });
        
        cache.get('ashkelon', 'he'); // hit
        cache.get('tel aviv', 'he'); // miss
        
        const stats = cache.getStats();
        assert.equal(stats.hits, 1);
        assert.equal(stats.misses, 1);
    });

    it('SmartDefaultsEngine - auto-apply opennow', () => {
        const engine = new SmartDefaultsEngine();
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', location: 'ashkelon' },
            'pizza in ashkelon',
            []
        );
        
        assert.ok(enhanced.temporal?.includes('opennow'));
        assert.ok(enhanced.autoAppliedFilters.includes('opennow'));
    });

    it('SmartDefaultsEngine - skip opennow for future time', () => {
        const engine = new SmartDefaultsEngine();
        const enhanced = engine.applyDefaults(
            { foodType: 'pizza', location: 'ashkelon' },
            'pizza in ashkelon tomorrow',
            []
        );
        
        assert.ok(!enhanced.temporal?.includes('opennow'));
    });

    it('SuggestionGenerator - suggest delivery if available', () => {
        const generator = new SuggestionGenerator();
        const mockResults = [
            { placeId: '1', name: 'Pizza Place', rating: 4.5, delivery: true }
        ];
        
        const suggestions = generator.generate({ foodType: 'pizza' }, mockResults, 'en');
        const deliverySuggestion = suggestions.find(s => s.id === 'delivery');
        
        assert.ok(deliverySuggestion);
        assert.equal(deliverySuggestion?.label, 'Delivery');
    });

    it('SuggestionGenerator - always suggest map', () => {
        const generator = new SuggestionGenerator();
        const mockResults = [
            { placeId: '1', name: 'Pizza Place', rating: 4.5 }
        ];
        
        const suggestions = generator.generate({ foodType: 'pizza' }, mockResults, 'en');
        const mapSuggestion = suggestions.find(s => s.id === 'map');
        
        assert.ok(mapSuggestion);
        assert.equal(mapSuggestion?.action, 'map');
    });
});

