import { z } from "zod";
import type { LLMProvider, Message } from "./types.js";
import { openai } from "../services/openai.client.js";
import {
    DEFAULT_LLM_MODEL,
    LLM_JSON_TIMEOUT_MS,
    LLM_RETRY_ATTEMPTS,
    LLM_RETRY_BACKOFF_MS,
    LLM_COMPLETION_TIMEOUT_MS
} from "../config/index.js";

function sleep(ms: number) { return new Promise(res => setTimeout(res, ms)); }

function toInput(messages: Message[]) {
    return messages.map(m => ({ role: m.role, content: m.content }));
}

function extractJsonLoose(text: string): unknown | null {
    if (!text) return null;
    const raw = text.trim();
    const fence = raw.match(/```(?:json)?\n([\s\S]*?)```/i);
    const candidate = fence?.[1]?.trim() ?? raw;
    try { return JSON.parse(candidate); } catch { }
    const s = candidate; let depth = 0; let start = -1; let inStr = false; let esc = false;
    for (let i = 0; i < s.length; i++) {
        const ch = s[i];
        if (inStr) { if (esc) { esc = false; } else if (ch === '\\') { esc = true; } else if (ch === '"') { inStr = false; } continue; }
        if (ch === '"') { inStr = true; continue; }
        if (ch === '{') { if (depth === 0) start = i; depth++; }
        else if (ch === '}') { if (depth > 0) depth--; if (depth === 0 && start !== -1) { const slice = s.slice(start, i + 1); try { return JSON.parse(slice); } catch { } start = -1; } }
    }
    return null;
}

export class OpenAiProvider implements LLMProvider {
    async completeJSON<T extends z.ZodTypeAny>(
        messages: Message[],
        schema: T,
        opts?: { temperature?: number; timeout?: number }
    ): Promise<z.infer<T>> {
        const temperature = opts?.temperature ?? 0;
        const timeoutMs = opts?.timeout ?? LLM_JSON_TIMEOUT_MS;
        const maxAttempts = LLM_RETRY_ATTEMPTS;
        const backoffs = LLM_RETRY_BACKOFF_MS;
        const tStart = Date.now();
        let lastErr: any;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if ((backoffs[attempt] ?? 0) > 0) await sleep(backoffs[attempt] ?? 0);
            const controller = new AbortController();
            const t = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const resp = await openai.responses.create({
                    model: (opts as any)?.model || DEFAULT_LLM_MODEL,
                    input: toInput(messages),
                    temperature
                }, { signal: controller.signal });
                clearTimeout(t);
                const raw = resp.output_text || '';
                // Strict parse first via Zod
                try {
                    const parsed1 = JSON.parse(raw);
                    const validated = schema.parse(parsed1);
                    // eslint-disable-next-line no-console
                    console.log(`[llm] ok attempts=${attempt + 1} durMs=${Date.now() - tStart}`);
                    return validated;
                } catch {
                    const loose = extractJsonLoose(raw);
                    const validated = schema.parse(loose);
                    // eslint-disable-next-line no-console
                    console.log(`[llm] ok(loose) attempts=${attempt + 1} durMs=${Date.now() - tStart}`);
                    return validated as any;
                }
            } catch (e: any) {
                clearTimeout(t);
                lastErr = e;
                const status = e?.status ?? e?.code ?? e?.name;
                
                // Only retry transport/server errors (NOT JSON/Zod validation errors)
                const isTransportError = status === 429 || 
                                          (typeof status === 'number' && status >= 500) || 
                                          e?.name === 'AbortError';
                const isParseError = e?.name === 'ZodError' || 
                                     e?.name === 'SyntaxError' || 
                                     e?.message?.includes('JSON');
                
                // Parse errors: try ONE repair attempt
                if (isParseError && attempt === 0) {
                    // eslint-disable-next-line no-console
                    console.warn(`[llm] Parse error on attempt 1, will try repair on attempt 2`);
                    // Next attempt will use same prompt (no special repair logic for now)
                    continue;
                }
                
                // For parse errors on 2nd+ attempt OR non-retriable errors: fail fast
                if (isParseError || !isTransportError) {
                    // eslint-disable-next-line no-console
                    console.error(`[llm] Non-retriable error, failing fast: ${status}`);
                    throw e;
                }
                
                // Transport errors: retry if attempts remaining
                // eslint-disable-next-line no-console
                console.warn(`[llm] Retriable transport error, attempt ${attempt + 1}/${maxAttempts}: ${status}`);
                if (attempt === maxAttempts - 1) {
                    // eslint-disable-next-line no-console
                    console.error(`[llm] failed attempts=${attempt + 1} durMs=${Date.now() - tStart}`);
                    throw e;
                }
            }
        }
        throw lastErr ?? new Error('LLM failed');
    }

    async complete(
        messages: Message[],
        opts?: { temperature?: number; timeout?: number; model?: string; }
    ): Promise<string> {
        const temperature = opts?.temperature ?? 0;
        const timeoutMs = opts?.timeout ?? LLM_COMPLETION_TIMEOUT_MS;

        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const resp = await openai.responses.create({
                model: opts?.model || DEFAULT_LLM_MODEL,
                input: toInput(messages),
                temperature
            }, { signal: controller.signal });
            clearTimeout(t);
            return resp.output_text || '';
        } catch (e: any) {
            clearTimeout(t);
            console.error('[llm] simple complete failed', e?.status ?? e?.code ?? e?.name);
            throw e;
        }
    }
}
