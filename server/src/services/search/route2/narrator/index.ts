/**
 * Assistant Narrator Module Exports
 */

export {
  generateAssistantMessage,
  validateNarratorOutput
} from './assistant-narrator.js';

export {
  publishAssistantMessage,
  publishGateFailMessage,
  publishClarifyMessage,
  publishSummaryMessage
} from './assistant-publisher.js';

export type {
  NarratorOutput,
  NarratorContext,
  NarratorGateContext,
  NarratorClarifyContext,
  NarratorSummaryContext
} from './narrator.types.js';

export {
  NarratorOutputSchema,
  NARRATOR_JSON_SCHEMA,
  NARRATOR_SCHEMA_HASH,
  getFallbackMessage
} from './narrator.types.js';

export {
  buildNarratorMessages,
  NARRATOR_PROMPT_VERSION,
  NARRATOR_PROMPT_HASH
} from './narrator.prompt.js';
