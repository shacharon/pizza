/**
 * Timing Utility - Consistent instrumentation for stage boundaries
 * Provides helpers for measuring execution time with minimal boilerplate
 */

export interface TimingResult<T> {
  result: T;
  durationMs: number;
}

/**
 * Execute a function and measure its duration
 * @param fn - The function to execute
 * @returns Result and duration in milliseconds
 */
export async function withTimer<T>(fn: () => Promise<T>): Promise<TimingResult<T>> {
  const startTime = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - startTime);
  return { result, durationMs };
}

/**
 * Execute a synchronous function and measure its duration
 * @param fn - The function to execute
 * @returns Result and duration in milliseconds
 */
export function withTimerSync<T>(fn: () => T): TimingResult<T> {
  const startTime = performance.now();
  const result = fn();
  const durationMs = Math.round(performance.now() - startTime);
  return { result, durationMs };
}

/**
 * Create a simple timer that can be stopped later
 * @returns Stop function that returns elapsed milliseconds
 */
export function startTimer(): () => number {
  const startTime = performance.now();
  return () => Math.round(performance.now() - startTime);
}

/**
 * Helper to create consistent stage boundary logs
 */
export interface StageBoundary {
  requestId: string;
  pipelineVersion: string;
  stage: string;
  event: 'stage_started' | 'stage_completed';
  durationMs?: number;
  [key: string]: any;
}

export function createStageBoundaryLog(
  requestId: string,
  pipelineVersion: string,
  stage: string,
  event: 'stage_started' | 'stage_completed',
  additionalFields: Record<string, any> = {}
): StageBoundary {
  return {
    requestId,
    pipelineVersion,
    stage,
    event,
    ...additionalFields
  };
}
