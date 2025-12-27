/**
 * ClarificationService Tests
 * Tests clarification generation for ambiguous queries
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ClarificationService } from '../src/services/search/clarification/clarification.service.js';

describe('ClarificationService', () => {
  const service = new ClarificationService();

  describe('generateCityClarification', () => {
    it('should generate clarification for ambiguous city', () => {
      const candidates = [
        {
          name: 'Paris',
          displayName: 'Paris, France',
          coordinates: { lat: 48.8566, lng: 2.3522 },
          confidence: 0.9
        },
        {
          name: 'Paris',
          displayName: 'Paris, Texas, USA',
          coordinates: { lat: 33.6609, lng: -95.5555 },
          confidence: 0.8
        }
      ];

      const clarification = service.generateCityClarification('Paris', candidates, 'en');

      assert.ok(clarification.question.includes('Paris'));
      assert.strictEqual(clarification.choices.length, 2);
      assert.strictEqual(clarification.choices[0].emoji, '📍');
      assert.ok(clarification.choices[0].label.includes('France'));
    });

    it('should generate Hebrew question for Hebrew language', () => {
      const candidates = [
        {
          name: 'תל אביב',
          displayName: 'Tel Aviv, Israel',
          coordinates: { lat: 32.0853, lng: 34.7818 },
          confidence: 1.0
        }
      ];

      const clarification = service.generateCityClarification('תל אביב', candidates, 'he');

      assert.ok(clarification.question.includes('איזו'));
      assert.ok(clarification.questionHe);
      assert.ok(clarification.questionEn);
    });

    it('should include coordinates in constraint patch', () => {
      const candidates = [
        {
          name: 'Paris',
          displayName: 'Paris, France',
          coordinates: { lat: 48.8566, lng: 2.3522 },
          confidence: 0.9
        }
      ];

      const clarification = service.generateCityClarification('Paris', candidates);

      assert.ok(clarification.choices[0].constraintPatch.location);
      assert.ok(clarification.choices[0].constraintPatch.location.coords);
    });
  });

  describe('generateTokenClarification', () => {
    it('should generate parking clarification (Hebrew)', () => {
      const clarification = service.generateTokenClarification('חניה', 'parking', 'he');

      assert.ok(clarification.question.includes('חניה'));
      assert.strictEqual(clarification.choices.length, 2);
      assert.strictEqual(clarification.choices[0].emoji, '🅿️');
      assert.ok(clarification.choices[0].label.includes('חניה'));
    });

    it('should generate parking clarification (English)', () => {
      const clarification = service.generateTokenClarification('parking', 'parking', 'en');

      assert.ok(clarification.question.includes('parking'));
      assert.strictEqual(clarification.choices.length, 2);
      assert.ok(clarification.choices[0].label.includes('parking'));
    });

    it('should generate kosher clarification', () => {
      const clarification = service.generateTokenClarification('כשר', 'kosher', 'he');

      assert.ok(clarification.question.includes('כשר'));
      assert.strictEqual(clarification.choices[0].emoji, '✡️');
      assert.ok(clarification.choices[0].constraintPatch.filters);
    });

    it('should generate openNow clarification', () => {
      const clarification = service.generateTokenClarification('open', 'openNow', 'en');

      assert.ok(clarification.question.toLowerCase().includes('open'));
      assert.strictEqual(clarification.choices[0].emoji, '🕐');
    });

    it('should generate glutenFree clarification', () => {
      const clarification = service.generateTokenClarification('gluten free', 'glutenFree', 'en');

      assert.ok(clarification.question.toLowerCase().includes('gluten'));
      assert.strictEqual(clarification.choices[0].emoji, '🌾');
    });

    it('should generate vegan clarification', () => {
      const clarification = service.generateTokenClarification('טבעוני', 'vegan', 'he');

      assert.ok(clarification.question.includes('טבעוני'));
      assert.strictEqual(clarification.choices[0].emoji, '🌱');
    });

    it('should generate delivery clarification', () => {
      const clarification = service.generateTokenClarification('delivery', 'delivery', 'en');

      assert.ok(clarification.question.toLowerCase().includes('delivery'));
      assert.strictEqual(clarification.choices[0].emoji, '🚚');
    });

    it('should provide both constraint and name options', () => {
      const clarification = service.generateTokenClarification('parking', 'parking', 'en');

      assert.strictEqual(clarification.choices.length, 2);
      assert.strictEqual(clarification.choices[0].id, 'constraint');
      assert.strictEqual(clarification.choices[1].id, 'name');
      
      // First choice applies constraint
      assert.ok(clarification.choices[0].constraintPatch.filters);
      
      // Second choice treats it as name
      assert.ok(clarification.choices[1].constraintPatch.query);
    });
  });

  describe('generateConstraintClarification', () => {
    it('should generate generic constraint clarification', () => {
      const clarification = service.generateConstraintClarification('some constraint', 'en');

      assert.ok(clarification.question.includes('constraint'));
      assert.ok(clarification.choices.length >= 2);
      assert.ok(clarification.choices[0].emoji);
    });

    it('should provide common food type options', () => {
      const clarification = service.generateConstraintClarification('open now', 'en');

      assert.ok(clarification.choices.some(c => c.label.toLowerCase().includes('restaurant')));
      assert.ok(clarification.choices.some(c => c.label.toLowerCase().includes('cafe')));
    });

    it('should work in Hebrew', () => {
      const clarification = service.generateConstraintClarification('פתוח', 'he');

      assert.ok(clarification.questionHe);
      assert.ok(clarification.choices.some(c => c.label.includes('מסעדה')));
    });
  });
});







