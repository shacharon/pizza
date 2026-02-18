/**
 * Extract price constraints from user query.
 * Returns JSON-serializable object only. No LLM; deterministic keyword + regex.
 */

import type { BudgetCurrency, BudgetOp, PriceConstraintsResult, PriceIntent } from './price-constraints.types.js';

const CHEAP_PATTERNS = [
  /\bcheap\b/i,
  /\bזול\b/,
  /\bלא יקר\b/,
  /\bbudget\b/i, // "budget" as in cheap
];

const EXPENSIVE_PATTERNS = [
  /\bexpensive\b/i,
  /\bיקר\b/,
  /\bvery expensive\b/i,
  /\bיקר מאוד\b/,
  /\bfine dining\b/i,
];

const MID_PATTERNS = [
  /\bmoderate\b/i,
  /\bבינוני\b/,
  /\bmid-range\b/i,
  /\bmid range\b/i,
  /\b\$\$\b(?!\$)/, // $$ but not $$$ or $$$$
];

// Currency: only when explicit (never guess)
const CURRENCY_ILS = /\b(?:NIS|ILS|₪|shekel?s?)\b/i;
const CURRENCY_USD = /\b(?:USD|\$|dollar?s?)\b/i;
const CURRENCY_EUR = /\b(?:EUR|€|euro?s?)\b/i;

// Per person
const PER_PERSON_PATTERNS = [
  /\bper person\b/i,
  /\bלאדם\b/,
  /\bper head\b/i,
  /\bלכל אדם\b/,
  /\ba person\b/i,
];

function detectPriceIntent(query: string): PriceIntent {
  const q = query.trim();
  for (const re of CHEAP_PATTERNS) {
    if (re.test(q)) return 'CHEAP';
  }
  for (const re of EXPENSIVE_PATTERNS) {
    if (re.test(q)) return 'EXPENSIVE';
  }
  for (const re of MID_PATTERNS) {
    if (re.test(q)) return 'MID';
  }
  return null;
}

function detectCurrency(query: string): BudgetCurrency {
  if (CURRENCY_ILS.test(query)) return 'ILS';
  if (CURRENCY_USD.test(query)) return 'USD';
  if (CURRENCY_EUR.test(query)) return 'EUR';
  return null;
}

function detectPerPerson(query: string): boolean {
  return PER_PERSON_PATTERNS.some((re) => re.test(query));
}

function extractAmountAndOp(query: string): { amount: number | null; op: BudgetOp } {
  let amount: number | null = null;

  // "up to X" / "עד X" / "max X" → MAX
  const maxMatch = query.match(/(?:up to|עד|max(?:imum)?|לא יותר מ)\s*(\d+(?:\.\d+)?)/i);
  if (maxMatch) {
    amount = parseFloat(maxMatch[1]);
    return { amount, op: 'MAX' };
  }

  // "X NIS" / "50 shekels" / "$30" etc. → EXACT (or null op; spec says EXACT)
  const amountCurrencyMatch = query.match(/(\d+(?:\.\d+)?)\s*(?:NIS|ILS|₪|shekel?s?|USD|\$|dollar?s?|EUR|€|euro?s?)/i);
  if (amountCurrencyMatch) {
    amount = parseFloat(amountCurrencyMatch[1]);
    return { amount, op: 'EXACT' };
  }

  // $30 or 30$ style
  const dollarBefore = query.match(/\$\s*(\d+(?:\.\d+)?)/);
  const dollarAfter = query.match(/(\d+(?:\.\d+)?)\s*\$/);
  if (dollarBefore) {
    amount = parseFloat(dollarBefore[1]);
    return { amount, op: 'EXACT' };
  }
  if (dollarAfter) {
    amount = parseFloat(dollarAfter[1]);
    return { amount, op: 'EXACT' };
  }

  return { amount: null, op: null };
}

/**
 * Extract price constraints from the user query.
 * Returns JSON-only shape: priceIntent + budget (amount, currency, perPerson, op).
 * Never guesses currency; amount only from numeric + explicit currency when applicable.
 */
export function extractPriceConstraints(query: string): PriceConstraintsResult {
  if (!query || typeof query !== 'string') {
    return {
      priceIntent: null,
      budget: { amount: null, currency: null, perPerson: false, op: null },
    };
  }

  const priceIntent = detectPriceIntent(query);
  const currency = detectCurrency(query);
  const perPerson = detectPerPerson(query);
  const { amount, op } = extractAmountAndOp(query);

  return {
    priceIntent,
    budget: {
      amount,
      currency,
      perPerson,
      op: op ?? null,
    },
  };
}
