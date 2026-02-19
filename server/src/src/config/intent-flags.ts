/**
 * Intent Routing Feature Flags
 * 
 * Controls LLM Gate behavior and routing logic
 */

/** Enable the intent gate routing layer (default: true) */
export const INTENT_GATE_ENABLED = process.env.INTENT_GATE_ENABLED !== "false";

/** Force full LLM for all queries (debug only, default: false) */
export const INTENT_FORCE_FULL_LLM =
  process.env.INTENT_FORCE_FULL_LLM === "true";

/** Disable fast path entirely (debug only, default: false) */
export const INTENT_DISABLE_FAST_PATH =
  process.env.INTENT_DISABLE_FAST_PATH === "true";

/** Timeout for gate LLM call in milliseconds (default: 5000 - TEMP for measurement) */
export const INTENT_GATE_TIMEOUT_MS = parseInt(
  process.env.INTENT_GATE_TIMEOUT_MS || "5000",
  10
);

/** Timeout for full intent LLM call in milliseconds (default: 6000 - TEMP for measurement) */
export const INTENT_FULL_TIMEOUT_MS = parseInt(
  process.env.INTENT_FULL_TIMEOUT_MS || "6000",
  10
);

/** Timeout for V2 pipeline INTENT_LITE stage in milliseconds (default: 10000) */
export const INTENT_LITE_TIMEOUT_MS = parseInt(
  process.env.INTENT_LITE_TIMEOUT_MS || "10000",
  10
);

/** Export all flags as a single object for convenience */
export const intentFlags = {
  INTENT_GATE_ENABLED,
  INTENT_FORCE_FULL_LLM,
  INTENT_DISABLE_FAST_PATH,
  INTENT_GATE_TIMEOUT_MS,
  INTENT_FULL_TIMEOUT_MS,
  INTENT_LITE_TIMEOUT_MS,
};
