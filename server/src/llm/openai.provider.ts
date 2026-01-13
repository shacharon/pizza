import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { createHash } from "crypto";
import { performance } from "node:perf_hooks";
import type { LLMProvider, Message } from "./types.js";
import { openai } from "../services/openai.client.js";
import {
    DEFAULT_LLM_MODEL,
    LLM_JSON_TIMEOUT_MS,
    LLM_RETRY_ATTEMPTS,
    LLM_RETRY_BACKOFF_MS,
    LLM_COMPLETION_TIMEOUT_MS
} from "../config/index.js";
import { traceProviderCall, calculateOpenAICost } from "../lib/telemetry/providerTrace.js";
import { logger } from "../lib/logger/structured-logger.js";

/**
 * Schema version for Structured Outputs - increment when schema generation changes
 */
const SCHEMA_VERSION = "v1";

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

function toInput(messages: Message[]) {
    return messages.map(m => ({ role: m.role, content: m.content }));
}

/**
 * Generate a stable hash of a JSON schema for correlation/debugging
 * Used to track which schema version caused issues
 */
function generateSchemaHash(schema: any): string {
    const schemaString = JSON.stringify(schema, Object.keys(schema).sort());
    return createHash('sha256').update(schemaString).digest('hex').substring(0, 12);
}

export class OpenAiProvider implements LLMProvider {
    /**
     * Complete with strict JSON Schema validation using OpenAI Structured Outputs
     * 
     * This replaces the previous text-based JSON approach with OpenAI's Structured Outputs API
     * which guarantees JSON conformance to the provided schema. This eliminates parse errors
     * like arrays-instead-of-strings (e.g. ["find_food"] vs "find_food").
     * 
     * Key changes:
     * - Converts Zod schema to JSON Schema using zod-to-json-schema
     * - Uses OpenAI's beta.chat.completions.parse with strict:true
     * - Removes extractJsonLoose fallback (no longer needed)
     * - Only retries transport errors (429, 5xx, timeouts) - NOT parse errors
     * - Parse errors now fail fast (they shouldn't happen with strict schema)
     */
    async completeJSON<T extends z.ZodTypeAny>(
        messages: Message[],
        schema: T,
        opts?: {
            temperature?: number;
            timeout?: number;
            traceId?: string;
            sessionId?: string;
            promptVersion?: string;
            promptHash?: string;
            promptLength?: number;
            requestId?: string;  // For timing correlation
            stage?: string;       // For stage identification (e.g., "intent_gate")
        },
        staticJsonSchema?: any  // Optional static JSON Schema (bypasses Zod conversion)
    ): Promise<z.infer<T>> {
        const temperature = opts?.temperature ?? 0;
        const timeoutMs = opts?.timeout ?? LLM_JSON_TIMEOUT_MS;
        const maxAttempts = LLM_RETRY_ATTEMPTS;
        const backoffs = LLM_RETRY_BACKOFF_MS;
        const tStart = Date.now();
        let lastErr: any;

        // Timing instrumentation: t0 = start (before prompt construction)
        const t0 = performance.now();

        // Use static JSON Schema if provided, otherwise convert from Zod
        let jsonSchema: any;

        if (staticJsonSchema) {
            // Use provided static schema (preferred for critical paths)
            jsonSchema = staticJsonSchema;
        } else {
            // Convert Zod schema to JSON Schema for OpenAI Structured Outputs
            jsonSchema = zodToJsonSchema(schema as any, {
                target: 'openApi3',
                $refStrategy: 'none'
            }) as any;
        }

        // Validate schema BEFORE calling OpenAI
        if (!jsonSchema || typeof jsonSchema !== 'object') {
            logger.error({
                traceId: opts?.traceId,
                schemaType: typeof jsonSchema,
                schemaValue: jsonSchema,
                promptVersion: opts?.promptVersion
            }, '[LLM] Invalid JSON Schema: schema is null or not an object');
            throw new Error('Invalid JSON Schema generated from Zod schema');
        }

        if (jsonSchema.type !== 'object') {
            logger.error({
                traceId: opts?.traceId,
                schemaType: jsonSchema.type,
                hasProperties: !!jsonSchema.properties,
                promptVersion: opts?.promptVersion
            }, '[LLM] Invalid JSON Schema: root type must be "object"');
            throw new Error(`Invalid JSON Schema: root type is "${jsonSchema.type}", expected "object"`);
        }

        // Ensure additionalProperties is false for strict mode
        if (jsonSchema.additionalProperties !== false) {
            jsonSchema.additionalProperties = false;
        }

        const schemaHash = generateSchemaHash(jsonSchema);

        // Timing instrumentation: t1 = after schema prepared
        const t1 = performance.now();

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if ((backoffs[attempt] ?? 0) > 0) await sleep(backoffs[attempt] ?? 0);
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), timeoutMs);

            // Calculate prompt size
            const promptChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);

            // Timing instrumentation: t2 = immediately before OpenAI call (declare outside try for error access)
            let t2 = performance.now();

            try {
                const model = (opts as any)?.model || DEFAULT_LLM_MODEL;

                // Update t2 right before OpenAI call
                t2 = performance.now();

                // Use OpenAI Structured Outputs with strict JSON Schema enforcement
                const resp = await traceProviderCall(
                    {
                        ...(opts?.traceId !== undefined && { traceId: opts.traceId }),
                        ...(opts?.sessionId !== undefined && { sessionId: opts.sessionId }),
                        provider: 'openai',
                        operation: 'completeJSON',
                        ...(attempt !== undefined && { retryCount: attempt }),
                    },
                    async () => {
                        return await openai.chat.completions.create({
                            model,
                            messages: toInput(messages) as any,
                            temperature,
                            response_format: {
                                type: "json_schema",
                                json_schema: {
                                    name: "response",
                                    schema: jsonSchema,
                                    strict: true  // Guarantees schema conformance
                                }
                            } as any  // Type cast for OpenAI SDK compatibility
                        }, { signal: controller.signal });
                    },
                    (event, result) => {
                        // Extract token usage
                        const usage = (result as any)?.usage;
                        const tokensIn = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
                        const tokensOut = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
                        const totalTokens = usage?.total_tokens ?? (tokensIn + tokensOut);

                        event.model = model;
                        event.tokensIn = tokensIn;
                        event.tokensOut = tokensOut;
                        event.totalTokens = totalTokens;

                        // Add Structured Outputs metadata for debugging
                        (event as any).schemaName = "response";
                        (event as any).schemaStrict = true;
                        (event as any).schemaHash = schemaHash;
                        (event as any).schemaVersion = SCHEMA_VERSION;

                        // Add prompt metadata for observability (if provided)
                        if (opts?.promptVersion) {
                            (event as any).promptVersion = opts.promptVersion;
                        }
                        if (opts?.promptHash) {
                            (event as any).promptHash = opts.promptHash;
                        }
                        if (opts?.promptLength) {
                            (event as any).promptLength = opts.promptLength;
                        }

                        // Calculate cost
                        if (tokensIn > 0 || tokensOut > 0) {
                            const cost = calculateOpenAICost(model, tokensIn, tokensOut);
                            if (cost !== null) {
                                event.estimatedCostUsd = cost;
                                event.costUnknown = false;
                            } else {
                                event.costUnknown = true;
                            }
                        } else {
                            event.costUnknown = true;
                        }
                    }
                );

                clearTimeout(t);

                // Timing instrumentation: t3 = immediately after OpenAI returns
                const t3 = performance.now();

                // Extract JSON content from OpenAI's response
                const content = resp.choices[0]?.message?.content;

                if (!content) {
                    // This should be extremely rare with Structured Outputs
                    logger.error({
                        traceId: opts?.traceId,
                        refusal: (resp.choices[0]?.message as any)?.refusal,
                        finishReason: resp.choices[0]?.finish_reason
                    }, '[LLM] Structured Outputs returned no content');
                    throw new Error('OpenAI Structured Outputs returned no content');
                }

                // Parse JSON and validate with Zod (should always pass with strict schema)
                let parsed: any;
                try {
                    parsed = JSON.parse(content);
                } catch (parseErr: any) {
                    logger.error({
                        traceId: opts?.traceId,
                        schemaHash,
                        error: parseErr?.message
                    }, '[LLM] Failed to parse JSON from Structured Outputs response');
                    throw new Error(`JSON parse failed despite Structured Outputs: ${parseErr?.message}`);
                }

                const validated = schema.parse(parsed);

                // Timing instrumentation: t4 = after parse/validate complete
                const t4 = performance.now();

                // Extract token usage for detailed logging
                const usage = (resp as any)?.usage;
                const inputTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? null;
                const outputTokens = usage?.completion_tokens ?? usage?.output_tokens ?? null;

                // Compute timing metrics
                const buildPromptMs = Math.round((t1 - t0) * 100) / 100;
                const networkMs = Math.round((t3 - t2) * 100) / 100;
                const parseMs = Math.round((t4 - t3) * 100) / 100;
                const totalMs = Math.round((t4 - t0) * 100) / 100;

                // Log detailed timing once per attempt
                logger.info({
                    msg: 'llm_gate_timing',
                    stage: opts?.stage || 'unknown',
                    promptVersion: opts?.promptVersion || 'unknown',
                    requestId: opts?.requestId,
                    traceId: opts?.traceId,
                    sessionId: opts?.sessionId,
                    attempt: attempt + 1,
                    model,
                    timeoutMs,
                    timeoutHit: false,
                    buildPromptMs,
                    networkMs,
                    parseMs,
                    totalMs,
                    promptChars,
                    inputTokens,
                    outputTokens,
                    retriesCount: attempt,
                    success: true
                }, 'llm_gate_timing');

                logger.debug({
                    attempts: attempt + 1,
                    durationMs: Date.now() - tStart,
                    schemaHash
                }, '[LLM] Structured Outputs completion successful');

                return validated;
            } catch (e: any) {
                clearTimeout(t);
                lastErr = e;
                const status = e?.status ?? e?.code ?? e?.name;

                // Timing instrumentation: t3_error = when error occurred
                const t3Error = performance.now();

                // Categorize errors
                const isAbortError = e?.name === 'AbortError' ||
                    e?.message?.includes('aborted') ||
                    e?.message?.includes('timeout');
                const isTransportError = status === 429 ||
                    (typeof status === 'number' && status >= 500);
                const isParseError = e?.name === 'ZodError' ||
                    e?.name === 'SyntaxError' ||
                    e?.message?.includes('JSON') ||
                    e?.message?.includes('parsed content');

                // Determine error type/reason
                let errorType = 'unknown';
                let errorReason = e?.message || 'unknown';
                if (isAbortError) {
                    errorType = 'abort_timeout';
                    errorReason = 'Request aborted or timeout';
                } else if (isTransportError) {
                    errorType = 'transport_error';
                    errorReason = `HTTP ${status}`;
                } else if (isParseError) {
                    errorType = 'parse_error';
                    errorReason = e?.message || 'Parse failed';
                }

                // Compute timing metrics for failed attempt
                const buildPromptMs = Math.round((t1 - t0) * 100) / 100;
                const networkMs = Math.round((t3Error - t2) * 100) / 100;
                const totalMs = Math.round((t3Error - t0) * 100) / 100;

                // Log detailed timing for failed attempt
                logger.warn({
                    msg: 'llm_gate_timing',
                    stage: opts?.stage || 'unknown',
                    promptVersion: opts?.promptVersion || 'unknown',
                    requestId: opts?.requestId,
                    traceId: opts?.traceId,
                    sessionId: opts?.sessionId,
                    attempt: attempt + 1,
                    model: (opts as any)?.model || DEFAULT_LLM_MODEL,
                    timeoutMs,
                    timeoutHit: isAbortError,
                    buildPromptMs,
                    networkMs,
                    parseMs: 0,
                    totalMs,
                    promptChars,
                    inputTokens: null,
                    outputTokens: null,
                    retriesCount: attempt,
                    success: false,
                    errorType,
                    errorReason,
                    statusCode: typeof status === 'number' ? status : null
                }, 'llm_gate_timing');

                // Abort/Timeout errors: fail fast, let caller handle (gate can fallback)
                if (isAbortError) {
                    logger.warn({
                        traceId: opts?.traceId,
                        durationMs: Date.now() - tStart,
                        timeoutMs,
                        promptVersion: opts?.promptVersion
                    }, '[LLM] Request aborted/timeout - failing fast for caller to handle');
                    throw e;
                }

                // Parse errors with Structured Outputs = fail fast (shouldn't happen)
                if (isParseError) {
                    logger.error({
                        status,
                        traceId: opts?.traceId,
                        schemaHash,
                        errorType: e?.name
                    }, '[LLM] Structured Outputs parse error - failing fast (schema mismatch should not occur)');
                    throw e;
                }

                // Non-retriable errors: fail fast
                if (!isTransportError) {
                    logger.error({ status, traceId: opts?.traceId }, '[LLM] Non-retriable error, failing fast');
                    throw e;
                }

                // Transport errors (429, 5xx): retry if attempts remaining
                logger.warn({
                    attempt: attempt + 1,
                    maxAttempts,
                    status,
                    traceId: opts?.traceId
                }, '[LLM] Retriable transport error');

                if (attempt === maxAttempts - 1) {
                    logger.error({
                        attempts: attempt + 1,
                        durationMs: Date.now() - tStart,
                        traceId: opts?.traceId
                    }, '[LLM] All retry attempts exhausted');
                    throw e;
                }
            }
        }
        throw lastErr ?? new Error('LLM failed after all attempts');
    }

    async complete(
        messages: Message[],
        opts?: { temperature?: number; timeout?: number; model?: string; traceId?: string; sessionId?: string; }
    ): Promise<string> {
        const temperature = opts?.temperature ?? 0;
        const timeoutMs = opts?.timeout ?? LLM_COMPLETION_TIMEOUT_MS;
        const model = opts?.model || DEFAULT_LLM_MODEL;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const resp = await traceProviderCall(
                {
                    ...(opts?.traceId !== undefined && { traceId: opts.traceId }),
                    ...(opts?.sessionId !== undefined && { sessionId: opts.sessionId }),
                    provider: 'openai',
                    operation: 'complete',
                    retryCount: 0,
                },
                async () => {
                    return await openai.chat.completions.create({
                        model,
                        messages: toInput(messages) as any,
                        temperature
                    }, { signal: controller.signal });
                },
                (event, result) => {
                    // Extract token usage
                    const usage = (result as any)?.usage;
                    const tokensIn = usage?.prompt_tokens ?? usage?.input_tokens ?? 0;
                    const tokensOut = usage?.completion_tokens ?? usage?.output_tokens ?? 0;
                    const totalTokens = usage?.total_tokens ?? (tokensIn + tokensOut);

                    event.model = model;
                    event.tokensIn = tokensIn;
                    event.tokensOut = tokensOut;
                    event.totalTokens = totalTokens;

                    // Calculate cost
                    if (tokensIn > 0 || tokensOut > 0) {
                        const cost = calculateOpenAICost(model, tokensIn, tokensOut);
                        if (cost !== null) {
                            event.estimatedCostUsd = cost;
                            event.costUnknown = false;
                        } else {
                            event.costUnknown = true;
                        }
                    } else {
                        event.costUnknown = true;
                    }
                }
            );

            clearTimeout(t);
            return resp.choices[0]?.message?.content || '';
        } catch (e: any) {
            clearTimeout(t);
            logger.error({ error: e?.status ?? e?.code ?? e?.name, traceId: opts?.traceId }, '[LLM] Simple complete failed');
            throw e;
        }
    }

    /**
     * Phase 4: Stream completion with chunk callback
     * Streams text chunks via callback and returns full text when done
     */
    async completeStream(
        messages: Message[],
        onChunk: (text: string) => void,
        opts?: { temperature?: number; timeout?: number; model?: string; traceId?: string; sessionId?: string; }
    ): Promise<string> {
        const temperature = opts?.temperature ?? 0.3;
        const timeoutMs = opts?.timeout ?? LLM_COMPLETION_TIMEOUT_MS;
        const model = opts?.model || DEFAULT_LLM_MODEL;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            let fullText = '';

            const stream = await traceProviderCall(
                {
                    ...(opts?.traceId !== undefined && { traceId: opts.traceId }),
                    ...(opts?.sessionId !== undefined && { sessionId: opts.sessionId }),
                    provider: 'openai',
                    operation: 'completeStream',
                    retryCount: 0,
                },
                async () => {
                    return await openai.chat.completions.create({
                        model,
                        messages: toInput(messages) as any,
                        temperature,
                        stream: true
                    }, { signal: controller.signal });
                },
                (event) => {
                    event.model = model;
                    // Token counts not available during streaming
                    event.costUnknown = true;
                }
            );

            for await (const chunk of stream) {
                const delta = chunk.choices[0]?.delta?.content || '';
                if (delta) {
                    fullText += delta;
                    onChunk(delta);
                }
            }

            clearTimeout(t);
            logger.debug({ lengthChars: fullText.length }, '[LLM] Stream completed');
            return fullText;
        } catch (e: any) {
            clearTimeout(t);
            logger.error({ error: e?.status ?? e?.code ?? e?.name }, '[LLM] Stream failed');
            throw e;
        }
    }
}
