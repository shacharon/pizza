/**
 * Orchestrator Parallel Tasks Module
 * Handles firing and managing parallel LLM tasks (base_filters, post_constraints)
 */

import type { SearchRequest } from '../types/search-request.dto.js';
import type { Route2Context, MappingRoute } from './types.js';
import type { PreGoogleBaseFilters } from './shared/shared-filters.types.js';
import type { PostConstraints } from './shared/post-constraints.types.js';
import { resolveBaseFiltersLLM } from './shared/base-filters-llm.js';
import { executePostConstraintsStage } from './stages/post-constraints/post-constraints.stage.js';
import { logger } from '../../../lib/logger/structured-logger.js';
import { DEFAULT_POST_CONSTRAINTS, DEFAULT_BASE_FILTERS } from './failure-messages.js';

/**
 * Fire parallel tasks immediately after Gate2
 * Returns promises that can be awaited later in the pipeline
 * @param route Intent route (TEXTSEARCH | NEARBY | LANDMARK) for base_filters context
 */
export function fireParallelTasks(
  request: SearchRequest,
  ctx: Route2Context,
  route: MappingRoute
): {
  baseFiltersPromise: Promise<PreGoogleBaseFilters>;
  postConstraintsPromise: Promise<PostConstraints>;
} {
  const { requestId } = ctx;

  logger.info(
    { requestId, pipelineVersion: 'route2', event: 'parallel_started', route },
    '[ROUTE2] Starting parallel tasks (base_filters + post_constraints + intent chain)'
  );

  const baseFiltersPromise = resolveBaseFiltersLLM({
    query: request.query,
    route,
    llmProvider: ctx.llmProvider,
    requestId: ctx.requestId,
    ...(ctx.traceId && { traceId: ctx.traceId }),
    ...(ctx.sessionId && { sessionId: ctx.sessionId })
  }).catch((err) => {
    logger.warn(
      {
        requestId,
        pipelineVersion: 'route2',
        stage: 'base_filters_llm',
        event: 'stage_failed',
        error: err instanceof Error ? err.message : String(err),
        fallback: 'default_base_filters'
      },
      '[ROUTE2] Base filters extraction failed, using defaults'
    );
    return DEFAULT_BASE_FILTERS;
  });

  const postConstraintsPromise = executePostConstraintsStage(request, ctx).catch((err) => {
    logger.warn(
      {
        requestId,
        pipelineVersion: 'route2',
        stage: 'post_constraints',
        event: 'stage_failed',
        error: err instanceof Error ? err.message : String(err),
        fallback: 'default_post_constraints'
      },
      '[ROUTE2] Post-constraints extraction failed, using defaults'
    );
    return DEFAULT_POST_CONSTRAINTS;
  });

  return { baseFiltersPromise, postConstraintsPromise };
}

/**
 * Drain parallel promises to prevent unhandled rejections
 * Should be called in finally block
 */
export async function drainParallelPromises(
  baseFiltersPromise: Promise<PreGoogleBaseFilters> | null,
  postConstraintsPromise: Promise<PostConstraints> | null
): Promise<void> {
  if (baseFiltersPromise) {
    await baseFiltersPromise.catch(() => {
      // Already logged in the promise's own catch handler
    });
  }
  if (postConstraintsPromise) {
    await postConstraintsPromise.catch(() => {
      // Already logged in the promise's own catch handler
    });
  }
}
