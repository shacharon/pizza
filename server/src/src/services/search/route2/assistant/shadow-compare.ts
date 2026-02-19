/**
 * Shadow Mode Comparator
 * Compares two assistant outputs and logs divergences
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { AssistantOutput } from './assistant-llm.service.js';
import { detectMessageLanguage } from './language-detector.js';

/**
 * Get message length bucket for comparison
 */
function getMessageLengthBucket(message: string): 'short' | 'medium' | 'long' {
  const len = message.length;
  if (len < 50) return 'short';
  if (len < 150) return 'medium';
  return 'long';
}

/**
 * Compare two assistant outputs and log divergences
 * Used for A/B testing validation strategies in shadow mode
 */
export function compareShadowOutputs(
  controlOutput: AssistantOutput,
  experimentOutput: AssistantOutput,
  requestId: string,
  experimentName: string = 'unknown'
): void {
  const controlLang = detectMessageLanguage(controlOutput.message);
  const experimentLang = detectMessageLanguage(experimentOutput.message);
  
  const controlHasQuestion = controlOutput.question !== null;
  const experimentHasQuestion = experimentOutput.question !== null;
  
  const controlLengthBucket = getMessageLengthBucket(controlOutput.message);
  const experimentLengthBucket = getMessageLengthBucket(experimentOutput.message);

  const divergences: string[] = [];

  if (controlLang !== experimentLang) {
    divergences.push(`language (control=${controlLang}, experiment=${experimentLang})`);
  }

  if (controlHasQuestion !== experimentHasQuestion) {
    divergences.push(`hasQuestion (control=${controlHasQuestion}, experiment=${experimentHasQuestion})`);
  }

  if (controlLengthBucket !== experimentLengthBucket) {
    divergences.push(`messageLengthBucket (control=${controlLengthBucket}, experiment=${experimentLengthBucket})`);
  }

  if (controlOutput.type !== experimentOutput.type) {
    divergences.push(`type (control=${controlOutput.type}, experiment=${experimentOutput.type})`);
  }

  if (controlOutput.suggestedAction !== experimentOutput.suggestedAction) {
    divergences.push(`suggestedAction (control=${controlOutput.suggestedAction}, experiment=${experimentOutput.suggestedAction})`);
  }

  if (controlOutput.blocksSearch !== experimentOutput.blocksSearch) {
    divergences.push(`blocksSearch (control=${controlOutput.blocksSearch}, experiment=${experimentOutput.blocksSearch})`);
  }

  if (divergences.length > 0) {
    logger.warn({
      requestId,
      event: 'assistant_shadow_diverged',
      experimentName,
      divergences,
      controlType: controlOutput.type,
      experimentType: experimentOutput.type,
      controlMessagePreview: controlOutput.message.substring(0, 50),
      experimentMessagePreview: experimentOutput.message.substring(0, 50)
    }, '[ASSISTANT_SHADOW] Divergence detected between control and experiment');
  } else {
    logger.debug({
      requestId,
      event: 'assistant_shadow_matched',
      experimentName,
      type: controlOutput.type
    }, '[ASSISTANT_SHADOW] Control and experiment matched');
  }
}
