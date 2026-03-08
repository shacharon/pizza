/**
 * Gate2 query validity – deterministic pre-check before food routing.
 * Hardens against gibberish, partial profanity, anchor-only, and mixed-intent noise.
 *
 * Outcomes: NOT_FOOD (→ STOP), ASK_CLARIFY, PASS (continue to LLM).
 * If query has food anchor but is noisy/hostile/nonsensical, prefer ASK_CLARIFY.
 */

export type Gate2ValidityOutcome = 'NOT_FOOD' | 'ASK_CLARIFY' | 'PASS';

const MIN_QUERY_LENGTH = 2;

/** Single-token queries that are only an anchor (no intent). Do not pass as FOOD solely for these. */
const ANCHOR_ONLY_TOKENS = new Set([
  'restaurant', 'restaurants', 'cafe', 'café', 'cafes',
  'מסעדה', 'מסעדות', 'בית קפה', 'מזנון'
]);

/** Single-token location anchors (city names alone = no food intent). Minimal set. */
const LOCATION_ANCHOR_ONLY_TOKENS = new Set([
  'london', 'paris', 'berlin', 'rome', 'telaviv', 'newyork', 'tokyo', 'moscow', 'amsterdam', 'dubai',
  'ירושלים', 'חיפה'
]);

/** Profanity fragments (substrings) – presence suggests hostile/noisy query. Minimal list. */
const PROFANITY_FRAGMENTS = [
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\ba+s+s+h+o+l+e+/i,
  /\bb+i+t+c+h+/i,
  /\bfck\b/i,
  /\bsht\b/i,
  /\bwtf\b/i,
  /\bstf[uü]/i,
  /[\u05d0-\u05ea]*\u05e9\u05d8[\u05d0-\u05ea]*/,
  /\u05e2\u05e1\u05d0\u05e1\u05dc/,  // Hebrew hostile fragment
  /\u05de\u05e4\u05d2\u05dc/         // Hebrew hostile fragment
];

/** Vowel letters (Latin + Hebrew) for gibberish detection. */
const LATIN_VOWELS = /[aeiouyAEIOUY]/;
const HEBREW_VOWELS = /[\u05B0-\u05BC\u05C7]/;  // niqqud
const HEBREW_LETTERS = /[\u05D0-\u05EA]/;

function hasVowel(s: string): boolean {
  if (LATIN_VOWELS.test(s)) return true;
  if (HEBREW_VOWELS.test(s)) return true;
  if (HEBREW_LETTERS.test(s) && s.length <= 5) return true; // short Hebrew word assume valid
  return false;
}

function tokenize(q: string): string[] {
  return q.trim().split(/\s+/).filter(Boolean);
}

/**
 * Returns true if the query looks like gibberish (consonant-heavy tokens, no coherent words).
 */
function looksGibberish(q: string): boolean {
  const tokens = tokenize(q);
  if (tokens.length === 0) return true;
  let junkCount = 0;
  for (const t of tokens) {
    if (t.length >= 4 && !hasVowel(t)) junkCount++;
    else if (t.length >= 6 && /^[a-zA-Z]+$/.test(t) && !LATIN_VOWELS.test(t)) junkCount++;
  }
  return tokens.length >= 2 && junkCount >= 2 && junkCount >= tokens.length / 2;
}

/**
 * Returns true if query contains a profanity fragment.
 */
function hasProfanityFragment(q: string): boolean {
  const normalized = q.trim();
  return PROFANITY_FRAGMENTS.some(r => r.test(normalized));
}

/**
 * Returns true if query is only a single anchor token (e.g. "restaurant", "מסעדה", "london").
 */
function isAnchorOnly(q: string): boolean {
  const tokens = tokenize(q);
  if (tokens.length !== 1) return false;
  const lower = tokens[0].toLowerCase().replace(/\s/g, '');
  const raw = tokens[0];
  return (
    ANCHOR_ONLY_TOKENS.has(lower) ||
    ANCHOR_ONLY_TOKENS.has(raw) ||
    LOCATION_ANCHOR_ONLY_TOKENS.has(lower) ||
    LOCATION_ANCHOR_ONLY_TOKENS.has(raw)
  );
}

/**
 * Crude check: query contains at least one likely food term (so we prefer ASK_CLARIFY over NOT_FOOD when mixed).
 */
function hasLikelyFoodTerm(q: string): boolean {
  const lower = q.toLowerCase();
  const terms = ['pizza', 'sushi', 'burger', 'pasta', 'salad', 'food', 'eat', 'hungry', 'פיצה', 'סושי', 'מסעד', 'אוכל', 'לאכול', 'בורגר'];
  return terms.some(t => lower.includes(t));
}

/** Non-food venue/place terms (Hebrew + English). If combined with food anchor → mixed intent. */
const NON_FOOD_VENUE_TOKENS = new Set([
  'מוסך', 'חנות', 'מרפאה', 'בנק', 'garage', 'pharmacy', 'clinic', 'bank'
]);

/** Food anchor terms (venue/cuisine) used to detect "non-food venue + food" contradiction. */
const FOOD_ANCHOR_SUBSTRINGS = ['מסעדה', 'מסעדות', 'restaurant', 'restaurants', 'cafe', 'פיצה', 'סושי', 'בית קפה'];

function hasNonFoodVenueToken(q: string): boolean {
  const tokens = tokenize(q);
  return tokens.some(t => NON_FOOD_VENUE_TOKENS.has(t) || NON_FOOD_VENUE_TOKENS.has(t.toLowerCase()));
}

function hasFoodAnchor(q: string): boolean {
  return FOOD_ANCHOR_SUBSTRINGS.some(anchor => q.includes(anchor));
}

/** Mixed intent: non-food venue + food anchor (e.g. "מוסך מסעדה בתל אביב") → ASK_CLARIFY. */
function hasNonFoodVenueWithFoodAnchor(q: string): boolean {
  return hasNonFoodVenueToken(q) && hasFoodAnchor(q);
}

/**
 * Deterministic query validity check before food routing.
 * Use this before calling the Gate LLM; if not PASS, return the corresponding route and skip LLM.
 */
export function getGate2QueryValidityPreDecision(query: string): Gate2ValidityOutcome {
  const q = (query || '').trim();
  if (q.length < MIN_QUERY_LENGTH) return 'ASK_CLARIFY';

  if (isAnchorOnly(q)) return 'ASK_CLARIFY';

  if (looksGibberish(q)) return 'ASK_CLARIFY';

  if (hasProfanityFragment(q)) {
    return hasLikelyFoodTerm(q) ? 'ASK_CLARIFY' : 'NOT_FOOD';
  }

  if (hasNonFoodVenueWithFoodAnchor(q)) return 'ASK_CLARIFY';

  return 'PASS';
}

/**
 * Returns true if we should override an LLM YES to ASK_CLARIFY (query has noise/hostility indicators).
 * Call after LLM returns CONTINUE; if true, treat as ASK_CLARIFY instead of FOOD.
 */
export function shouldOverrideFoodToClarify(query: string): boolean {
  const q = (query || '').trim();
  if (q.length < MIN_QUERY_LENGTH) return true;
  if (looksGibberish(q)) return true;
  if (hasProfanityFragment(q)) return true;
  if (hasNonFoodVenueWithFoodAnchor(q)) return true;
  return false;
}
