import { z } from "zod";
import type { LLMProvider, LLMCompletionResult, Message } from "./types.js";
import OpenAI from "openai";
import {
    DEFAULT_LLM_MODEL,
    LLM_JSON_TIMEOUT_MS,
    LLM_RETRY_ATTEMPTS,
    LLM_RETRY_BACKOFF_MS,
    LLM_COMPLETION_TIMEOUT_MS
} from "../config/index.js";
import { traceProviderCall, calculateOpenAICost } from "../lib/telemetry/providerTrace.js";
import { logger } from "../lib/logger/structured-logger.js";
import { SchemaConverter } from "./schema-converter.js";
import { RetryHandler } from "./retry-handler.js";
import { TimingTracker } from "./timing-tracker.js";

// Lazy-initialized OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
    if (!openaiClient) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY environment variable is required');
        }
        openaiClient = new OpenAI({
            apiKey,
            timeout: LLM_JSON_TIMEOUT_MS,
            maxRetries: 0
        });
    }
    return openaiClient;
}

function toInput(messages: Message[]) {
    return messages.map(m => ({ role: m.role, content: m.content }));
}

export class OpenAiProvider implements LLMProvider {
    private schemaConverter = new SchemaConverter();
    private retryHandler = new RetryHandler({
        maxAttempts: LLM_RETRY_ATTEMPTS,
        backoffMs: LLM_RETRY_BACKOFF_MS
    });

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
            schemaHash?: string;  // Hash of JSON Schema for observability
            requestId?: string;  // For timing correlation
            stage?: string;       // For stage identification (e.g., "intent_gate")
        },
        staticJsonSchema?: any  // Optional static JSON Schema (bypasses Zod conversion)
    ): Promise<LLMCompletionResult<z.infer<T>>> {
        const temperature = opts?.temperature ?? 0;
        const timeoutMs = opts?.timeout ?? LLM_JSON_TIMEOUT_MS;
        const tStart = Date.now();

        // Initialize timing tracker
        const timing = new TimingTracker();
        timing.mark('t0');

        // Convert schema
        const conversionResult = staticJsonSchema
            ? this.schemaConverter.convertStatic(staticJsonSchema, opts)
            : this.schemaConverter.convert(schema, opts);

        const { jsonSchema, schemaHash, schemaVersion } = conversionResult;
        
        // DEFENSIVE: Validate that jsonSchema.required exists and includes all properties
        // V5 SCHEMA: mode is required, textQuery is removed (generated deterministically)
        if (staticJsonSchema && opts?.stage === 'textsearch_mapper') {
            const schemaProperties = Object.keys(jsonSchema.properties || {});
            const schemaRequired = jsonSchema.required || [];
            const hasMode = schemaRequired.includes('mode');
            const hasTextQuery = schemaRequired.includes('textQuery'); // Should NOT be present in v5
            
            if (!hasMode) {
                logger.error({
                    traceId: opts?.traceId,
                    stage: opts?.stage,
                    schemaProperties,
                    schemaRequired,
                    hasMode,
                    staticSchemaProvided: !!staticJsonSchema
                }, '[LLM] CRITICAL: mode missing from required array in final schema!');
            }
            
            if (hasTextQuery) {
                logger.warn({
                    traceId: opts?.traceId,
                    stage: opts?.stage,
                    schemaProperties,
                    schemaRequired,
                    hasTextQuery,
                    staticSchemaProvided: !!staticJsonSchema
                }, '[LLM] WARNING: textQuery found in schema - should be removed in v5 (generated deterministically)');
            }
        }
        
        timing.mark('t1');

        // Calculate prompt size
        const promptChars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
        const model = (opts as any)?.model || DEFAULT_LLM_MODEL;

        // Execute with retry
        return await this.retryHandler.executeWithRetry<LLMCompletionResult<z.infer<T>>>(
            async (attempt) => {
                const controller = new AbortController();
                const t = setTimeout(() => controller.abort(), timeoutMs);

                timing.mark('t2');

                try {

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
                            const client = getOpenAIClient();
                            return await client.chat.completions.create({
                                model,
                                messages: toInput(messages) as any,
                                temperature,
                                response_format: {
                                    type: "json_schema",
                                    json_schema: {
                                        name: "response",
                                        schema: jsonSchema,
                                        strict: true
                                    }
                                } as any
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
                            (event as any).schemaVersion = schemaVersion;

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
                    timing.mark('t3');

                    // Extract JSON content from OpenAI's response
                    const content = resp.choices[0]?.message?.content;

                    if (!content) {
                        logger.error({
                            traceId: opts?.traceId,
                            refusal: (resp.choices[0]?.message as any)?.refusal,
                            finishReason: resp.choices[0]?.finish_reason
                        }, '[LLM] Structured Outputs returned no content');
                        throw new Error('OpenAI Structured Outputs returned no content');
                    }

                    // Parse JSON and validate with Zod
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
                    timing.mark('t4');

                    // Extract token usage
                    const usage = (resp as any)?.usage;
                    const inputTokens = usage?.prompt_tokens ?? usage?.input_tokens ?? null;
                    const outputTokens = usage?.completion_tokens ?? usage?.output_tokens ?? null;

                    // Log timing
                    timing.logSuccess({
                        stage: opts?.stage ?? undefined,
                        promptVersion: opts?.promptVersion ?? undefined,
                        schemaHash: opts?.schemaHash ?? schemaHash,
                        requestId: opts?.requestId ?? undefined,
                        traceId: opts?.traceId ?? undefined,
                        sessionId: opts?.sessionId ?? undefined,
                        attempt: attempt + 1,
                        model,
                        timeoutMs,
                        promptChars,
                        inputTokens: inputTokens ?? undefined,
                        outputTokens: outputTokens ?? undefined
                    });

                    logger.debug({
                        attempts: attempt + 1,
                        durationMs: Date.now() - tStart,
                        schemaHash
                    }, '[LLM] Structured Outputs completion successful');

                    return {
                        data: validated,
                        usage: {
                            prompt_tokens: inputTokens ?? undefined,
                            completion_tokens: outputTokens ?? undefined,
                            total_tokens: (inputTokens && outputTokens) ? inputTokens + outputTokens : undefined
                        },
                        model
                    };
                } catch (e: any) {
                    clearTimeout(t);
                    timing.mark('t3');

                    // Categorize error and log timing
                    const category = this.retryHandler.categorizeError(e);
                    timing.logFailure(
                        {
                            stage: opts?.stage ?? undefined,
                            promptVersion: opts?.promptVersion ?? undefined,
                            requestId: opts?.requestId ?? undefined,
                            traceId: opts?.traceId ?? undefined,
                            sessionId: opts?.sessionId ?? undefined,
                            attempt: attempt + 1,
                            model,
                            timeoutMs,
                            promptChars
                        },
                        {
                            type: category.type,
                            reason: category.reason,
                            statusCode: category.statusCode
                        }
                    );

                    // Re-throw for retry handler to decide
                    throw e;
                }
            },
            {
                traceId: opts?.traceId ?? undefined
            }
        );
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
                    const client = getOpenAIClient();
                    return await client.chat.completions.create({
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
                    const client = getOpenAIClient();
                    return await client.chat.completions.create({
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
