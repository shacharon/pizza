/**
 * Unit tests for Fast Intent Path
 * Intent Performance Policy: Pattern-based parsing without LLM
 */

import { describe, it, expect } from '@jest/globals';
import { tryFastIntent } from './fast-intent.js';

describe('Fast Intent Path', () => {
  describe('Simple Pattern Matching', () => {
    it('should match simple Hebrew cuisine + city', () => {
      const result = tryFastIntent('מסעדה סינית בתל אביב', 'he');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent.search.query).toBe('סינית');
        expect(result.intent.search.target.city).toBe('תל אביב');
        expect(result.intent.search.mode).toBe('textsearch');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reason).toBe('fast_path_cuisine_city');
      }
    });

    it('should match English cuisine + city', () => {
      const result = tryFastIntent('chinese restaurant in tel aviv', 'en');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent.search.query).toBe('chinese');
        expect(result.intent.search.target.city).toBe('tel aviv');
        expect(result.confidence).toBe(0.85);
      }
    });

    it('should match pizza in gedera', () => {
      const result = tryFastIntent('פיצה בגדרה', 'he');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent.search.query).toBe('פיצה');
        expect(result.intent.search.target.city).toBe('גדרה');
      }
    });

    it('should match burger in jerusalem', () => {
      const result = tryFastIntent('burger in jerusalem', 'en');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent.search.query).toBe('burger');
        expect(result.intent.search.target.city).toBe('jerusalem');
      }
    });
  });

  describe('Complex Markers Detection', () => {
    it('should reject queries with "open" keyword', () => {
      const result = tryFastIntent('פיצה פתוח בתל אביב', 'he');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with "closed" keyword', () => {
      const result = tryFastIntent('pizza closed in tel aviv', 'en');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with "now" keyword', () => {
      const result = tryFastIntent('sushi open now in haifa', 'en');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with vibe markers', () => {
      const result = tryFastIntent('מסעדה רומנטית בתל אביב', 'he');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with "romantic" keyword', () => {
      const result = tryFastIntent('romantic restaurant in tel aviv', 'en');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with "kosher" constraint', () => {
      const result = tryFastIntent('פיצה כשר בירושלים', 'he');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with "vegan" constraint', () => {
      const result = tryFastIntent('vegan pizza in tel aviv', 'en');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });

    it('should reject queries with proximity markers', () => {
      const result = tryFastIntent('פיצה ליד תל אביב', 'he');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('complex_markers_detected');
    });
  });

  describe('Missing Components', () => {
    it('should reject queries without known city', () => {
      const result = tryFastIntent('פיצה במקום לא ידוע', 'he');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no_known_city');
    });

    it('should reject queries without known cuisine', () => {
      const result = tryFastIntent('מקום אוכל בתל אביב', 'he');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no_known_cuisine');
    });

    it('should reject queries with only cuisine', () => {
      const result = tryFastIntent('pizza', 'en');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no_known_city');
    });

    it('should reject queries with only city', () => {
      const result = tryFastIntent('tel aviv', 'en');
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('no_known_cuisine');
    });
  });

  describe('Output Format', () => {
    it('should return correct PlacesIntent structure', () => {
      const result = tryFastIntent('sushi in haifa', 'en');
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.intent.intent).toBe('find_food');
        expect(result.intent.provider).toBe('google_places');
        expect(result.intent.search.mode).toBe('textsearch');
        expect(result.intent.search.target.kind).toBe('city');
        expect(result.intent.search.filters?.language).toBe('en');
        expect(result.intent.output?.page_size).toBe(10);
        expect(result.intent.output?.fields).toContain('place_id');
        expect(result.intent.output?.fields).toContain('name');
        expect(result.intent.output?.fields).toContain('opening_hours');
      }
    });

    it('should set language filter based on context', () => {
      const resultHe = tryFastIntent('פיצה בתל אביב', 'he');
      expect(resultHe.ok).toBe(true);
      if (resultHe.ok) {
        expect(resultHe.intent.search.filters?.language).toBe('he');
      }

      const resultEn = tryFastIntent('pizza in tel aviv', 'en');
      expect(resultEn.ok).toBe(true);
      if (resultEn.ok) {
        expect(resultEn.intent.search.filters?.language).toBe('en');
      }
    });
  });
});

