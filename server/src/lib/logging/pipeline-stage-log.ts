/**
 * Stage start/end spans. Default on locally, off in production unless
 * LOG_PIPELINE_STAGES=true (set on ECS only while debugging).
 * Failures stay on logger.error regardless.
 */

import { logger } from '../logger/structured-logger.js';

export function isPipelineStageLogEnabled(): boolean {
  const raw = (process.env.LOG_PIPELINE_STAGES ?? '').trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  return process.env.NODE_ENV !== 'production';
}

export function logStageBoundary(
  fields: Record<string, unknown>,
  msg: string
): void {
  if (!isPipelineStageLogEnabled()) return;
  logger.info(fields, msg);
}
