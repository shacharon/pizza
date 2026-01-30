/**
 * Ranking Suggestion Service Tests
 * Tests trigger detection and fallback logic
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldShowRankingSuggestion } from './ranking-suggestion.service.js';
import type { RankingSignals } from '../ranking/ranking-signals.js';

describe('shouldShowRankingSuggestion', () => {
  it('should return true when lowResults trigger is active', () => {
    const signals: RankingSignals = {
      profile: 'BALANCED',
      dominantFactor: 'NONE',
      triggers: {
        lowResults: true,
        relaxUsed: false,
        manyOpenUnknown: false,
        dominatedByOneFactor: false
      },
      facts: {
        shownNow: 8,
        totalPool: 30,
        hasUserLocation: true
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, true);
  });

  it('should return true when relaxUsed trigger is active', () => {
    const signals: RankingSignals = {
      profile: 'QUALITY',
      dominantFactor: 'RATING',
      triggers: {
        lowResults: false,
        relaxUsed: true,
        manyOpenUnknown: false,
        dominatedByOneFactor: false
      },
      facts: {
        shownNow: 15,
        totalPool: 30,
        hasUserLocation: false
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, true);
  });

  it('should return true when manyOpenUnknown trigger is active', () => {
    const signals: RankingSignals = {
      profile: 'NEARBY',
      dominantFactor: 'DISTANCE',
      triggers: {
        lowResults: false,
        relaxUsed: false,
        manyOpenUnknown: true,
        dominatedByOneFactor: false
      },
      facts: {
        shownNow: 20,
        totalPool: 30,
        hasUserLocation: true
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, true);
  });

  it('should return true when dominatedByOneFactor trigger is active', () => {
    const signals: RankingSignals = {
      profile: 'NEARBY',
      dominantFactor: 'DISTANCE',
      triggers: {
        lowResults: false,
        relaxUsed: false,
        manyOpenUnknown: false,
        dominatedByOneFactor: true
      },
      facts: {
        shownNow: 25,
        totalPool: 30,
        hasUserLocation: true
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, true);
  });

  it('should return true when multiple triggers are active', () => {
    const signals: RankingSignals = {
      profile: 'QUALITY',
      dominantFactor: 'RATING',
      triggers: {
        lowResults: true,
        relaxUsed: true,
        manyOpenUnknown: true,
        dominatedByOneFactor: true
      },
      facts: {
        shownNow: 5,
        totalPool: 10,
        hasUserLocation: false
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, true);
  });

  it('should return false when no triggers are active', () => {
    const signals: RankingSignals = {
      profile: 'BALANCED',
      dominantFactor: 'NONE',
      triggers: {
        lowResults: false,
        relaxUsed: false,
        manyOpenUnknown: false,
        dominatedByOneFactor: false
      },
      facts: {
        shownNow: 25,
        totalPool: 30,
        hasUserLocation: true
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, false);
  });

  it('should return false for perfect results (no triggers)', () => {
    const signals: RankingSignals = {
      profile: 'BALANCED',
      dominantFactor: 'NONE',
      triggers: {
        lowResults: false,
        relaxUsed: false,
        manyOpenUnknown: false,
        dominatedByOneFactor: false
      },
      facts: {
        shownNow: 30,
        totalPool: 30,
        hasUserLocation: true
      }
    };

    const result = shouldShowRankingSuggestion(signals);
    assert.strictEqual(result, false);
  });
});
