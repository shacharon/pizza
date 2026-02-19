import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
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
 * Uses zod-to-json-schema library for consistency with OpenAI provider
 *
 * @param zodSchema - Zod schema (source of truth)
 * @param _name - Schema name (unused, kept for API compatibility)
 * @returns JSON Schema object and 12-char hash for observability
 */
export function buildLLMJsonSchema<T extends z.ZodTypeAny>(
    zodSchema: T,
    _name?: string
): LLMJsonSchemaResult {
    const jsonSchema = zodToJsonSchema(zodSchema as any, {
        target: "openApi3",
        $refStrategy: "none",
    }) as unknown;

    const cleanedUnknown = removeMetadata(jsonSchema);

    if (typeof cleanedUnknown !== "object" || cleanedUnknown === null || Array.isArray(cleanedUnknown)) {
        throw new Error(`buildLLMJsonSchema: root must be an object schema`);
    }

    const cleanSchema = cleanedUnknown as Record<string, unknown>;

    // Ensure root is object type (required for OpenAI Structured Outputs)
    if (cleanSchema.type !== "object") {
        throw new Error(`buildLLMJsonSchema: root type must be "object", got "${String(cleanSchema.type)}"`);
    }

    // Ensure properties exist
    if (!cleanSchema.properties || typeof cleanSchema.properties !== "object" || cleanSchema.properties === null) {
        throw new Error(`buildLLMJsonSchema: root object must have "properties"`);
    }

    // Compute stable hash for observability
    const schemaString = stableStringify(cleanSchema);
    const schemaHash = createHash("sha256").update(schemaString, "utf8").digest("hex").slice(0, 12);

    return { schema: cleanSchema, schemaHash };
}

/**
 * Remove non-functional metadata fields from a JSON schema.
 * Preserves structure and types (object/array/primitives).
 */
function removeMetadata(value: unknown): unknown {
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(removeMetadata);
    if (typeof value !== "object") return value;

    const obj = value as Record<string, unknown>;
    const cleaned: Record<string, unknown> = {};

    for (const [key, v] of Object.entries(obj)) {
        if (key === "$schema" || key === "$id") continue;
        cleaned[key] = removeMetadata(v);
    }

    return cleaned;
}

/**
 * Deterministic JSON stringify (sorts keys recursively).
 */
function stableStringify(value: unknown): string {
    return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
    if (value === null) return null;
    if (Array.isArray(value)) return value.map(sortKeysDeep);
    if (typeof value !== "object") return value;

    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
        out[key] = sortKeysDeep(obj[key]);
    }
    return out;
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
            schemaHash?: string;
            requestId?: string;
            stage?: string;
        },
        staticJsonSchema?: any
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
