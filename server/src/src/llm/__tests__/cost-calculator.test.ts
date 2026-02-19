/**
 * Cost Calculator Tests
 * Unit tests for OpenAI API cost estimation
 */

import { describe, it, expect } from 'vitest';
import { calculateOpenAICost, getModelPricing } from '../cost-calculator.js';

describe('cost-calculator', () => {
  describe('calculateOpenAICost', () => {
    describe('gpt-4o-mini', () => {
      it('should calculate cost for 1K input + 500 output tokens', () => {
        const cost = calculateOpenAICost('gpt-4o-mini', 1000, 500);
        // (1000 / 1M) * $0.150 + (500 / 1M) * $0.600
        // = 0.00015 + 0.0003 = 0.00045
        expect(cost).toBeCloseTo(0.00045, 6);
      });

      it('should calculate cost for 10K input + 5K output tokens', () => {
        const cost = calculateOpenAICost('gpt-4o-mini', 10000, 5000);
        // (10000 / 1M) * $0.150 + (5000 / 1M) * $0.600
        // = 0.0015 + 0.003 = 0.0045
        expect(cost).toBeCloseTo(0.0045, 6);
      });

      it('should handle model variants with date suffix', () => {
        const cost = calculateOpenAICost('gpt-4o-mini-2024-07-18', 1000, 1000);
        // Should match gpt-4o-mini pricing
        // (1000 / 1M) * $0.150 + (1000 / 1M) * $0.600
        // = 0.00015 + 0.0006 = 0.00075
        expect(cost).toBeCloseTo(0.00075, 6);
      });

      it('should calculate cost for zero tokens', () => {
        const cost = calculateOpenAICost('gpt-4o-mini', 0, 0);
        expect(cost).toBe(0);
      });
    });

    describe('gpt-4o', () => {
      it('should calculate cost for 1K input + 1K output tokens', () => {
        const cost = calculateOpenAICost('gpt-4o', 1000, 1000);
        // (1000 / 1M) * $2.50 + (1000 / 1M) * $10.00
        // = 0.0025 + 0.01 = 0.0125
        expect(cost).toBeCloseTo(0.0125, 6);
      });

      it('should handle model variants with date suffix', () => {
        const cost = calculateOpenAICost('gpt-4o-2024-08-06', 1000, 1000);
        expect(cost).toBeCloseTo(0.0125, 6);
      });
    });

    describe('gpt-4-turbo', () => {
      it('should calculate cost for 1K input + 1K output tokens', () => {
        const cost = calculateOpenAICost('gpt-4-turbo', 1000, 1000);
        // (1000 / 1M) * $10.00 + (1000 / 1M) * $30.00
        // = 0.01 + 0.03 = 0.04
        expect(cost).toBeCloseTo(0.04, 6);
      });

      it('should match pricing for gpt-4-turbo-preview', () => {
        const cost1 = calculateOpenAICost('gpt-4-turbo', 1000, 1000);
        const cost2 = calculateOpenAICost('gpt-4-turbo-preview', 1000, 1000);
        expect(cost1).toBe(cost2);
      });
    });

    describe('gpt-4', () => {
      it('should calculate cost for 1K input + 1K output tokens', () => {
        const cost = calculateOpenAICost('gpt-4', 1000, 1000);
        // (1000 / 1M) * $30.00 + (1000 / 1M) * $60.00
        // = 0.03 + 0.06 = 0.09
        expect(cost).toBeCloseTo(0.09, 6);
      });
    });

    describe('gpt-3.5-turbo', () => {
      it('should calculate cost for 1K input + 1K output tokens', () => {
        const cost = calculateOpenAICost('gpt-3.5-turbo', 1000, 1000);
        // (1000 / 1M) * $0.50 + (1000 / 1M) * $1.50
        // = 0.0005 + 0.0015 = 0.002
        expect(cost).toBeCloseTo(0.002, 6);
      });

      it('should calculate higher cost for 16k variant', () => {
        const cost = calculateOpenAICost('gpt-3.5-turbo-16k', 1000, 1000);
        // (1000 / 1M) * $3.00 + (1000 / 1M) * $4.00
        // = 0.003 + 0.004 = 0.007
        expect(cost).toBeCloseTo(0.007, 6);
      });
    });

    describe('unknown models', () => {
      it('should return null for unknown model', () => {
        const cost = calculateOpenAICost('gpt-5-ultra', 1000, 1000);
        expect(cost).toBeNull();
      });

      it('should return null for anthropic models', () => {
        const cost = calculateOpenAICost('claude-3-opus', 1000, 1000);
        expect(cost).toBeNull();
      });

      it('should return null for empty model name', () => {
        const cost = calculateOpenAICost('', 1000, 1000);
        expect(cost).toBeNull();
      });
    });

    describe('edge cases', () => {
      it('should handle large token counts', () => {
        const cost = calculateOpenAICost('gpt-4o-mini', 1_000_000, 500_000);
        // (1M / 1M) * $0.150 + (500K / 1M) * $0.600
        // = 0.150 + 0.300 = 0.450
        expect(cost).toBeCloseTo(0.450, 6);
      });

      it('should handle asymmetric token counts', () => {
        const cost = calculateOpenAICost('gpt-4o', 100, 10000);
        // (100 / 1M) * $2.50 + (10000 / 1M) * $10.00
        // = 0.00025 + 0.1 = 0.10025
        expect(cost).toBeCloseTo(0.10025, 6);
      });

      it('should handle only input tokens (zero output)', () => {
        const cost = calculateOpenAICost('gpt-4o-mini', 5000, 0);
        // (5000 / 1M) * $0.150 + 0
        // = 0.00075
        expect(cost).toBeCloseTo(0.00075, 6);
      });

      it('should handle only output tokens (zero input)', () => {
        const cost = calculateOpenAICost('gpt-4o-mini', 0, 5000);
        // 0 + (5000 / 1M) * $0.600
        // = 0.003
        expect(cost).toBeCloseTo(0.003, 6);
      });
    });
  });

  describe('getModelPricing', () => {
    it('should return pricing for gpt-4o-mini', () => {
      const pricing = getModelPricing('gpt-4o-mini');
      expect(pricing).toEqual({ input: 0.150, output: 0.600 });
    });

    it('should return pricing for gpt-4o', () => {
      const pricing = getModelPricing('gpt-4o');
      expect(pricing).toEqual({ input: 2.50, output: 10.00 });
    });

    it('should return pricing for model variants', () => {
      const pricing = getModelPricing('gpt-4o-2024-08-06');
      expect(pricing).toEqual({ input: 2.50, output: 10.00 });
    });

    it('should return null for unknown models', () => {
      const pricing = getModelPricing('gpt-5-ultra');
      expect(pricing).toBeNull();
    });

    it('should return null for empty model name', () => {
      const pricing = getModelPricing('');
      expect(pricing).toBeNull();
    });
  });
});
