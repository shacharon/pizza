/**
 * Assistant Narrator Constants
 * 
 * Single source of truth for narrator configuration
 */

/**
 * WebSocket channel name for assistant messages
 * IMPORTANT: Must match frontend subscription channel
 * 
 * Using dedicated 'assistant' channel for narrator messages.
 * Frontend subscribes to both 'search' (progress) and 'assistant' (narrator) channels.
 */
export const ASSISTANT_WS_CHANNEL = 'assistant' as const;

/**
 * Debug flag for verbose narrator logging
 */
export const DEBUG_NARRATOR_ENABLED = process.env.DEBUG_NARRATOR === 'true';
