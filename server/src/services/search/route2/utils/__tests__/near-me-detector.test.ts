import { describe, it, expect } from '@jest/globals';
import { isNearMeQuery, getNearMePattern } from '../near-me-detector.js';

describe('near-me-detector', () => {
  describe('isNearMeQuery', () => {
    describe('Hebrew patterns', () => {
      it('should detect "לידי"', () => {
        expect(isNearMeQuery('מסעדות לידי')).toBe(true);
        expect(isNearMeQuery('מה יש לידי')).toBe(true);
        expect(isNearMeQuery('פיצה לידי')).toBe(true);
      });

      it('should detect "לידיי" (with yud)', () => {
        expect(isNearMeQuery('מסעדות לידיי')).toBe(true);
      });

      it('should detect "ממני"', () => {
        expect(isNearMeQuery('מסעדות קרוב ממני')).toBe(true);
        expect(isNearMeQuery('איפה ממני')).toBe(true);
      });

      it('should detect "קרוב אליי"', () => {
        expect(isNearMeQuery('מה קרוב אליי')).toBe(true);
      });

      it('should detect "קרוב אלי"', () => {
        expect(isNearMeQuery('מה קרוב אלי')).toBe(true);
      });

      it('should detect "בסביבה"', () => {
        expect(isNearMeQuery('מסעדות בסביבה')).toBe(true);
      });

      it('should detect "בסביבתי"', () => {
        expect(isNearMeQuery('מה יש בסביבתי')).toBe(true);
      });

      it('should detect "באזור שלי"', () => {
        expect(isNearMeQuery('מסעדות באזור שלי')).toBe(true);
      });

      it('should detect "בקרבתי"', () => {
        expect(isNearMeQuery('מה יש בקרבתי')).toBe(true);
      });

      it('should work with real-world Hebrew queries', () => {
        expect(isNearMeQuery('מסעדות פתוחות לידי')).toBe(true);
        expect(isNearMeQuery('איפה אוכל לאכול לידי')).toBe(true);
        expect(isNearMeQuery('המבורגר לידיי')).toBe(true);
      });
    });

    describe('English patterns', () => {
      it('should detect "near me"', () => {
        expect(isNearMeQuery('restaurants near me')).toBe(true);
        expect(isNearMeQuery('pizza near me')).toBe(true);
      });

      it('should detect "nearby"', () => {
        expect(isNearMeQuery('restaurants nearby')).toBe(true);
      });

      it('should detect "around me"', () => {
        expect(isNearMeQuery('restaurants around me')).toBe(true);
      });

      it('should detect "close to me"', () => {
        expect(isNearMeQuery('restaurants close to me')).toBe(true);
      });

      it('should detect "in my area"', () => {
        expect(isNearMeQuery('restaurants in my area')).toBe(true);
      });
    });

    describe('case insensitivity', () => {
      it('should be case insensitive for Hebrew', () => {
        expect(isNearMeQuery('מסעדות לידי')).toBe(true);
        expect(isNearMeQuery('מסעדות לִידי')).toBe(true); // with niqqud
      });

      it('should be case insensitive for English', () => {
        expect(isNearMeQuery('RESTAURANTS NEAR ME')).toBe(true);
        expect(isNearMeQuery('Pizza Near Me')).toBe(true);
      });
    });

    describe('negative cases', () => {
      it('should NOT detect queries without near-me keywords', () => {
        expect(isNearMeQuery('מסעדות בתל אביב')).toBe(false);
        expect(isNearMeQuery('פיצה ברעננה')).toBe(false);
        expect(isNearMeQuery('restaurants in london')).toBe(false);
        expect(isNearMeQuery('pizza downtown')).toBe(false);
      });

      it('should NOT detect partial matches', () => {
        expect(isNearMeQuery('אליי')).toBe(false); // just the ending
        expect(isNearMeQuery('near')).toBe(false); // incomplete
      });
    });
  });

  describe('getNearMePattern', () => {
    it('should return the matched pattern for Hebrew', () => {
      expect(getNearMePattern('מסעדות לידי')).toBe('לידי');
      expect(getNearMePattern('מה יש בסביבה')).toBe('בסביבה');
    });

    it('should return the matched pattern for English', () => {
      expect(getNearMePattern('restaurants near me')).toBe('near me');
      expect(getNearMePattern('pizza nearby')).toBe('nearby');
    });

    it('should return null if no pattern matches', () => {
      expect(getNearMePattern('מסעדות בתל אביב')).toBeNull();
      expect(getNearMePattern('restaurants in london')).toBeNull();
    });
  });
});
