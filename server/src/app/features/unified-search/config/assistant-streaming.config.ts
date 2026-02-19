/**
 * Assistant Streaming Configuration
 * Controls how assistant messages are revealed to the user
 * 
 * V1 Baseline: English + LTR only
 */

export type AssistantStreamingMode = 'instant' | 'sentence' | 'word';

export interface AssistantStreamingConfig {
  /**
   * Streaming mode:
   * - instant: render full message immediately
   * - sentence: reveal sentence by sentence with pauses
   * - word: reveal word by word (optionally in small bursts)
   */
  mode: AssistantStreamingMode;

  /**
   * Milliseconds per word (used only in word mode)
   * @default 60
   */
  msPerWord: number;

  /**
   * Pause after each sentence in milliseconds (used only in sentence mode)
   * @default 400
   */
  pauseAfterSentenceMs: number;

  /**
   * Maximum total animation duration in milliseconds
   * Caps the total streaming time regardless of content length
   * @default 5000
   */
  maxDurationMs: number;
}

/**
 * Default assistant streaming configuration
 * Mode: word (reveal word by word)
 */
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'word',
  msPerWord: 110,
  pauseAfterSentenceMs: 400,
  maxDurationMs: 5000
};

/**
 * Runtime configuration override (for testing/debugging)
 * Set via browser console: window.__ASSISTANT_STREAMING_CONFIG = { mode: 'word' }
 */
let runtimeConfig: Partial<AssistantStreamingConfig> | null = null;

/**
 * Get the active assistant streaming configuration
 * V1: Returns default config with optional runtime overrides.
 * Runtime overrides can be set via window.__ASSISTANT_STREAMING_CONFIG in browser console.
 */
export function getAssistantStreamingConfig(): AssistantStreamingConfig {
  // Check for runtime config override (dev/testing only)
  if (typeof window !== 'undefined' && (window as any).__ASSISTANT_STREAMING_CONFIG) {
    runtimeConfig = (window as any).__ASSISTANT_STREAMING_CONFIG;
  }

  return {
    ...DEFAULT_ASSISTANT_STREAMING_CONFIG,
    ...(runtimeConfig || {})
  };
}

/**
 * Set streaming mode at runtime (for testing/debugging)
 * Usage in browser console: setAssistantStreamingMode('word')
 */
export function setAssistantStreamingMode(mode: AssistantStreamingMode): void {
  if (typeof window !== 'undefined') {
    (window as any).__ASSISTANT_STREAMING_CONFIG = {
      ...(window as any).__ASSISTANT_STREAMING_CONFIG,
      mode
    };
    console.log('[AssistantStreaming] Mode changed to:', mode);
  }
}

// Export for browser console access
if (typeof window !== 'undefined') {
  (window as any).setAssistantStreamingMode = setAssistantStreamingMode;
}
