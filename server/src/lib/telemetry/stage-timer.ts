/**
 * Stage Timer Utility
 * Provides consistent timing instrumentation for pipeline stages
 * 
 * LOG NOISE REDUCTION:
 * - Major events (pipeline_selected, pipeline_completed/failed) always at INFO
 * - Stage events: INFO if >2000ms (slow threshold), DEBUG otherwise
 */

import { performance } from 'perf_hooks';
import type { Route2Context } from '../../services/search/route2/types.js';
import { logger } from '../logger/structured-logger.js';
import { SLOW_THRESHOLDS } from '../logging/sampling.js';

export interface StageTimerExtra {
  [key: string]: any;
}

/**
 * Major pipeline events that should always be INFO
 */
const MAJOR_EVENTS = new Set([
  'pipeline_selected',
  'pipeline_completed',
  'pipeline_failed',
  'gate2',
  'intent',
  'google_maps'
]);

/**
 * Check if stage is a major event (always INFO)
 */
function isMajorStage(stage: string): boolean {
  return MAJOR_EVENTS.has(stage);
}

/**
 * Start a stage and log stage_started event
 */
export function startStage(
  ctx: Route2Context,
  stage: string,
  extra?: StageTimerExtra
): number {
  const startTime = performance.now();

  // Initialize durations map if not exists
  if (!ctx.timings) {
    ctx.timings = {};
  }

  // Major stages always INFO, others DEBUG
  const logLevel = isMajorStage(stage) ? 'info' : 'debug';

  logger[logLevel]({
    requestId: ctx.requestId,
    ...(ctx.traceId && { traceId: ctx.traceId }),
    ...(ctx.sessionId && { sessionId: ctx.sessionId }),
    pipelineVersion: 'route2',
    stage,
    event: 'stage_started',
    ...extra
  }, `[ROUTE2] ${stage} started`);

  return startTime;
}

/**
 * End a stage, calculate duration, store in context, and log stage_completed
 */
export function endStage(
  ctx: Route2Context,
  stage: string,
  startTime: number,
  extra?: StageTimerExtra
): number {
  const durationMs = Math.round(performance.now() - startTime);

  // Store in context for pipeline decomposition
  if (!ctx.timings) {
    ctx.timings = {};
  }

  // Store with consistent naming: stageNameMs
  const key = `${stage.replace(/_/g, '')}Ms` as keyof typeof ctx.timings;
  (ctx.timings as any)[key] = durationMs;

  // Threshold-based logging: INFO if major stage OR slow (>2000ms)
  const isSlow = durationMs > SLOW_THRESHOLDS.STAGE;
  const logLevel = isMajorStage(stage) || isSlow ? 'info' : 'debug';

  logger[logLevel]({
    requestId: ctx.requestId,
    ...(ctx.traceId && { traceId: ctx.traceId }),
    ...(ctx.sessionId && { sessionId: ctx.sessionId }),
    pipelineVersion: 'route2',
    stage,
    event: 'stage_completed',
    durationMs,
    ...(isSlow && !isMajorStage(stage) && { slow: true }),
    ...extra
  }, `[ROUTE2] ${stage} completed`);

  return durationMs;
}

/**
 * Simple timer for non-stage operations (jobstore, ws_publish, etc.)
 */
export function startTimer(): { stop: () => number; elapsed: () => number } {
  const startTime = performance.now();
  return {
    stop: () => Math.round(performance.now() - startTime),
    elapsed: () => Math.round(performance.now() - startTime)
  };
}

/**
 * Wrap an async operation with timing
 */
export async function withTimer<T>(
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  const timer = startTimer();
  const result = await fn();
  return { result, durationMs: timer.stop() };
}

/**
 * Wrap a sync operation with timing
 */
export function withTimerSync<T>(
  fn: () => T
): { result: T; durationMs: number } {
  const timer = startTimer();
  const result = fn();
  return { result, durationMs: timer.stop() };
}
