/**
 * Price constraints extracted from user query.
 * Returned as JSON only; no side effects.
 */

export type PriceIntent = 'CHEAP' | 'MID' | 'EXPENSIVE' | null;

export type BudgetCurrency = 'ILS' | 'USD' | 'EUR' | null;

export type BudgetOp = 'MAX' | 'EXACT' | null;

export interface Budget {
  amount: number | null;
  currency: BudgetCurrency;
  perPerson: boolean;
  op: BudgetOp;
}

export interface PriceConstraintsResult {
  priceIntent: PriceIntent;
  budget: Budget;
}

/** Price level 1–4 (Google scale). */
export type PriceLevel = 1 | 2 | 3 | 4;

export type Region = 'IL' | 'US' | 'EU';

export interface PriceLevelRange {
  min: PriceLevel;
  max: PriceLevel;
}

export interface PriceLevelRangeResult {
  priceLevelRange: PriceLevelRange | null;
}

export interface PriceLevelKeepResult {
  keep: boolean;
  reason: string;
}

export interface PriceConsistencyResult {
  consistent: boolean;
  issue: string | null;
}
