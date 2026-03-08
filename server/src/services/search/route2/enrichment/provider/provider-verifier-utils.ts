/**
 * Shared provider verifier utilities: name normalization and Jaccard token overlap.
 * Used by Wolt, 10bis, and Mishloha verifiers.
 *
 * - Robust normalization: strip diacritics/punctuation, collapse whitespace, map "|" "-" "_" to space, remove city/brand suffixes.
 * - Jaccard token overlap: |A ∩ B| / |A ∪ B|.
 * - Relaxed rule: accept if (nameScore >= 0.65 AND cityMatch) OR (nameScore >= 0.80 AND same metro alias).
 * - City alias map: "תל אביב" == "Tel Aviv" == "tel-aviv" (via toCanonicalCity).
 */

/** When true, verifiers log one structured DEBUG line before decision (providerId, tokens, nameScore, etc.). */
export const PROVIDER_VERIFIER_DEBUG = process.env.PROVIDER_VERIFIER_DEBUG === '1';

/** Decode path for scoring; Hebrew in URL is often percent-encoded. */
export function safeDecodePath(pathRaw: string): string {
  if (!pathRaw || typeof pathRaw !== 'string') return pathRaw ?? '';
  try {
    return decodeURIComponent(pathRaw);
  } catch {
    return pathRaw;
  }
}

/** Accept when city matches (canonical) and name score is at least this. */
export const NAME_SCORE_WITH_CITY_MATCH = 0.65;
/** Accept when same metro alias (canonical match) and name score is at least this (even if raw city strings differ). */
export const NAME_SCORE_METRO_ALIAS = 0.8;

/** Verifier: nameScore >= this to VERIFIED (title/snippet primary; path secondary only if primary passed). */
export const NAME_SCORE_VERIFIED_THRESHOLD = 0.65;
/** Verifier: cityScore >= this when cityText exists (from title/snippet). */
export const CITY_SCORE_MIN_THRESHOLD = 0.6;
/** Relaxed city threshold; Tel Aviv alias bypass when city is tel_aviv. */
export const CITY_SCORE_MIN_RELAXED = 0.4;
/** When path is strict-allowed (domain+path valid), nameScore >= this can VERIFY. */
export const NAME_SCORE_PATH_STRICT_THRESHOLD = 0.55;

/** @deprecated Use NAME_SCORE_VERIFIED_THRESHOLD / scoreNameCandidate; kept for tests. */
export const NAME_SCORE_MIN_THRESHOLD = 0.35;

/** Noise tokens to remove from name (HE/EN) before scoring. */
export const VERIFIER_NOISE_TOKENS = new Set([
  'restaurant',
  'delivery',
  'order',
  'wolt',
  'menu',
  '10bis',
  'at',
  'restaurants',
  'מישלוחה',
  'תפריט',
  'מסעדה',
  'מסעדת', // e.g. "מסעדת פאסטל" -> score vs "pastella"
  'בר',
  'the',
]);

/**
 * Bilingual token aliases for name/city matching (HE <-> EN).
 * Each key normalizes to lowercase; values are alternative forms (same script or transliteration).
 */
const TOKEN_ALIASES: Record<string, string[]> = {
  'tel aviv': ['תל אביב', 'תא', 'telaviv'],
  'תל אביב': ['tel aviv', 'telaviv'],
  'תא': ['tel aviv', 'תל אביב'],
  'yafo': ['יפו', 'jaffa'],
  'יפו': ['yafo', 'jaffa'],
  'jaffa': ['יפו', 'yafo'],
  'cafe': ['קפה', 'coffee', 'café'],
  'קפה': ['cafe', 'coffee'],
  'coffee': ['קפה', 'cafe'],
  'jerusalem': ['ירושלים'],
  'ירושלים': ['jerusalem'],
  'haifa': ['חיפה'],
  'חיפה': ['haifa'],
  'ramat gan': ['רמת גן'],
  'רמת גן': ['ramat gan'],
};

/** City/brand suffix patterns to strip (regex, case-insensitive). Trailing " - Tel Aviv", " | Wolt", etc. */
const CITY_BRAND_SUFFIX = /\s*[|\-–—]\s*(?:wolt|10bis|מישלוחה|תל אביב|tel aviv|jerusalem|חיפה|הרצליה|רמת גן|ראשון לציון|באר שבע|פתח תקווה|נתניה|אשדוד|חולון|בת ים|כפר סבא|רעננה|מודיעין|קריית|השומרון|יהודה|הנגב)$/iu;

/**
 * Strip diacritics for Latin script; leave Hebrew as-is.
 */
function removeDiacritics(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/** Hebrew letter to Latin (ASCII) for name matching only. Includes final forms. Alef (א) as 'a' for e.g. פאסטל→pastl. */
const HEBREW_TO_LATIN: Record<string, string> = {
  '\u05D0': 'a', '\u05D1': 'b', '\u05D2': 'g', '\u05D3': 'd', '\u05D4': 'h',
  '\u05D5': 'o', '\u05D6': 'z', '\u05D7': 'h', '\u05D8': 't', '\u05D9': 'y',
  '\u05DB': 'k', '\u05DA': 'k', '\u05DC': 'l', '\u05DE': 'm', '\u05DD': 'm',
  '\u05E0': 'n', '\u05DF': 'n', '\u05E1': 's', '\u05E2': 'a', '\u05E4': 'p',
  '\u05E3': 'p', '\u05E6': 'tz', '\u05E5': 'tz', '\u05E7': 'k', '\u05E8': 'r',
  '\u05E9': 'sh', '\u05EA': 't',
};

function hasHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}

/**
 * Transliterate Hebrew token to Latin for overlap with English names (e.g. קלארו → claro).
 * Uses simple map; ו as 'o' by default; ו as 'u' for loanwords (e.g. יוליה→yulia) is added as variant in toTokenSet.
 */
function transliterateHebrewToLatin(token: string, vavAs: 'o' | 'u' = 'o'): string {
  const vav = vavAs === 'u' ? 'u' : (HEBREW_TO_LATIN['\u05D5'] ?? 'o');
  let out = '';
  for (const ch of token) {
    if (ch === '\u05D5') {
      out += vav;
      continue;
    }
    const mapped = HEBREW_TO_LATIN[ch];
    if (mapped) out += mapped;
    else if (/[\u0590-\u05FF]/.test(ch)) out += ch;
    else out += ch;
  }
  return out;
}

/** Add Latin variants for Jaccard: e.g. "klaro" → also add "claro" for ק/כ→c in loanwords. */
function addLatinVariants(tokens: Set<string>): void {
  const extra = new Set<string>();
  for (const t of tokens) {
    if (t.length > 0 && (t[0] === 'k' || t[0] === 'q') && /^[a-z]+$/.test(t)) {
      extra.add('c' + t.slice(1));
    }
  }
  extra.forEach((x) => tokens.add(x));
}

/**
 * Chars to map to space for URL/path and name (keeps Hebrew + digits).
 * Replaces _ - . / & + and %20 so encoded slugs normalize correctly.
 */
const SPACE_CHARS = /[_\-.\/&+\s\u00A0]/g;
/** Apostrophe and Hebrew geresh: normalize so נינג'ה and נינגה match. */
const APOSTROPHE_OR_GERESH = /['\u05F3]/g;

/** Safe decode for name strings that may be percent-encoded (e.g. from URLs). */
function safeDecodeName(s: string): string {
  if (!s || typeof s !== 'string') return '';
  try {
    return decodeURIComponent(String(s));
  } catch {
    return String(s);
  }
}

/**
 * Robust normalization for HE/EN name scoring. Keeps letters/digits from BOTH Hebrew and Latin.
 * - Safe decode (percent-encoded); lowercase Latin; trim
 * - Replace _ - . / & + with space; remove apostrophe/geresh; other non-letter/digit -> space
 * - Collapse spaces, remove city/brand suffix and noise tokens
 * - Do NOT drop tokens because of non-ASCII (keep all tokens with length > 0 except noise)
 */
export function normalizeNameForVerifier(s: string): string {
  if (!s || typeof s !== 'string') return '';
  let t = removeDiacritics(safeDecodeName(String(s)).trim())
    .toLowerCase()
    .replace(SPACE_CHARS, ' ')
    .replace(APOSTROPHE_OR_GERESH, '')
    .replace(/\|/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  t = t.replace(CITY_BRAND_SUFFIX, '').trim();
  const tokens = t.split(/\s+/).filter((x) => x.length > 0 && !VERIFIER_NOISE_TOKENS.has(x));
  return tokens.join(' ');
}

/**
 * Jaccard token overlap: |A ∩ B| / |A ∪ B|.
 * Returns 0 if either set is empty; otherwise intersection size / union size.
 */
export function jaccardTokenOverlap(normalizedA: string, normalizedB: string): number {
  const setA = toTokenSet(normalizedA);
  const setB = toTokenSet(normalizedB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Token set for Jaccard: each token plus, for Hebrew tokens, Latin transliteration (ו as o and as u)
 * and k/c variant so that e.g. "קלארו" matches "claro" and "יוליה" matches "yulia".
 */
function toTokenSet(normalized: string): Set<string> {
  if (!normalized) return new Set();
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const set = new Set<string>(tokens);
  for (const t of tokens) {
    if (hasHebrew(t)) {
      const latinO = transliterateHebrewToLatin(t, 'o');
      if (latinO) set.add(latinO);
      const latinU = transliterateHebrewToLatin(t, 'u');
      if (latinU && latinU !== latinO) set.add(latinU);
    }
  }
  addLatinVariants(set);
  return set;
}

/** Token list from normalized string (for DEBUG and slug_token_match). Keeps all non-empty tokens. */
export function tokensFromNormalized(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * Bilingual normalization: lower, trim, strip diacritics, unify quotes/dashes, remove punctuation.
 * Keeps Hebrew + Latin letters and digits. Same as normalizeNameForVerifier (exported alias).
 */
export function normalizeName(s: string): string {
  return normalizeNameForVerifier(s);
}

/**
 * Build token set from normalized string including transliterations (HE->Latin) and alias map.
 * Used so that "תל אביב" matches "tel aviv" and "פאסטל" matches "pastella".
 */
function tokenSetWithAliasesAndTranslit(normalized: string): Set<string> {
  const set = new Set<string>();
  const tokens = tokensFromNormalized(normalized);
  for (const t of tokens) {
    set.add(t);
    const lower = t.toLowerCase();
    if (lower !== t) set.add(lower);
    const aliases = TOKEN_ALIASES[lower] ?? TOKEN_ALIASES[t];
    if (aliases) for (const a of aliases) set.add(a.toLowerCase());
    if (hasHebrew(t)) {
      const latO = transliterateHebrewToLatin(t, 'o').toLowerCase().replace(/[^a-z]/g, '');
      if (latO) set.add(latO);
      const latU = transliterateHebrewToLatin(t, 'u').toLowerCase().replace(/[^a-z]/g, '');
      if (latU && latU !== latO) set.add(latU);
    }
  }
  addLatinVariants(set);
  return set;
}

/** Used fields in scoring (for debug logs). */
export type UsedFields = ('title' | 'snippet' | 'path')[];

/** Result of name scoring: primary = title+snippet must have >=1 match; path only counts if primary passed. */
export interface ScoreNameResult {
  nameScore: number;
  primaryMatch: boolean;
  matchedTokens: string[];
  usedFields: UsedFields;
  tokensRestaurant: string[];
  tokensCandidate: string[];
}

/**
 * Score candidate name against restaurant name.
 * Primary: candidate.title + candidate.snippet must contain >=1 normalized token from restaurantName (or transliteration/alias).
 * Secondary: urlPath token match only if primary passed. Threshold for VERIFIED: nameScore >= 0.65.
 */
export function scoreNameCandidate(
  candidate: { title?: string | null; snippet?: string | null; pathSlug?: string },
  restaurantName: string
): ScoreNameResult {
  const restaurantNorm = normalizeNameForVerifier(restaurantName);
  const tokensRestaurant = tokensFromNormalized(restaurantNorm);
  const restaurantSet = tokenSetWithAliasesAndTranslit(restaurantNorm);
  const usedFields: UsedFields = [];
  let primaryText = [candidate.title ?? '', candidate.snippet ?? ''].map((s) => String(s).trim()).filter(Boolean).join(' ');
  let primaryNorm = normalizeNameForVerifier(primaryText);
  let primaryTokens = tokensFromNormalized(primaryNorm);
  const pathOnly = !primaryText.trim() && (candidate.pathSlug ?? '').trim().length > 0;
  if (pathOnly && candidate.pathSlug?.trim()) {
    primaryNorm = normalizeNameForVerifier(candidate.pathSlug);
    primaryTokens = tokensFromNormalized(primaryNorm);
    usedFields.push('path');
  } else if (primaryText.trim()) {
    if (candidate.title?.trim()) usedFields.push('title');
    if (candidate.snippet?.trim()) usedFields.push('snippet');
  }
  const primarySet = new Set(primaryTokens);
  for (const a of primaryTokens) {
    const aliases = TOKEN_ALIASES[a.toLowerCase()];
    if (aliases) for (const x of aliases) primarySet.add(x.toLowerCase());
  }
  let primaryMatch = false;
  const matchedTokens: string[] = [];
  for (const t of primarySet) {
    if (restaurantSet.has(t) || restaurantSet.has(t.toLowerCase())) {
      primaryMatch = true;
      matchedTokens.push(t);
    }
  }
  for (const t of tokensRestaurant) {
    if (primarySet.has(t) || primarySet.has(t.toLowerCase())) matchedTokens.push(t);
  }
  if (!primaryMatch && primaryTokens.length > 0) {
    for (const pt of primaryTokens) {
      if (hasHebrew(pt)) {
        const latO = transliterateHebrewToLatin(pt, 'o').toLowerCase().replace(/[^a-z]/g, '');
        if (latO && restaurantSet.has(latO)) { primaryMatch = true; matchedTokens.push(latO); }
        const latU = transliterateHebrewToLatin(pt, 'u').toLowerCase().replace(/[^a-z]/g, '');
        if (latU && latU !== latO && restaurantSet.has(latU)) { primaryMatch = true; matchedTokens.push(latU); }
      }
    }
    // Path-only: path token may contain transliteration of restaurant name (e.g. pastella contains pastl from פאסטל)
    if (!primaryMatch && pathOnly) {
      for (const pt of primaryTokens) {
        const ptLower = pt.toLowerCase().replace(/[^a-z]/g, '');
        if (ptLower.length < 2) continue;
        for (const rt of tokensRestaurant) {
          if (hasHebrew(rt)) {
            const latO = transliterateHebrewToLatin(rt, 'o').toLowerCase().replace(/[^a-z]/g, '');
            if (latO.length >= 2 && (ptLower.includes(latO) || latO.includes(ptLower))) {
              primaryMatch = true;
              matchedTokens.push(latO);
              break;
            }
            const latU = transliterateHebrewToLatin(rt, 'u').toLowerCase().replace(/[^a-z]/g, '');
            if (latU.length >= 2 && latU !== latO && (ptLower.includes(latU) || latU.includes(ptLower))) {
              primaryMatch = true;
              matchedTokens.push(latU);
              break;
            }
          } else {
            const rtLower = rt.toLowerCase();
            if (rtLower.length >= 2 && (ptLower.includes(rtLower) || rtLower.includes(ptLower))) {
              primaryMatch = true;
              matchedTokens.push(rtLower);
              break;
            }
          }
        }
        if (primaryMatch) break;
      }
    }
  }
  let candidateNorm = primaryNorm;
  let tokensCandidate = primaryTokens;
  if (primaryMatch && candidate.pathSlug?.trim() && !pathOnly) {
    const pathNorm = normalizeNameForVerifier(candidate.pathSlug);
    if (pathNorm) {
      usedFields.push('path');
      candidateNorm = candidateNorm ? `${candidateNorm} ${pathNorm}` : pathNorm;
      tokensCandidate = [...primaryTokens, ...tokensFromNormalized(pathNorm)];
    }
  }
  const candidateSet = tokenSetWithAliasesAndTranslit(candidateNorm);
  let intersection = 0;
  for (const t of restaurantSet) {
    if (candidateSet.has(t) || candidateSet.has(t.toLowerCase())) intersection++;
  }
  const union = restaurantSet.size + candidateSet.size - intersection;
  const nameScore = union === 0 ? 0 : primaryMatch ? intersection / union : 0;
  return {
    nameScore,
    primaryMatch,
    matchedTokens: [...new Set(matchedTokens)],
    usedFields,
    tokensRestaurant,
    tokensCandidate,
  };
}

/**
 * Bilingual "A | B" names: split restaurant name by | and return the best score across variants.
 * Use this when restaurantName may contain "משייה | Mashya" so slug "mashya" or "meshya" matches one variant.
 */
export function scoreNameCandidateBilingual(
  candidate: { title?: string | null; snippet?: string | null; pathSlug?: string },
  restaurantName: string
): ScoreNameResult {
  const parts = String(restaurantName ?? '')
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return scoreNameCandidate(candidate, restaurantName);
  let best: ScoreNameResult = scoreNameCandidate(candidate, parts[0]!);
  for (let i = 1; i < parts.length; i++) {
    const next = scoreNameCandidate(candidate, parts[i]!);
    if (next.nameScore > best.nameScore || (next.primaryMatch && !best.primaryMatch)) {
      best = next;
    }
  }
  return best;
}

/**
 * Extract candidate name from URL path for a given provider (decode + hyphens to spaces).
 * Used for logging and for path-as-primary scoring when title/snippet are missing.
 */
export function extractCandidateNameFromUrl(
  providerId: 'wolt' | '10bis' | 'mishloha',
  url: string
): string {
  try {
    const path = safeDecodePath(new URL(url).pathname);
    const pathLower = path.toLowerCase();
    if (providerId === 'wolt') {
      const seg = pathLower.includes('/restaurant/') ? '/restaurant/' : pathLower.includes('/venue/') ? '/venue/' : null;
      if (seg) {
        const idx = pathLower.indexOf(seg);
        const after = path.slice(idx + seg.length).replace(/\/+$/, '');
        const slug = after.split('/')[0]?.replace(/-/g, ' ') ?? '';
        return slug;
      }
    }
    if (providerId === '10bis') {
      // Last slug segment (path already URL-decoded): '-' and '%20' -> space, remove digits-only tokens
      const segments = path.replace(/\/+$/, '').split('/').filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (!lastSegment) return '';
      const withSpaces = lastSegment.replace(/-/g, ' ').replace(/%20/g, ' ');
      const tokens = withSpaces.split(/\s+/).filter((t) => t && !/^\d+$/.test(t));
      return tokens.join(' ').trim();
    }
    if (providerId === 'mishloha') {
      // Use decoded path segment after /now/r/ or /r/ (URL-decoded, replace '-' and '%20' with space)
      const afterR = pathLower.includes('/now/r/')
        ? path.slice(pathLower.indexOf('/now/r/') + 7)
        : pathLower.includes('/r/')
          ? path.slice(pathLower.indexOf('/r/') + 3)
          : '';
      const segment = afterR.replace(/\/+$/, '').split('/')[0] ?? '';
      if (!segment || segment === 'inactive') return '';
      return segment.replace(/-/g, ' ').replace(/%20/g, ' ').trim();
    }
  } catch {
    // ignore
  }
  return '';
}

/**
 * Score city from candidate title/snippet only. Requires >= 0.6 when cityText exists.
 * Returns 1 if canonical match, 0.6 if candidate city unknown, 0 if mismatch.
 */
export function scoreCityCandidate(
  candidate: { title?: string | null; snippet?: string | null },
  cityText: string | null | undefined
): number {
  if (cityText == null || String(cityText).trim() === '') return 1;
  const text = [candidate.title ?? '', candidate.snippet ?? ''].join(' ').trim();
  if (!text) return 0.6;
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}\s\-]/gu, ' ').replace(/\s+/g, ' ').trim();
  const parts = normalized.split(/\s*[-–—|]\s*/);
  let candidateCity: string | null = null;
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]?.trim();
    if (last && last.length >= 2 && last.length <= 50) candidateCity = last;
  }
  const inMatch = normalized.match(/\bin\s+([a-z\u0590-\u05ff\s\-]{2,50}?)(?:\s*[.,]|$)/);
  if (inMatch?.[1]) candidateCity = inMatch[1].trim().replace(/\s+/g, ' ') || candidateCity;
  const expected = toCanonicalCity(String(cityText).trim());
  if (candidateCity == null || candidateCity === '') return 0.6;
  const candidateCanonical = toCanonicalCity(candidateCity);
  if (candidateCanonical == null) return 0.6;
  return expected === candidateCanonical ? 1 : 0;
}

/** Whether chars of `a` appear in `b` in order (e.g. "pstl" in "pastella"). */
function isSubsequence(a: string, b: string): boolean {
  let j = 0;
  for (let i = 0; i < a.length && j < b.length; i++) {
    while (j < b.length && b[j] !== a[i]) j++;
    if (j >= b.length) return false;
    j++;
  }
  return true;
}

/**
 * Safe relax: decoded path contains at least 2 distinct tokens from restaurant name.
 * When URL has a single token, also accept if any restaurant token (or its Latin transliteration)
 * is a substring of the URL token (e.g. "pastella" contains "pastl" from פאסטל), or a subsequence (e.g. "pstl" in "pastella").
 */
export function slugTokenMatch(restaurantNorm: string, urlNameNorm: string): boolean {
  const restTokens = tokensFromNormalized(restaurantNorm);
  const urlTokenList = tokensFromNormalized(urlNameNorm);
  const urlTokens = new Set(urlTokenList);
  if (urlTokens.size === 0) return false;
  let count = 0;
  for (const t of restTokens) {
    if (urlTokens.has(t)) count++;
    if (count >= 2) return true;
  }
  if (urlTokenList.length === 1 && restTokens.length >= 1) {
    const urlToken = urlTokenList[0].toLowerCase();
    for (const t of restTokens) {
      if (hasHebrew(t)) {
        const latO = transliterateHebrewToLatin(t, 'o').toLowerCase().replace(/[^a-z]/g, '');
        if (latO.length >= 2 && (urlToken.includes(latO) || latO.includes(urlToken))) return true;
        if (latO.length >= 2 && isSubsequence(latO, urlToken)) return true;
        const latU = transliterateHebrewToLatin(t, 'u').toLowerCase().replace(/[^a-z]/g, '');
        if (latU.length >= 2 && latU !== latO && (urlToken.includes(latU) || latU.includes(urlToken))) return true;
        if (latU.length >= 2 && latU !== latO && isSubsequence(latU, urlToken)) return true;
      } else if (t.length >= 2 && (urlToken.includes(t.toLowerCase()) || t.toLowerCase().includes(urlToken))) return true;
    }
  }
  return false;
}

/** Payload for the single DEBUG log event emitted right before rejection. */
export interface ProviderVerifierScoringLogPayload {
  providerId: string;
  placeId?: string;
  restaurantName: string;
  cityText: string;
  candidate: {
    url: string;
    host: string;
    path: string;
    pathDecoded: string;
    title?: string;
    snippet?: string;
  };
  normRestaurant: string;
  normCandidateTitle: string;
  normCandidatePath: string;
  tokensRestaurant: string[];
  tokensCandidateTitle: string[];
  tokensCandidatePath: string[];
  nameScore: number;
  cityScore: number;
  decisionReason: string;
}

/** Emit a single DEBUG log event right before rejection. No-op when PROVIDER_VERIFIER_DEBUG is false. */
export function logProviderVerifierScoring(payload: ProviderVerifierScoringLogPayload): void {
  if (!PROVIDER_VERIFIER_DEBUG) return;
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: 'provider_verifier_scoring',
      ...payload,
    })
  );
}

/** Payload for provider_verifier_scores (P0): why verification passed or failed. */
export interface ProviderVerifierScoresLogPayload {
  provider: string;
  restaurantNameRaw: string;
  restaurantNameNorm: string;
  candidateNameRaw: string;
  candidateNameNorm: string;
  nameScore: number;
  cityText: string;
  cityNorm: string;
  cityScore: number;
  url: string;
  verified: boolean;
  rejectionReason?: string;
}

/** Log provider_verifier_scores (P0) for every verification so we can see why NOT_FOUND vs FOUND. */
export function logProviderVerifierScores(payload: ProviderVerifierScoresLogPayload): void {
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: 'provider_verifier_scores',
      ...payload,
    })
  );
}

/** Canonical city keys for matching (e.g. "tel_aviv", "jerusalem"). */
export type CanonicalCity = 'tel_aviv' | 'jerusalem' | 'haifa' | 'herzliya' | 'ramat_gan' | 'rishon' | 'beer_sheva' | 'petah_tikva' | 'netanya' | 'ashdod' | 'holon' | 'bat_yam' | 'kfar_saba' | 'raanana' | 'modiin' | 'unknown';

/**
 * City canonicalization map: common variants (HE/EN, with/without punctuation) -> canonical key.
 * Used to treat "ת״א", "תל אביב", "תל-אביב", "Tel Aviv", "Tel-Aviv" as the same (tel_aviv).
 * Missing city in URL should be treated as "unknown" (do not fail; at most lower confidence).
 */
const CITY_CANONICAL_MAP: Record<string, CanonicalCity> = {
  'ת״א': 'tel_aviv',
  'תא': 'tel_aviv',
  'תל אביב': 'tel_aviv',
  'תל-אביב': 'tel_aviv',
  'תל אביב יפו': 'tel_aviv',
  'tel aviv': 'tel_aviv',
  'tel-aviv': 'tel_aviv',
  'telaviv': 'tel_aviv',
  'tlv': 'tel_aviv',
  'ירושלים': 'jerusalem',
  'jerusalem': 'jerusalem',
  'חיפה': 'haifa',
  'haifa': 'haifa',
  'הרצליה': 'herzliya',
  'herzliya': 'herzliya',
  'הרצליה פיתוח': 'herzliya',
  'רמת גן': 'ramat_gan',
  'ramat gan': 'ramat_gan',
  'ramat-gan': 'ramat_gan',
  'ראשון לציון': 'rishon',
  'rishon': 'rishon',
  'rishon lezion': 'rishon',
  'באר שבע': 'beer_sheva',
  'beer sheva': 'beer_sheva',
  'beer-sheva': 'beer_sheva',
  'פתח תקווה': 'petah_tikva',
  'petah tikva': 'petah_tikva',
  'נתניה': 'netanya',
  'netanya': 'netanya',
  'אשדוד': 'ashdod',
  'ashdod': 'ashdod',
  'חולון': 'holon',
  'holon': 'holon',
  'בת ים': 'bat_yam',
  'bat yam': 'bat_yam',
  'כפר סבא': 'kfar_saba',
  'kfar saba': 'kfar_saba',
  'רעננה': 'raanana',
  'raanana': 'raanana',
  'מודיעין': 'modiin',
  'modiin': 'modiin',
  'מודיעין מכבים רעות': 'modiin',
  // Wolt-style slug suffixes (area/metro)
  'rishon lezion hashfela area': 'rishon',
};

/** Normalize for lookup: lowercase, collapse spaces, strip punctuation. */
function normalizeCityInput(s: string): string {
  if (!s || typeof s !== 'string') return '';
  return s
    .toLowerCase()
    .replace(/[\s\-–—]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim();
}

/**
 * Map a raw city string (HE/EN) to a canonical key, or null if not found.
 * City alias map: "תל אביב" == "Tel Aviv" == "tel-aviv" -> tel_aviv (same metro).
 * Caller should treat null as "unknown" (do not fail verification).
 */
export function toCanonicalCity(raw: string | null | undefined): CanonicalCity | null {
  if (raw == null || raw === '') return null;
  const key = normalizeCityInput(raw);
  if (!key) return null;
  return CITY_CANONICAL_MAP[key] ?? null;
}

/**
 * Verifier pass rule: accept if (nameScore >= 0.65 AND cityMatch) OR (nameScore >= 0.80 AND same metro alias).
 * sameMetroAlias is true when both sides have canonical city and they match (e.g. תל אביב vs tel-aviv).
 */
export function passesVerifierNameCityRule(
  nameScore: number,
  cityMatch: boolean
): boolean {
  return (
    (nameScore >= NAME_SCORE_WITH_CITY_MATCH && cityMatch) ||
    (nameScore >= NAME_SCORE_METRO_ALIAS && cityMatch)
  );
}
