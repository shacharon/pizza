/**
 * Assistant Narrator Feature Flags
 * 
 * Controls whether LLM-based assistant messages are generated
 * Default: DISABLED (opt-in feature)
 */

export const ASSISTANT_MODE_ENABLED = process.env.ASSISTANT_MODE === 'true'; // default false
export const DEBUG_NARRATOR_ENABLED = process.env.DEBUG_NARRATOR === 'true'; // default false

/**
 * Log feature flag status at boot
 */
export function logNarratorFlags(): void {
  console.log(`[Config] ASSISTANT_MODE = ${ASSISTANT_MODE_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  console.log(`[Config] DEBUG_NARRATOR = ${DEBUG_NARRATOR_ENABLED ? 'ENABLED' : 'DISABLED'}`);
}