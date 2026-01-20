/**
 * Provider Call Tracing - AWS CloudWatch & DynamoDB Ready
 * Emits structured telemetry for all external provider calls (LLM, Places, etc.)
 */

import { logger } from '../logger/structured-logger.js';
import { recordProviderCall } from '../audit/providerAudit.store.js';

export type ProviderName = 'openai' | 'anthropic' | 'google_places' | 'google_geocoding';

export interface ProviderTraceEvent {
  type: 'provider_call';
  traceId?: string;
  sessionId?: string;
  provider: ProviderName;
  operation: string;
  latencyMs: number;
  success: boolean;
  retryCount?: number;
  statusCode?: number;
  errorCode?: string;
  errorReason?: string;

  // LLM-specific fields
  model?: string;
  tokensIn?: number;
  tokensOut?: number;
  totalTokens?: number;
  estimatedCostUsd?: number;
  costUnknown?: boolean;

  timestamp: string;
  metadata?: Record<string, any>;
}

export interface TraceProviderCallParams {
  traceId?: string;
  sessionId?: string;
  provider: ProviderName;
  operation: string;
  retryCount?: number;
}

export type EnrichEventFn = (event: Partial<ProviderTraceEvent>) => void;

/**
 * Wrapper that traces provider calls with automatic timing and error handling
 * 
 * @param params - Basic trace parameters (traceId, provider, operation, etc.)
 * @param fn - The async function to execute and trace
 * @param enrichEvent - Optional callback to enrich event with additional data (tokens, cost, etc.)
 * 
 * @example
 * ```typescript
 * const result = await traceProviderCall(
 *   { traceId: req.traceId, provider: 'openai', operation: 'completeJSON' },
 *   async () => openai.responses.create({ ... }),
 *   (event) => {
 *     event.tokensIn = 100;
 *     event.tokensOut = 50;
 *     event.estimatedCostUsd = 0.00015;
 *   }
 * );
 * ```
 */
export async function traceProviderCall<T>(
  params: TraceProviderCallParams,
  fn: () => Promise<T>,
  enrichEvent?: (event: Partial<ProviderTraceEvent>, result?: T) => void
): Promise<T> {
  const startTime = Date.now();
  let success = false;
  let statusCode: number | undefined;
  let errorCode: string | undefined;
  let errorReason: string | undefined;
  let result: T;

  try {
    result = await fn();
    success = true;

    return result;
  } catch (error: any) {
    success = false;
    errorReason = sanitizeErrorReason(error?.message || String(error));
    errorCode = error?.code || error?.type || error?.name;
    statusCode = error?.status || error?.statusCode;

    throw error;
  } finally {
    const latencyMs = Date.now() - startTime;

    // Build base event
    const event: ProviderTraceEvent = {
      type: 'provider_call',
      ...(params.traceId !== undefined && { traceId: params.traceId }),
      ...(params.sessionId !== undefined && { sessionId: params.sessionId }),
      provider: params.provider,
      operation: params.operation,
      latencyMs,
      success,
      ...(params.retryCount !== undefined && { retryCount: params.retryCount }),
      ...(statusCode !== undefined && { statusCode }),
      ...(errorCode !== undefined && { errorCode }),
      ...(errorReason !== undefined && { errorReason }),
      timestamp: new Date().toISOString(),
    };

    // Apply enrichment
    if (enrichEvent && success) {
      const enrichment: Partial<ProviderTraceEvent> = {};
      enrichEvent(enrichment, result!);
      Object.assign(event, enrichment);
    }

    // Log to CloudWatch (via structured logger)
    if (success) {
      logger.info(event, `Provider call: ${params.provider}.${params.operation}`);
    } else {
      logger.warn(event, `Provider call failed: ${params.provider}.${params.operation}`);
    }

    // Persist to DynamoDB (async, with optional await)
    recordProviderCall(event).catch((err) => {
      logger.error({ error: err }, 'Failed to record provider call to audit store');
    });
  }
}

/**
 * Sanitize error messages to avoid leaking sensitive data
 * - Strips sensitive query parameters from URLs (API keys, tokens, etc.)
 * - Truncates long messages
 * - Redacts API key patterns
 */
export function sanitizeErrorReason(message: string): string {
  if (!message) return 'Unknown error';

  // Truncate to 500 chars
  let sanitized = message.slice(0, 500);

  // Strip ONLY sensitive query params by name (keep others for debugging)
  const sensitiveParams = [
    'key', 'apikey', 'api_key',
    'token', 'authorization', 'auth',
    'secret', 'client_secret',
    'access_token', 'refresh_token'
  ];

  for (const param of sensitiveParams) {
    // Match param=value in URLs (case insensitive)
    const regex = new RegExp(`([?&])${param}=[^&\\s]*`, 'gi');
    sanitized = sanitized.replace(regex, `$1${param}=[REDACTED]`);
  }

  // Redact common API key patterns anywhere in message
  sanitized = sanitized.replace(/AIza[a-zA-Z0-9_-]{35}/g, '[REDACTED_API_KEY]');
  sanitized = sanitized.replace(/sk-[a-zA-Z0-9]{48}/g, '[REDACTED_API_KEY]');

  // Remove bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]');

  return sanitized;
}

/**
 * Calculate estimated cost for OpenAI API calls
 * Based on model and token usage
 * 
 * Pricing as of January 2025 (USD per 1M tokens):
 * Returns null if model pricing unknown
 */
export function calculateOpenAICost(
  model: string,
  tokensIn: number,
  tokensOut: number
): number | null {
  const pricing = {
    'gpt-4o-mini': { input: 0.150, output: 0.600 },
    'gpt-4o': { input: 2.50, output: 10.00 },
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-4-turbo-preview': { input: 10.00, output: 30.00 },
    'gpt-4': { input: 30.00, output: 60.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'gpt-3.5-turbo-16k': { input: 3.00, output: 4.00 },
  };


  // Find matching pricing (handle model variants like gpt-4o-2024-08-06)
  let rates: { input: number; output: number } | null = null;
  for (const [key, value] of Object.entries(pricing)) {
    if (model.includes(key)) {
      rates = value;
      break;
    }
  }

  if (!rates) {
    return null; // Unknown model
  }

  const costIn = (tokensIn / 1_000_000) * rates.input;
  const costOut = (tokensOut / 1_000_000) * rates.output;

  return costIn + costOut;
}
