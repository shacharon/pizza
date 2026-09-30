import { dailyLimitCopy, isDailyModelLimit } from './daily-limit-copy';

describe('dailyLimitCopy', () => {
  it('follows the letters in the question', () => {
    expect(dailyLimitCopy('מסעדה מומלצות בבלגרד').lang).toBe('he');
    expect(dailyLimitCopy('مطعم قريب').lang).toBe('ar');
    expect(dailyLimitCopy('пицца рядом').lang).toBe('ru');
    expect(dailyLimitCopy('የምግብ ቤት').lang).toBe('am');
    expect(dailyLimitCopy('pizza in tel aviv').lang).toBe('en');
    expect(dailyLimitCopy('restaurant près de moi').lang).toBe('fr');
    expect(dailyLimitCopy('restaurante cerca').lang).toBe('es');
    expect(dailyLimitCopy('Restaurant in der Nähe').lang).toBe('de');
    expect(dailyLimitCopy('ristorante vicino').lang).toBe('it');
  });

  it('states the 40-call limit in that language', () => {
    expect(dailyLimitCopy('pizza').body).toBe('You can make up to 40 calls per day.');
    expect(dailyLimitCopy('מסעדה').body).toContain('40');
    expect(dailyLimitCopy('מסעדה').dir).toBe('rtl');
    expect(dailyLimitCopy('مطعم').dir).toBe('rtl');
  });

  it('recognizes the budget error and leaves a timeout alone', () => {
    expect(isDailyModelLimit('Try again later', 'MODEL_BUDGET_EXCEEDED')).toBe(true);
    expect(isDailyModelLimit('GATE_ERROR: Try again later')).toBe(true);
    expect(isDailyModelLimit('GATE_TIMEOUT: Classification timed out - please retry', 'SEARCH_FAILED')).toBe(false);
  });
});
