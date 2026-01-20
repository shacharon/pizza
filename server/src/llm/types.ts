import { z } from "zod";
import { createHash } from "crypto";

export type Message = {
    role: "system" | "user" | "assistant";
    content: string;
};

/**
 * Result from building LLM JSON Schema
 */
export interface LLMJsonSchemaResult {
    schema: Record<string, unknown>;
    schemaHash: string;
}

/**
 * Build JSON Schema for LLM from Zod schema
 * Uses Zod v4's native toJSONSchema() method
 * 
 * @param zodSchema - Zod schema (source of truth)
 * @param _name - Schema name (unused, kept for API compatibility)
 * @returns JSON Schema object and 12-char hash for observability
 */
export function buildLLMJsonSchema<T extends z.ZodTypeAny>(
    zodSchema: T,
    _name?: string
): LLMJsonSchemaResult {
    // Use Zod v4's native toJSONSchema() method
    const jsonSchema = (zodSchema as any).toJSONSchema({
        target: 'openapi-3.0',
        $refStrategy: 'none'
    }) as Record<string, unknown>;

    // Remove $schema and $id fields
    const cleanSchema = removeMetadata(jsonSchema);

    // Compute stable hash for observability
    const schemaString = JSON.stringify(cleanSchema);
    const schemaHash = createHash('sha256')
        .update(schemaString, 'utf8')
        .digest('hex')
        .slice(0, 12);

    return { schema: cleanSchema, schemaHash };
}

function removeMetadata(schema: unknown): Record<string, unknown> {
    if (typeof schema !== 'object' || schema === null) {
        return schema as Record<string, unknown>;
    }
    if (Array.isArray(schema)) {
        return schema.map(removeMetadata) as unknown as Record<string, unknown>;
    }
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(schema)) {
        if (key === '$schema' || key === '$id') continue;
        if (Array.isArray(value)) {
            cleaned[key] = value.map(removeMetadata);
        } else if (typeof value === 'object' && value !== null) {
            cleaned[key] = removeMetadata(value);
        } else {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

export interface LLMCompletionResult<T> {
    data: T;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
    model?: string;
}

export interface LLMProvider {
    completeJSON<T extends z.ZodTypeAny>(
        messages: Message[],
        schema: T,
        opts?: {
            model?: string;
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
    ): Promise<LLMCompletionResult<z.infer<T>>>;

    complete(
        messages: Message[],
        opts?: {
            model?: string;
            temperature?: number;
            timeout?: number;
        }
    ): Promise<string>;

    /**
     * Phase 4: Stream completion with chunk callback
     * Returns full text when done
     */
    completeStream(
        messages: Message[],
        onChunk: (text: string) => void,
        opts?: {
            model?: string;
            temperature?: number;
            timeout?: number;
            traceId?: string;
            sessionId?: string;
        }
    ): Promise<string>;
}
