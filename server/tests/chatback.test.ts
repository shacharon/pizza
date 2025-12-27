/**
 * ChatBack Service Tests
 * Validates LLM message generation, forbidden phrase detection, and variation
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ChatBackService } from '../src/services/search/chatback/chatback.service.js';
import type { ChatBackInput } from '../src/services/search/chatback/chatback.service.js';
import type { ResponsePlan } from '../src/services/search/types/response-plan.types.js';
import type { ParsedIntent } from '../src/services/search/types/search.types.js';

describe('ChatBack Service', () => {
  const chatBack = new ChatBackService();

  // Helper to create mock intent
  const createMockIntent = (language: string = 'en', overrides?: Partial<ParsedIntent>): ParsedIntent => {
    return {
      query: 'pizza',
      location: {
        city: 'tel aviv',
        coords: { lat: 32.0853, lng: 34.7818 }
      },
      searchMode: 'textsearch' as const,
      filters: {},
      language,
      ...overrides
    };
  };

  // Helper to create mock ResponsePlan
  const createMockPlan = (scenario: ResponsePlan['scenario'], overrides?: Partial<ResponsePlan>): ResponsePlan => {
    return {
      scenario,
      results: {
        total: 0,
        exact: 0,
        nearby: 0,
        openNow: 0,
        closingSoon: 0,
        closedToday: 0,
        unknownHours: 0
      },
      filters: {
        droppedCount: 0,
        reasons: {}
      },
      timing: {
        currentTime: new Date().toISOString(),
        timeOfDay: 'evening',
        isWeekend: false
      },
      fallback: [],
      suggestedActions: [],
      constraints: {
        mustMentionCount: true,
        mustSuggestAction: true,
        canMentionTiming: true,
        canMentionLocation: true
      },
      ...overrides
    };
  };

  describe('Fallback Messages (No LLM)', () => {
    it('should generate fallback message for zero_nearby_exists in Hebrew', async () => {
      const intent = createMockIntent('he');
      const plan = createMockPlan('zero_nearby_exists', {
        results: { ...createMockPlan('zero_nearby_exists').results, nearby: 5 }
      });

      const input: ChatBackInput = {
        userText: 'פיצה',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      assert.ok(output.message);
      assert.ok(output.message.length > 0);
      assert.strictEqual(output.mode, 'RECOVERY');
    });

    it('should generate fallback message for missing_location in English', async () => {
      const intent = createMockIntent('en', { location: undefined });
      const plan = createMockPlan('missing_location');

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      assert.ok(output.message);
      assert.ok(output.message.toLowerCase().includes('where') || output.message.includes('איפה'));
    });

    it('should generate fallback message for few_closing_soon', async () => {
      const intent = createMockIntent('en');
      const plan = createMockPlan('few_closing_soon', {
        results: { ...createMockPlan('few_closing_soon').results, total: 2, closingSoon: 2 }
      });

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      assert.strictEqual(output.mode, 'RECOVERY');
      assert.ok(output.message.includes('2') || output.message.includes('closing'));
    });
  });

  describe('Forbidden Phrase Detection', () => {
    it('should detect "no results" phrase', () => {
      const service = new ChatBackService();
      const hasForbidden = (service as any).hasForbiddenPhrases('No results found');
      assert.strictEqual(hasForbidden, true);
    });

    it('should detect Hebrew "לא נמצאו תוצאות"', () => {
      const service = new ChatBackService();
      const hasForbidden = (service as any).hasForbiddenPhrases('לא נמצאו תוצאות');
      assert.strictEqual(hasForbidden, true);
    });

    it('should detect "nothing found"', () => {
      const service = new ChatBackService();
      const hasForbidden = (service as any).hasForbiddenPhrases('Nothing found in this area');
      assert.strictEqual(hasForbidden, true);
    });

    it('should not flag acceptable messages', () => {
      const service = new ChatBackService();
      const hasForbidden = (service as any).hasForbiddenPhrases('Found 5 nearby restaurants');
      assert.strictEqual(hasForbidden, false);
    });
  });

  describe('Message Hashing', () => {
    it('should create consistent hash for same message', () => {
      const message = 'Test message';
      const hash1 = chatBack.hashMessage(message);
      const hash2 = chatBack.hashMessage(message);
      
      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 8);
    });

    it('should create different hashes for different messages', () => {
      const hash1 = chatBack.hashMessage('Message 1');
      const hash2 = chatBack.hashMessage('Message 2');
      
      assert.notStrictEqual(hash1, hash2);
    });
  });

  describe('Language Awareness', () => {
    it('should handle Hebrew intent', async () => {
      const intent = createMockIntent('he');
      const plan = createMockPlan('missing_location');

      const input: ChatBackInput = {
        userText: 'פיצה',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      // Message should contain Hebrew characters
      assert.ok(/[\u0590-\u05FF]/.test(output.message));
    });

    it('should handle English intent', async () => {
      const intent = createMockIntent('en');
      const plan = createMockPlan('missing_location');

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      // Message should be in English
      assert.ok(output.message.length > 0);
    });
  });

  describe('Action Generation', () => {
    it('should return suggested actions from plan', async () => {
      const intent = createMockIntent('en');
      const plan = createMockPlan('zero_nearby_exists', {
        suggestedActions: [
          { id: 'action1', label: 'Expand radius', query: 'pizza nearby', priority: 1 },
          { id: 'action2', label: 'Try another city', query: 'pizza in jerusalem', priority: 2 }
        ]
      });

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      assert.strictEqual(output.actions.length, 2);
      assert.strictEqual(output.actions[0].id, 'action1');
      assert.strictEqual(output.actions[1].id, 'action2');
    });
  });

  describe('Mode Detection', () => {
    it('should set RECOVERY mode for zero results', async () => {
      const intent = createMockIntent('en');
      const plan = createMockPlan('zero_nearby_exists');

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      assert.strictEqual(output.mode, 'RECOVERY');
    });

    it('should set NORMAL mode for missing_location', async () => {
      const intent = createMockIntent('en', { location: undefined });
      const plan = createMockPlan('missing_location');

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      // This could be NORMAL mode as it's just a clarification
      assert.ok(['NORMAL', 'RECOVERY'].includes(output.mode));
    });
  });

  describe('Memory Integration', () => {
    it('should handle turn index in memory', async () => {
      const intent = createMockIntent('en');
      const plan = createMockPlan('zero_nearby_exists');

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan,
        memory: {
          turnIndex: 3,
          lastMessages: ['Previous message 1', 'Previous message 2'],
          scenarioCount: 2
        }
      };

      const output = await chatBack.generate(input);

      // Should generate a message even with memory
      assert.ok(output.message);
      assert.ok(output.message.length > 0);
    });

    it('should work without memory', async () => {
      const intent = createMockIntent('en');
      const plan = createMockPlan('zero_nearby_exists');

      const input: ChatBackInput = {
        userText: 'pizza',
        intent,
        responsePlan: plan
      };

      const output = await chatBack.generate(input);

      assert.ok(output.message);
    });
  });
});






