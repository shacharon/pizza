/**
 * Assistant Feature Flags
 * Controls assistant narration and LLM rewriting behavior
 */

/**
 * Assistant mode
 * - "OFF": Disabled (no progress messages, no LLM rewrites)
 * - "TO_MAYBE": Enabled (full assistant flow with LLM rewrites)
 */
export const ASSISTANT_MODE: 'OFF' | 'TO_MAYBE' = 
  (process.env.ASSISTANT_MODE as 'OFF' | 'TO_MAYBE') || 'OFF';

/**
 * Log assistant mode at startup
 */
export function logAssistantMode(): void {
  console.log(`[Config] ASSISTANT_MODE = ${ASSISTANT_MODE}`);
}
