/**
 * Assistant Message Mapper
 * Pure functions for transforming raw WebSocket messages to UI models
 * 
 * Responsibility:
 * - Parse raw WS message payloads
 * - Extract relevant fields for UI display
 * - Validate message types
 * - Generate stable message IDs
 */

/**
 * Valid LLM assistant message types
 */
export type LLMAssistantType = 'CLARIFY' | 'SUMMARY' | 'GATE_FAIL';

/**
 * Assistant message UI model
 */
export interface AssistantMessageModel {
  id: string;
  type: LLMAssistantType;
  message: string;
  question: string | null;
  blocksSearch: boolean;
  requestId: string;
  timestamp: number;
}

/**
 * Raw WebSocket message payload (from backend)
 */
export interface RawAssistantPayload {
  type: string;
  message?: string;
  question?: string;
  blocksSearch?: boolean;
}

/**
 * Check if message type is valid LLM assistant type
 * 
 * @param type - Message type from backend
 * @returns true if valid LLM type
 */
export function isValidLLMType(type: string | undefined): type is LLMAssistantType {
  if (!type) return false;
  return ['CLARIFY', 'SUMMARY', 'GATE_FAIL'].includes(type);
}

/**
 * Extract assistant message from raw WebSocket payload
 * 
 * @param rawMessage - Raw WS message with payload
 * @param requestId - Associated request ID
 * @returns Parsed assistant message or null if invalid
 * 
 * @example
 * extractAssistantMessage(
 *   {
 *     type: 'assistant',
 *     requestId: 'req-123',
 *     payload: {
 *       type: 'SUMMARY',
 *       message: 'Found 10 results'
 *     }
 *   },
 *   'req-123'
 * )
 * // => { type: 'SUMMARY', message: 'Found 10 results', ... }
 */
export function extractAssistantMessage(
  rawMessage: any,
  requestId: string
): AssistantMessageModel | null {
  // Extract payload
  const payload: RawAssistantPayload | undefined = rawMessage?.payload;
  if (!payload) return null;

  // Validate type
  if (!isValidLLMType(payload.type)) {
    return null;
  }

  // Extract message text
  const message = payload.message || payload.question || '';
  if (!message) return null;

  // Build UI model
  const timestamp = Date.now();
  return {
    id: generateMessageId(requestId, payload.type, timestamp),
    type: payload.type,
    message,
    question: payload.question || null,
    blocksSearch: payload.blocksSearch || false,
    requestId,
    timestamp
  };
}

/**
 * Generate stable message ID for deduplication
 * 
 * @param requestId - Request ID
 * @param type - Message type
 * @param timestamp - Message timestamp
 * @returns Unique message ID
 * 
 * @example
 * generateMessageId('req-123', 'SUMMARY', 1234567890)
 * // => 'req-123-SUMMARY-1234567890'
 */
export function generateMessageId(
  requestId: string,
  type: string,
  timestamp: number
): string {
  return `${requestId}-${type}-${timestamp}`;
}

/**
 * Extract text from assistant message
 * Prioritizes message field, falls back to question
 * 
 * @param payload - Raw payload
 * @returns Extracted text or empty string
 */
export function extractMessageText(payload: RawAssistantPayload): string {
  return payload.message || payload.question || '';
}

/**
 * Check if assistant message blocks further search
 * Used for CLARIFY type messages
 * 
 * @param payload - Raw payload
 * @returns true if message blocks search
 */
export function doesMessageBlockSearch(payload: RawAssistantPayload): boolean {
  return payload.blocksSearch === true;
}
