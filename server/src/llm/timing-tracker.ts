/**
 * Timing Tracker
 * Tracks and logs LLM operation timing metrics
 */

import { performance } from 'node:perf_hooks';
import { logger } from '../lib/logger/structured-logger.js';

/**
 * Timing stages
 */
interface TimingStages {
  t0: number; // Start (before prompt construction)
  t1: number; // After schema prepared
  t2: number; // Immediately before LLM call
  t3: number; // After LLM returns (or error)
  t4?: number; // After parse/validate complete (success only)
}

/**
 * Computed metrics
 */
interface TimingMetrics {
  buildPromptMs: number;
  networkMs: number;
  parseMs: number;
  totalMs: number;
}

/**
 * Timing context for logging
 */
export interface TimingContext {
  stage?: string | undefined;
  promptVersion?: string | undefined;
  schemaHash?: string | undefined;
  requestId?: string | undefined;
  traceId?: string | undefined;
  sessionId?: string | undefined;
  model: string;
  timeoutMs: number;
  promptChars: number;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  attempt: number;
}

/**
 * TimingTracker
 * Handles timing instrumentation for LLM calls
 */
export class TimingTracker {
  private stages: Partial<TimingStages> = {};

  /**
   * Mark timing stage
   */
  mark(stage: keyof TimingStages): void {
    this.stages[stage] = performance.now();
  }

  /**
   * Compute timing metrics from marked stages
   */
  computeMetrics(): TimingMetrics {
    const t0 = this.stages.t0 ?? 0;
    const t1 = this.stages.t1 ?? t0;
    const t2 = this.stages.t2 ?? t1;
    const t3 = this.stages.t3 ?? t2;
    const t4 = this.stages.t4 ?? t3;

    return {
      buildPromptMs: Math.round((t1 - t0) * 100) / 100,
      networkMs: Math.round((t3 - t2) * 100) / 100,
      parseMs: Math.round((t4 - t3) * 100) / 100,
      totalMs: Math.round((t4 - t0) * 100) / 100
    };
  }

  /**
   * Log timing metrics (success)
   */
  logSuccess(context: TimingContext): void {
    const metrics = this.computeMetrics();
    const isSlow = metrics.networkMs > 1500 || metrics.totalMs > 1500;
    const logLevel = isSlow ? 'info' : 'debug';

    logger[logLevel]({
      msg: 'llm_gate_timing',
      stage: context.stage || 'unknown',
      promptVersion: context.promptVersion || 'unknown',
      schemaHash: context.schemaHash,
      requestId: context.requestId,
      traceId: context.traceId,
      sessionId: context.sessionId,
      attempt: context.attempt,
      model: context.model,
      timeoutMs: context.timeoutMs,
      timeoutHit: false,
      ...metrics,
      promptChars: context.promptChars,
      inputTokens: context.inputTokens ?? null,
      outputTokens: context.outputTokens ?? null,
      retriesCount: context.attempt - 1,
      success: true,
      ...(isSlow && { slow: true })
    }, 'llm_gate_timing');
  }

  /**
   * Log timing metrics (failure)
   */
  logFailure(
    context: TimingContext,
    error: {
      type: string;
      reason: string;
      statusCode?: number | undefined;
    }
  ): void {
    // For failures, t4 won't exist, so use t3 for total
    const t0 = this.stages.t0 ?? 0;
    const t1 = this.stages.t1 ?? t0;
    const t2 = this.stages.t2 ?? t1;
    const t3 = this.stages.t3 ?? t2;

    const metrics = {
      buildPromptMs: Math.round((t1 - t0) * 100) / 100,
      networkMs: Math.round((t3 - t2) * 100) / 100,
      parseMs: 0,
      totalMs: Math.round((t3 - t0) * 100) / 100
    };

    const isTimeout = error.type === 'abort_timeout';

    logger.warn({
      msg: 'llm_gate_timing',
      stage: context.stage || 'unknown',
      promptVersion: context.promptVersion || 'unknown',
      requestId: context.requestId,
      traceId: context.traceId,
      sessionId: context.sessionId,
      attempt: context.attempt,
      model: context.model,
      timeoutMs: context.timeoutMs,
      timeoutHit: isTimeout,
      ...metrics,
      promptChars: context.promptChars,
      inputTokens: null,
      outputTokens: null,
      retriesCount: context.attempt - 1,
      success: false,
      errorType: error.type,
      errorReason: error.reason,
      statusCode: error.statusCode ?? null
    }, 'llm_gate_timing');
  }

  /**
   * Reset tracker for new operation
   */
  reset(): void {
    this.stages = {};
  }
}
