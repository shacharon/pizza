/**
 * One INFO line per search for CloudWatch (prod).
 * Filter: event = "search_audit"
 * Stage start/end: local by default; prod only if LOG_PIPELINE_STAGES=true.
 */

import { logger } from '../../../lib/logger/structured-logger.js';
import { sanitizeQuery } from '../../../lib/telemetry/query-sanitizer.js';
import type { SearchRequest } from '../types/search-request.dto.js';
import type { SearchResponse } from '../types/search-response.dto.js';
import type { Route2Context } from './types.js';

export type SearchAuditKind =
  | 'results'
  | 'clarify'
  | 'not_food'
  | 'no_results'
  | 'error'
  | 'timeout'
  | 'debug';

export function classifySearchOutcome(
  response: SearchResponse | null,
  error?: unknown
): { good: boolean; kind: SearchAuditKind; reason: string } {
  if (error) {
    const name = error && typeof error === 'object' && 'name' in error ? String((error as { name: string }).name) : '';
    if (name === 'TimeoutError') {
      return { good: false, kind: 'timeout', reason: 'pipeline_timeout' };
    }
    const message = error instanceof Error ? error.message : 'unknown';
    return { good: false, kind: 'error', reason: message.slice(0, 120) };
  }

  if (!response) {
    return { good: false, kind: 'error', reason: 'no_response' };
  }

  const assistType = String(response.assist?.type ?? '').toUpperCase();
  const source = String(response.meta?.source ?? '');
  const failure = String(response.meta?.failureReason ?? 'NONE');
  const resultCount = Array.isArray(response.results) ? response.results.length : 0;

  if (assistType.includes('DEBUG') || source.includes('debug')) {
    return { good: false, kind: 'debug', reason: 'debug_stop' };
  }
  if (assistType.includes('GATE') || source.includes('gate_stop')) {
    return { good: false, kind: 'not_food', reason: failure || 'not_food' };
  }
  if (
    assistType.includes('CLARIFY') ||
    source.includes('clarify') ||
    failure === 'LOCATION_REQUIRED'
  ) {
    return { good: false, kind: 'clarify', reason: failure === 'NONE' ? 'clarify' : failure };
  }
  if (resultCount === 0) {
    return { good: false, kind: 'no_results', reason: failure === 'NONE' ? 'empty' : failure };
  }
  return { good: true, kind: 'results', reason: failure === 'NONE' ? 'ok' : failure };
}

export function initSearchAudit(ctx: Route2Context, request: SearchRequest): void {
  const { queryLen, queryHash, queryPreview } = sanitizeQuery(request.query ?? '');
  ctx.searchAudit = {
    ...ctx.searchAudit,
    queryLen,
    queryHash,
    queryPreview,
  };
}

export function logSearchAudit(
  request: SearchRequest,
  ctx: Route2Context,
  response: SearchResponse | null,
  error?: unknown
): void {
  if (ctx.searchAudit?.finishedLogged) return;
  if (!ctx.searchAudit) initSearchAudit(ctx, request);
  const audit = ctx.searchAudit!;
  audit.finishedLogged = true;

  const classified = classifySearchOutcome(response, error);
  const durationMs = Date.now() - ctx.startTime;
  const resultCount = response?.results?.length ?? 0;
  const assistType = response?.assist?.type;

  logger.info(
    {
      event: 'search_audit',
      requestId: ctx.requestId,
      sessionId: ctx.sessionId,
      clientIp: ctx.clientIp,
      query: audit.queryPreview,
      queryLen: audit.queryLen,
      queryHash: audit.queryHash,
      queryLanguage: ctx.queryLanguage,
      region: ctx.userRegionCode,
      regionSource: ctx.userRegionSource ?? audit.userRegionSource,
      hasGps: Boolean(ctx.userLocation),
      gate: audit.gateFoodSignal,
      gateRoute: audit.gateRoute,
      gateConfidence: audit.gateConfidence,
      intent: audit.intentRoute,
      intentReason: audit.intentReason,
      intentLanguage: audit.intentLanguage,
      cityText: audit.cityText,
      good: classified.good,
      kind: classified.kind,
      reason: classified.reason,
      resultCount,
      assistType,
      durationMs,
      timings: ctx.timings,
    },
    classified.good
      ? `[search_audit] ${classified.kind} n=${resultCount}`
      : `[search_audit] ${classified.kind} ${classified.reason}`
  );
}
