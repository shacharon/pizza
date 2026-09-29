/**
 * Gate2 query validity – profanity check before food routing.
 * A swear word with a food term asks for clarification. A swear word alone is not food.
 * Everything else goes to the model.
 */

export type Gate2ValidityOutcome = 'NOT_FOOD' | 'ASK_CLARIFY' | 'PASS';

/**
 * Profanity in the site languages: en, he, ar, ru, fr, es, de, it, am.
 * Latin words use a boundary so they do not match inside a longer word.
 */
const PROFANITY_FRAGMENTS: RegExp[] = [
  // English
  /\bf+u+c+k+/i,
  /\bs+h+i+t+/i,
  /\ba+s+s+h+o+l+e+/i,
  /\bb+i+t+c+h+/i,
  /\bfck\b/i,
  /\bsht\b/i,
  /\bwtf\b/i,
  /\bstf[uü]/i,
  /\bbastard\b/i,
  /\bcunt\b/i,
  /\bdick\b/i,
  /\bmotherfucker\b/i,
  // French, Spanish, German, Italian
  /\bputain\b/i,
  /\bconnard\b/i,
  /\bsalope\b/i,
  /\bencul/i,
  /\bmerde\b/i,
  /\bmierda\b/i,
  /\bcabr[oó]n\b/i,
  /\bjoder\b/i,
  /\bcoño\b/i,
  /\bputa\b/i,
  /\bschei[sß]+e\b/i,
  /\bfotze\b/i,
  /\bhurensohn\b/i,
  /\barschloch\b/i,
  /\bcazzo\b/i,
  /\bvaffanculo\b/i,
  /\bstronzo\b/i,
  /\bputtana\b/i,
  // Hebrew
  /זין/,
  /זיין/,
  /כוסאמק/,
  /קוסאמק/,
  /מניאק/,
  /תזדיין/,
  /בן זונה/,
  /שרמוטה/,
  /עסאסל/,
  /מפגל/,
  // Arabic
  /شرموط/,
  /كسمك/,
  /منيوك/,
  /عرص/,
  // Russian
  /хуй/,
  /пизд/,
  /ебан/,
  /бляд/,
  /сука/,
  /мудак/,
  // Amharic
  /ሻርሙጣ/,
  /ቂጥ/
];

function hasProfanityFragment(q: string): boolean {
  const normalized = q.trim();
  return PROFANITY_FRAGMENTS.some((pattern) => pattern.test(normalized));
}

/** Food words so a swear word next to a meal still asks what to search, instead of stopping. */
function hasLikelyFoodTerm(q: string): boolean {
  const lower = q.toLowerCase();
  const terms = [
    'pizza', 'sushi', 'burger', 'pasta', 'salad', 'food', 'eat', 'hungry',
    'restaurant', 'cafe',
    'פיצה', 'סושי', 'מסעד', 'אוכל', 'לאכול', 'בורגר',
    'مطعم', 'بيتزا',
    'пицц', 'ресторан',
    'comida', 'restaurante',
    'essen', 'ristorante'
  ];
  return terms.some((term) => lower.includes(term));
}

/**
 * Profanity check before the Gate model.
 * PASS means the model still classifies the query.
 */
export function getGate2QueryValidityPreDecision(query: string): Gate2ValidityOutcome {
  const q = (query || '').trim();
  if (!q || !hasProfanityFragment(q)) return 'PASS';
  return hasLikelyFoodTerm(q) ? 'ASK_CLARIFY' : 'NOT_FOOD';
}

/** After a food YES, a swear word still becomes a clarification. */
export function shouldOverrideFoodToClarify(query: string): boolean {
  return hasProfanityFragment((query || '').trim());
}
