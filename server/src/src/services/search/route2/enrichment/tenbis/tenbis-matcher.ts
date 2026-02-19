/**
 * 10bis Matcher - Name Normalization and Scoring
 * 
 * Matches search results to restaurant using fuzzy name matching.
 */

import type { SearchResult } from './tenbis-search.adapter.js';

/**
 * Common suffixes to remove from restaurant names
 */
const COMMON_SUFFIXES = [
  'restaurant',
  'bar',
  'cafe',
  'grill',
  'kitchen',
  'pizzeria',
  'bistro',
  'eatery',
  'diner',
  'tavern',
  'pub',
  // Hebrew equivalents
  'מסעדה',
  'בר',
  'קפה',
  'גריל',
  'פיצריה',
  'ביסטרו',
];

/**
 * Normalize name for matching
 * - Lowercase
 * - Strip punctuation
 * - Remove common suffixes (restaurant, bar, cafe, etc.)
 * - Trim whitespace
 * 
 * @param name - Restaurant name to normalize
 * @returns Normalized name
 */
export function normalizeName(name: string): string {
  // Lowercase
  let normalized = name.toLowerCase();

  // Strip punctuation (keep letters, numbers, spaces, Hebrew, Arabic)
  normalized = normalized.replace(/[^\p{L}\p{N}\s]/gu, ' ');

  // Remove common suffixes
  for (const suffix of COMMON_SUFFIXES) {
    const pattern = new RegExp(`\\b${suffix}\\b`, 'gi');
    normalized = normalized.replace(pattern, '');
  }

  // Collapse multiple spaces and trim
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * Check if text contains target (case-insensitive, partial match)
 */
function containsText(text: string, target: string): boolean {
  return text.toLowerCase().includes(target.toLowerCase());
}

/**
 * Scoring match result
 */
export interface MatchScore {
  /**
   * Search result being scored
   */
  result: SearchResult;

  /**
   * Total score (0-100)
   */
  score: number;

  /**
   * Score breakdown for debugging
   */
  breakdown: {
    titleMatchesName: boolean;
    snippetMatchesName: boolean;
    containsCity: boolean;
  };
}

/**
 * Score a search result against restaurant criteria
 * 
 * Scoring:
 * - Title contains normalized name: +50 points (strong signal)
 * - Snippet contains normalized name: +20 points (weak signal)
 * - Title or snippet contains cityText: +30 points (medium signal)
 * 
 * @param result - Search result to score
 * @param normalizedName - Normalized restaurant name
 * @param cityText - City name (optional)
 * @returns Match score object
 */
export function scoreResult(
  result: SearchResult,
  normalizedName: string,
  cityText: string | null
): MatchScore {
  let score = 0;
  const breakdown = {
    titleMatchesName: false,
    snippetMatchesName: false,
    containsCity: false,
  };

  // Normalize search result text for matching
  const normalizedTitle = normalizeName(result.title);
  const normalizedSnippet = normalizeName(result.snippet);

  // Title contains normalized name (strong signal)
  if (containsText(normalizedTitle, normalizedName)) {
    score += 50;
    breakdown.titleMatchesName = true;
  }

  // Snippet contains normalized name (weak signal)
  if (containsText(normalizedSnippet, normalizedName)) {
    score += 20;
    breakdown.snippetMatchesName = true;
  }

  // Title or snippet contains city (medium signal)
  if (cityText) {
    const normalizedCity = normalizeName(cityText);
    const containsCityInTitle = containsText(normalizedTitle, normalizedCity);
    const containsCityInSnippet = containsText(normalizedSnippet, normalizedCity);

    if (containsCityInTitle || containsCityInSnippet) {
      score += 30;
      breakdown.containsCity = true;
    }
  }

  return {
    result,
    score,
    breakdown,
  };
}

/**
 * Match options
 */
export interface MatchOptions {
  /**
   * Minimum score threshold to accept a match
   * Default: 50 (requires at least title match OR snippet+city)
   */
  minScore?: number;
}

/**
 * Match result
 */
export interface MatchResult {
  /**
   * Match found
   */
  found: boolean;

  /**
   * 10bis URL (if found)
   */
  url: string | null;

  /**
   * Best match score (if any candidates)
   */
  bestScore?: MatchScore;

  /**
   * All scored candidates (for debugging)
   */
  allScores?: MatchScore[];
}

/**
 * Find best matching 10bis URL from search results
 * 
 * @param results - Search results from web search
 * @param restaurantName - Restaurant name
 * @param cityText - City name (optional)
 * @param options - Match options
 * @returns Match result
 */
export function findBestMatch(
  results: SearchResult[],
  restaurantName: string,
  cityText: string | null,
  options: MatchOptions = {}
): MatchResult {
  const { minScore = 50 } = options;

  // No results => NOT_FOUND
  if (results.length === 0) {
    return { found: false, url: null };
  }

  // Normalize restaurant name
  const normalizedName = normalizeName(restaurantName);

  // Score all results
  const allScores = results.map((result) =>
    scoreResult(result, normalizedName, cityText)
  );

  // Sort by score (descending)
  allScores.sort((a, b) => b.score - a.score);

  // Get best match
  const bestScore = allScores[0];

  // Guard: Should never happen due to early return above, but satisfy TypeScript
  if (!bestScore) {
    return { found: false, url: null };
  }

  // Check if best match passes threshold
  if (bestScore.score >= minScore) {
    return {
      found: true,
      url: bestScore.result.url,
      bestScore,
      allScores,
    };
  }

  // No match passes threshold => NOT_FOUND
  // Include scores for debugging (both guaranteed defined after guard)
  return {
    found: false,
    url: null,
    bestScore: bestScore,
    allScores: allScores,
  };
}
