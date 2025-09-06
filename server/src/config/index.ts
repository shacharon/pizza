/**
 * Centralized configuration for the server.
 * This file consolidates settings that are likely to change between deployments
 * or need to be managed carefully, such as API keys, model names, timeouts,
 * and other magic numbers.
 */

// === LLM Provider Settings ===

/** The default LLM model to use for completions. */
export const DEFAULT_LLM_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** The maximum number of retries for a failed LLM call. */
export const LLM_RETRY_ATTEMPTS = 3;

/** The backoff delays (in ms) between retries for LLM calls. Length should match RETRY_ATTEMPTS. */
export const LLM_RETRY_BACKOFF_MS = [0, 250, 750];

/** The default timeout (in ms) for a standard LLM JSON completion call. */
export const LLM_JSON_TIMEOUT_MS = 30_000;

/** The timeout (in ms) for a simple, non-JSON LLM completion call. */
export const LLM_COMPLETION_TIMEOUT_MS = 10_000;

/** The timeout (in ms) for the very quick "is this a food?" check. */
export const LLM_FOOD_CHECK_TIMEOUT_MS = 5_000;

// === NLU Fallback Settings ===

/** A list of common Hebrew city names for the fallback NLU extractor. */
export const FALLBACK_HEBREW_CITIES = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'אשקלון', 'אשדוד', 'רמת גן'];

/** A list of common English city names for the fallback NLU extractor. */
export const FALLBACK_ENGLISH_CITIES = ['tel aviv', 'jerusalem', 'haifa', 'beer sheva', 'ashkelon', 'ashdod', 'ramat gan'];
