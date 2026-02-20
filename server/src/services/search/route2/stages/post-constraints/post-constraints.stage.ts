/**
 * Post-Constraints Stage - Route2 Pipeline
 *
 * Add optional AbortSignal support for parallel orchestration.
 * Compact prompt: query, uiLanguage, regionCode, top3 candidates only.
 */

import type { SearchRequest } from '../../../types/search-request.dto.js';
import type { Route2Context } from '../../types.js';
import type { Message } from '../../../../../llm/types.js';
import { logger } from '../../../../../lib/logger/structured-logger.js';
import { startStage, endStage } from '../../../../../lib/telemetry/stage-timer.js';
import { sanitizeQuery } from '../../../../../lib/telemetry/query-sanitizer.js';
import {
    PostConstraintsSchema,
    type PostConstraints,
    buildDefaultPostConstraints
} from '../../shared/post-constraints.types.js';
import {
    POST_CONSTRAINTS_SYSTEM_PROMPT,
    POST_CONSTRAINTS_JSON_SCHEMA,
    POST_CONSTRAINTS_SCHEMA_HASH,
    POST_CONSTRAINTS_PROMPT_HASH,
    POST_CONSTRAINTS_PROMPT_VERSION
} from '../../prompts/post-constraints.prompt.js';

/** Timeout for post_constraints LLM call only (ms). */
const POST_CONSTRAINTS_TIMEOUT_MS = 4500;

export type PostConstraintsUserPayload = {
    query: string;
    uiLanguage: string;
    regionCode: string;
    top: Array<{ name: string; rating?: number; distanceMeters?: number; priceLevel?: number; openNow?: boolean }>;
};

/**
 * Build compact user payload for post_constraints (query, uiLanguage, regionCode, top3).
 * top is empty when stage runs in parallel with Google.
 */
export function buildPostConstraintsUserPayload(
    request: SearchRequest,
    context: Route2Context
): PostConstraintsUserPayload {
    const uiLanguage = context.queryLanguage === 'he' ? 'he' : 'en';
    const regionCode = context.userRegionCode ?? 'IL';
    const top: PostConstraintsUserPayload['top'] = [];
    return {
        query: request.query,
        uiLanguage,
        regionCode,
        top
    };
}

export async function executePostConstraintsStage(
    request: SearchRequest,
    context: Route2Context,
    signal?: AbortSignal
): Promise<PostConstraints> {
    const { requestId, traceId, sessionId, llmProvider } = context;
    const { queryLen, queryHash } = sanitizeQuery(request.query);

    const startTime = startStage(context, 'post_constraints', { queryLen, queryHash });

    const userPayload = buildPostConstraintsUserPayload(request, context);
    const userContent = JSON.stringify(userPayload);
    const messages: Message[] = [
        { role: 'system', content: POST_CONSTRAINTS_SYSTEM_PROMPT },
        { role: 'user', content: userContent }
    ];

    const promptChars = POST_CONSTRAINTS_SYSTEM_PROMPT.length + userContent.length;
    const estTokens = Math.ceil(promptChars / 4);
    const topSentCount = userPayload.top.length;
    logger.info(
        {
            requestId,
            pipelineVersion: 'route2',
            stage: 'post_constraints',
            event: 'post_constraints_prompt_stats',
            promptChars,
            estTokens,
            topSentCount
        },
        '[ROUTE2] Post-constraints prompt stats'
    );

    try {
        const response = await llmProvider.completeJSON(
            messages,
            PostConstraintsSchema,
            {
                temperature: 0,
                timeout: POST_CONSTRAINTS_TIMEOUT_MS,
                requestId,
                ...(traceId && { traceId }),
                ...(sessionId && { sessionId }),
                ...(signal && { signal }),
                promptVersion: POST_CONSTRAINTS_PROMPT_VERSION,
                promptHash: POST_CONSTRAINTS_PROMPT_HASH,
                schemaHash: POST_CONSTRAINTS_SCHEMA_HASH,
                stage: 'post_constraints'
            } as any,
            POST_CONSTRAINTS_JSON_SCHEMA
        );

        const parsed = PostConstraintsSchema.safeParse(response.data);
        if (!parsed.success) {
            logger.warn(
                {
                    requestId,
                    pipelineVersion: 'route2',
                    stage: 'post_constraints',
                    event: 'invalid_output',
                    issues: parsed.error.issues?.slice(0, 5)
                },
                '[ROUTE2] Post-constraints invalid output, using defaults'
            );
            return buildDefaultPostConstraints();
        }

        endStage(context, 'post_constraints', startTime);

        return parsed.data;
    } catch (error: unknown) {
        const err = error as { message?: string; errorType?: string };
        const errorMsg = err?.message ?? (typeof error === 'string' ? error : String(error));
        const errorType = err?.errorType ?? '';
        const isAborted = signal?.aborted === true;
        const isTimeout =
            errorType === 'abort_timeout' ||
            errorMsg.toLowerCase().includes('timeout') ||
            errorMsg.toLowerCase().includes('abort');

        logger.warn(
            {
                requestId,
                pipelineVersion: 'route2',
                stage: 'post_constraints',
                event: 'stage_failed',
                error: errorMsg,
                errorType: errorType || undefined,
                isTimeout,
                isAborted,
                fallback: 'default_constraints'
            },
            '[ROUTE2] Post-constraints extraction failed, using defaults'
        );

        endStage(context, 'post_constraints', startTime);

        return buildDefaultPostConstraints();
    }
}
