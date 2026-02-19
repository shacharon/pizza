/**
 * Post-Constraints Stage - Route2 Pipeline
 *
 * Add optional AbortSignal support for parallel orchestration.
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

export async function executePostConstraintsStage(
    request: SearchRequest,
    context: Route2Context,
    signal?: AbortSignal
): Promise<PostConstraints> {
    const { requestId, traceId, sessionId, llmProvider } = context;
    const { queryLen, queryHash } = sanitizeQuery(request.query);

    const startTime = startStage(context, 'post_constraints', { queryLen, queryHash });

    try {
        const messages: Message[] = [
            { role: 'system', content: POST_CONSTRAINTS_SYSTEM_PROMPT },
            { role: 'user', content: request.query }
        ];

        const response = await llmProvider.completeJSON(
            messages,
            PostConstraintsSchema,
            {
                temperature: 0,
                timeout: 3500,
                requestId,
                ...(traceId && { traceId }),
                ...(sessionId && { sessionId }),
                ...(signal && { signal }), // provider may ignore if unsupported
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
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const isAborted = signal?.aborted === true;
        const isTimeout = errorMsg.includes('timeout') || errorMsg.includes('AbortError');

        logger.warn(
            {
                requestId,
                pipelineVersion: 'route2',
                stage: 'post_constraints',
                event: 'stage_failed',
                error: errorMsg,
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
