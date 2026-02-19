/**
 * Cost Calculator for LLM API Calls
 * 
 * Extracted from providerTrace.ts to eliminate business logic from telemetry module
 * and provide reusable cost estimation for OpenAI API usage.
 */

/**
 * OpenAI API pricing table (USD per 1M tokens)
 * Updated: January 2025
 * Source: https://openai.com/api/pricing/
 */
const OPENAI_PRICING = {
  'gpt-4o-mini': { input: 0.150, output: 0.600 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4-turbo-preview': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'gpt-3.5-turbo-16k': { input: 3.00, output: 4.00 },
} as const;

/**
 * Calculate estimated cost for OpenAI API calls
 * 
 * @param model - OpenAI model name (e.g., "gpt-4o-mini", "gpt-4o-2024-08-06")
 * @param tokensIn - Number of input tokens (prompt)
 * @param tokensOut - Number of output tokens (completion)
 * @returns Estimated cost in USD, or null if model pricing is unknown
 * 
 * @example
 * ```typescript
 * const cost = calculateOpenAICost('gpt-4o-mini', 1000, 500);
 * // Returns: 0.00045 (USD)
 * ```
 */
export function calculateOpenAICost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number | null {
  // Find matching pricing (handle model variants like gpt-4o-2024-08-06)
  let rates: { input: number; output: number } | null = null;
  for (const [key, value] of Object.entries(OPENAI_PRICING)) {
    if (model.includes(key)) {
      rates = value;
      break;
    }
  }

  if (!rates) {
    return null; // Unknown model
  }

  // Calculate cost: (tokens / 1M) * price_per_1M
  const costIn = (tokensIn / 1_000_000) * rates.input;
  const costOut = (tokensOut / 1_000_000) * rates.output;

  return costIn + costOut;
}

/**
 * Get pricing information for a model (for debugging/reporting)
 * 
 * @param model - OpenAI model name
 * @returns Pricing rates or null if unknown
 */
export function getModelPricing(
  model: string
): { input: number; output: number } | null {
  for (const [key, value] of Object.entries(OPENAI_PRICING)) {
    if (model.includes(key)) {
      return value;
    }
  }
  return null;
}
