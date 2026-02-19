/**
 * LLM Configuration Module
 * 
 * Centralized LLM model and timeout resolution with SOLID principles.
 * 
 * Usage:
 * ```typescript
 * import { resolveLLM } from './lib/llm/index.js';
 * 
 * const { model, timeoutMs } = resolveLLM('gate');
 * // Use resolved model and timeout in LLM call
 * ```
 */

export type { LLMPurpose } from './llm-purpose.js';
export { isValidLLMPurpose } from './llm-purpose.js';

export type { LLMConfig } from './llm-config.js';
export { 
  loadLLMConfig, 
  getLLMConfig, 
  clearLLMConfigCache,
  getDefaultTimeoutForPurpose 
} from './llm-config.js';

export type { ResolvedLLM } from './llm-resolver.js';
export { resolveLLM, getAllResolvedLLMs } from './llm-resolver.js';

export type { LLMClientOptions } from './llm-client.js';
export { completeJSONWithPurpose, buildLLMOptions } from './llm-client.js';
