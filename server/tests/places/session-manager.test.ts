/**
 * Unit tests for SessionManager
 * Tests context storage, TTL, refinement detection
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../../src/services/places/session/session-manager.js';

describe('SessionManager', () => {
    let manager: SessionManager;

    beforeEach(() => {
        manager = new SessionManager();
    });

    it('should create and retrieve session', () => {
        manager.update('session-1', 'pizza in ashkelon', {
            foodType: 'pizza',
            location: 'ashkelon'
        }, []);

        const context = manager.get('session-1');
        
        assert.strictEqual(context?.sessionId, 'session-1');
        assert.strictEqual(context?.baseQuery, 'pizza in ashkelon');
        assert.strictEqual(context?.parsedIntent.foodType, 'pizza');
    });

    it('should return null for non-existent session', () => {
        const context = manager.get('non-existent');
        assert.strictEqual(context, null);
    });

    it('should track search history', () => {
        manager.update('session-1', 'pizza', { foodType: 'pizza' }, []);
        manager.update('session-1', 'gluten free', { foodType: 'pizza', dietary: ['gluten-free'] }, []);

        const context = manager.get('session-1');
        
        assert.strictEqual(context?.searchHistory.length, 2);
        assert.strictEqual(context?.searchHistory[0].query, 'pizza');
        assert.strictEqual(context?.searchHistory[1].query, 'gluten free');
    });

    it('should detect refinement for short queries with context', () => {
        manager.update('session-1', 'pizza in ashkelon', {
            foodType: 'pizza',
            location: 'ashkelon'
        }, []);

        const context = manager.get('session-1');
        const isRefinement = manager.isRefinement('gluten free', context!);

        assert.strictEqual(isRefinement, true, 'Short query with context should be refinement');
    });

    it('should detect refinement for queries with refinement keywords', () => {
        manager.update('session-1', 'pizza in ashkelon', {
            foodType: 'pizza',
            location: 'ashkelon'
        }, []);

        const context = manager.get('session-1');
        const isRefinement = manager.isRefinement('open now', context!);

        assert.strictEqual(isRefinement, true, 'Query with "open" keyword should be refinement');
    });

    it('should detect new search for different query', () => {
        manager.update('session-1', 'pizza in ashkelon', {
            foodType: 'pizza',
            location: 'ashkelon'
        }, []);

        const context = manager.get('session-1');
        const isRefinement = manager.isRefinement('sushi in tel aviv', context!);

        assert.strictEqual(isRefinement, false, 'Different food/location should be new search');
    });

    it('should clear specific session', () => {
        manager.update('session-1', 'pizza', { foodType: 'pizza' }, []);
        manager.clear('session-1');

        const context = manager.get('session-1');
        assert.strictEqual(context, null);
    });

    it('should get session count', () => {
        manager.update('session-1', 'pizza', { foodType: 'pizza' }, []);
        manager.update('session-2', 'sushi', { foodType: 'sushi' }, []);

        assert.strictEqual(manager.getSessionCount(), 2);
    });

    it('should clear all sessions', () => {
        manager.update('session-1', 'pizza', { foodType: 'pizza' }, []);
        manager.update('session-2', 'sushi', { foodType: 'sushi' }, []);
        manager.clearAll();

        assert.strictEqual(manager.getSessionCount(), 0);
    });

    // Cleanup
    it('cleanup', () => {
        manager.destroy();
    });
});

