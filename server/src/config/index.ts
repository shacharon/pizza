/**
 * Centralized configuration for the server.
 * This file consolidates settings that are likely to change between deployments
 * or need to be managed carefully, such as API keys, model names, timeouts,
 * and other magic numbers.
 */

// === LLM Provider Settings ===

/** The default (high-quality) LLM model to use for complex tasks like slot extraction. */
export const DEFAULT_LLM_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/** A cheaper, faster LLM model for simple, high-frequency tasks like classification. */
export const FAST_LLM_MODEL = process.env.FAST_OPENAI_MODEL || 'gpt-4o-mini';

/** Specific model override for the NLU Classifier Agent (falls back to FAST_LLM_MODEL). */
export const NLU_CLASSIFIER_MODEL = process.env.NLU_CLASSIFIER_MODEL || FAST_LLM_MODEL;

/** Specific model override for the NLU Extractor Agent (falls back to DEFAULT_LLM_MODEL). */
export const NLU_EXTRACTOR_MODEL = process.env.NLU_EXTRACTOR_MODEL || DEFAULT_LLM_MODEL;

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

/** The timeout (in ms) for assistant narration LLM calls (increased for reliability). */
export const LLM_ASSISTANT_TIMEOUT_MS = parseInt(
  process.env.LLM_ASSISTANT_TIMEOUT || '8000'
); // 8 seconds (was timing out at ~5s)

// === NLU Fallback Settings ===

/** A list of common Hebrew city names for the fallback NLU extractor. */
export const FALLBACK_HEBREW_CITIES = ['תל אביב', 'ירושלים', 'חיפה', 'באר שבע', 'אשקלון', 'אשדוד', 'רמת גן', 'גדרה'];

/** A list of common English city names for the fallback NLU extractor. */
export const FALLBACK_ENGLISH_CITIES = ['tel aviv', 'jerusalem', 'haifa', 'beer sheva', 'ashkelon', 'ashdod', 'ramat gan', 'gedera'];

// === Conversation Mode ===

/**
 * When true, the chat pipeline bypasses the LangChain agent and runs
 * a deterministic NLU + Policy flow to guarantee a response.
 */
export const CONVERSATION_SIMPLE_MODE = process.env.CONVERSATION_SIMPLE_MODE === 'true';

/** Select conversation engine implementation: 'legacy' | 'simple' | 'langgraph' */
export const CONVERSATION_ENGINE = (process.env.CONVERSATION_ENGINE || (CONVERSATION_SIMPLE_MODE ? 'simple' : 'legacy')) as 'legacy' | 'simple' | 'langgraph';

/** Enable FoodGraph on /api/nlu/parse */
export const FOOD_GRAPH_ENABLED = process.env.FOOD_GRAPH_ENABLED === 'true';
export const FEATURE_AGENT_LOOP = process.env.FEATURE_AGENT_LOOP === 'true';
export const FEATURE_NLU_LLM_ONLY = process.env.FEATURE_NLU_LLM_ONLY === 'true';

/**
 * The maximum number of results to return from the provider (Google Places, etc).
 */
export const PROVIDER_RESULT_LIMIT = parseInt(process.env.PROVIDER_RESULT_LIMIT || '10', 10);

/**
 * The maximum number of results to return to the UI (grid route).
 */
export const UI_RESULT_LIMIT = parseInt(process.env.UI_RESULT_LIMIT || '8', 10);

// Default export for robust interop (ESM/CJS)
const config = {
    DEFAULT_LLM_MODEL,
    FAST_LLM_MODEL,
    NLU_CLASSIFIER_MODEL,
    NLU_EXTRACTOR_MODEL,
    LLM_RETRY_ATTEMPTS,
    LLM_RETRY_BACKOFF_MS,
    LLM_JSON_TIMEOUT_MS,
    LLM_COMPLETION_TIMEOUT_MS,
    LLM_FOOD_CHECK_TIMEOUT_MS,
    LLM_ASSISTANT_TIMEOUT_MS,
    FALLBACK_HEBREW_CITIES,
    FALLBACK_ENGLISH_CITIES,
    CONVERSATION_SIMPLE_MODE,
    CONVERSATION_ENGINE,
    FOOD_GRAPH_ENABLED,
    FEATURE_AGENT_LOOP,
    FEATURE_NLU_LLM_ONLY,
    PROVIDER_RESULT_LIMIT,
    UI_RESULT_LIMIT,
};

export default config;
