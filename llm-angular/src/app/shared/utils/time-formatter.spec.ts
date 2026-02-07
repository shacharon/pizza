/**
 * Time Formatter Utility Tests
 */

import { formatClosingTime, formatTimeFromDate, formatTimeFromRaw } from './time-formatter';

describe('Time Formatter Utilities', () => {
  describe('formatClosingTime', () => {
    it('should convert "00:00" to "24:00"', () => {
      expect(formatClosingTime('00:00')).toBe('24:00');
    });

    it('should convert "00:00:00" to "24:00"', () => {
      expect(formatClosingTime('00:00:00')).toBe('24:00');
    });

    it('should preserve other times unchanged', () => {
      expect(formatClosingTime('23:59')).toBe('23:59');
      expect(formatClosingTime('12:30')).toBe('12:30');
      expect(formatClosingTime('01:00')).toBe('01:00');
      expect(formatClosingTime('22:00')).toBe('22:00');
    });

    it('should strip seconds from non-midnight times', () => {
      expect(formatClosingTime('23:59:59')).toBe('23:59');
      expect(formatClosingTime('12:30:45')).toBe('12:30');
    });

    it('should handle empty or null input', () => {
      expect(formatClosingTime('')).toBe('');
      expect(formatClosingTime(null as any)).toBe(null);
      expect(formatClosingTime(undefined as any)).toBe(undefined);
    });
  });

  describe('formatTimeFromDate', () => {
    it('should format midnight (00:00) as "24:00"', () => {
      const date = new Date('2024-01-01T00:00:00');
      expect(formatTimeFromDate(date)).toBe('24:00');
    });

    it('should format regular times correctly', () => {
      const date1 = new Date('2024-01-01T23:30:00');
      expect(formatTimeFromDate(date1)).toBe('23:30');

      const date2 = new Date('2024-01-01T12:00:00');
      expect(formatTimeFromDate(date2)).toBe('12:00');

      const date3 = new Date('2024-01-01T01:15:00');
      expect(formatTimeFromDate(date3)).toBe('01:15');
    });

    it('should pad single digit hours and minutes', () => {
      const date = new Date('2024-01-01T09:05:00');
      expect(formatTimeFromDate(date)).toBe('09:05');
    });
  });

  describe('formatTimeFromRaw', () => {
    it('should convert "0000" to "24:00"', () => {
      expect(formatTimeFromRaw('0000')).toBe('24:00');
    });

    it('should format regular raw times correctly', () => {
      expect(formatTimeFromRaw('2330')).toBe('23:30');
      expect(formatTimeFromRaw('1200')).toBe('12:00');
      expect(formatTimeFromRaw('0115')).toBe('01:15');
      expect(formatTimeFromRaw('0905')).toBe('09:05');
    });

    it('should handle edge cases', () => {
      expect(formatTimeFromRaw('2359')).toBe('23:59');
      expect(formatTimeFromRaw('0001')).toBe('00:01');
    });

    it('should handle invalid or short input', () => {
      expect(formatTimeFromRaw('')).toBe('');
      expect(formatTimeFromRaw('12')).toBe('12');
      expect(formatTimeFromRaw(null as any)).toBe(null);
    });
  });

  describe('Integration: Closing time scenarios', () => {
    it('should format midnight closing time in hours range', () => {
      const openTime = formatTimeFromRaw('0900');  // 09:00
      const closeTime = formatTimeFromRaw('0000'); // 24:00
      const range = `${openTime}–${closeTime}`;
      
      expect(range).toBe('09:00–24:00');
    });

    it('should format after-midnight closing time', () => {
      const openTime = formatTimeFromRaw('1800');  // 18:00
      const closeTime = formatTimeFromRaw('0100'); // 01:00
      const range = `${openTime}–${closeTime}`;
      
      expect(range).toBe('18:00–01:00');
    });

    it('should format regular closing time', () => {
      const openTime = formatTimeFromRaw('1000');  // 10:00
      const closeTime = formatTimeFromRaw('2200'); // 22:00
      const range = `${openTime}–${closeTime}`;
      
      expect(range).toBe('10:00–22:00');
    });
  });
});
