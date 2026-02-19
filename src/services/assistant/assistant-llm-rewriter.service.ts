/**
 * Assistant LLM Rewriter Service
 * Rewrites assistant messages for better UX: translation, friendlier tone, single sentence
 */

import { createHash } from 'crypto';
import { OpenAiProvider } from '../../llm/openai.provider.js';
import { logger } from '../../lib/logger/structured-logger.js';

/**
 * Rewrite parameters
 */
export interface RewriteParams {
  requestId: string;
  rawMessage: string;
  targetLanguage: 'he' | 'en' | 'ru' | 'auto';
  tone: 'neutral' | 'friendly';
  stage?: string;
}

/**
 * Rewrite result with metadata for pricing/analysis
 */
export interface RewriteResult {
  finalMessage: string;
  meta: {
    usedLLM: boolean;
    cacheHit: boolean;
    durationMs: number;
    tokensIn?: number;
    tokensOut?: number;
    model?: string;
    timeout: boolean;
    error?: string;
  };
}

/**
 * Cache entry
 */
interface CacheEntry {
  finalMessage: string;
  expiresAt: number;
  hits: number;
}

/**
 * In-flight call tracker (deduplicate concurrent identical calls)
 */
interface InFlightCall {
  promise: Promise<string>;
}

/**
 * Per-requestId stats for summary logging
 */
interface RequestStats {
  messagesTotal: number;
  llmCalls: number;
  cacheHits: number;
  totalDurationMs: number;
  totalTokensIn: number;
  totalTokensOut: number;
}

// Constants
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REWRITE_TIMEOUT_MS = 1200; // Strict 1.2s timeout
const MODEL = 'gpt-4o-mini'; // Cheapest model

// In-memory cache and in-flight trackers
const cache = new Map<string, CacheEntry>();
const inFlightCalls = new Map<string, InFlightCall>();
const requestStats = new Map<string, RequestStats>();

// Lazy-initialized LLM provider
let llmProvider: OpenAiProvider | null = null;

function getLLMProvider(): OpenAiProvider {
  if (!llmProvider) {
    llmProvider = new OpenAiProvider();
  }
  return llmProvider;
}

/**
 * Generate cache key from params
 */
function getCacheKey(rawMessage: string, targetLanguage: string, tone: string): string {
  const input = `${rawMessage}|${targetLanguage}|${tone}`;
  return createHash('sha256').update(input, 'utf8').digest('hex').slice(0, 16);
}

/**
 * Clean up expired cache entries
 */
function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt < now) {
      cache.delete(key);
    }
  }
}

/**
 * Get or initialize stats for requestId
 */
function getStats(requestId: string): RequestStats {
  let stats = requestStats.get(requestId);
  if (!stats) {
    stats = {
      messagesTotal: 0,
      llmCalls: 0,
      cacheHits: 0,
      totalDurationMs: 0,
      totalTokensIn: 0,
      totalTokensOut: 0
    };
    requestStats.set(requestId, stats);
    
    // Auto-cleanup stats after 15 minutes
    setTimeout(() => {
      requestStats.delete(requestId);
    }, 15 * 60 * 1000);
  }
  return stats;
}

/**
 * Log summary stats for a requestId
 */
export function logRewriteSummary(requestId: string): void {
  const stats = requestStats.get(requestId);
  if (!stats || stats.messagesTotal === 0) return;
  
  logger.info({
    requestId,
    event: 'assistant_llm_rewrite_summary',
    messagesTotal: stats.messagesTotal,
    llmCalls: stats.llmCalls,
    cacheHits: stats.cacheHits,
    totalDurationMs: stats.totalDurationMs,
    totalTokensIn: stats.totalTokensIn,
    totalTokensOut: stats.totalTokensOut,
    avgDurationMs: Math.round(stats.totalDurationMs / stats.messagesTotal)
  }, '[AssistantRewriter] Summary for requestId');
  
  // Clean up
  requestStats.delete(requestId);
}

/**
 * Rewrite assistant message via LLM
 * Falls back to rawMessage on timeout/error
 */
export async function rewriteAssistantMessage(params: RewriteParams): Promise<RewriteResult> {
  const { requestId, rawMessage, targetLanguage, tone, stage } = params;
  const tStart = Date.now();
  
  // Update stats
  const stats = getStats(requestId);
  stats.messagesTotal++;
  
  // Cleanup expired cache (cheap operation)
  cleanupCache();
  
  // Check cache
  const cacheKey = getCacheKey(rawMessage, targetLanguage, tone);
  const cached = cache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    cached.hits++;
    stats.cacheHits++;
    const durationMs = Date.now() - tStart;
    stats.totalDurationMs += durationMs;
    
    logger.debug({
      requestId,
      stage,
      event: 'assistant_llm_rewrite',
      cacheHit: true,
      usedLLM: false,
      durationMs,
      rawLength: rawMessage.length,
      finalLength: cached.finalMessage.length
    }, '[AssistantRewriter] Cache hit');
    
    return {
      finalMessage: cached.finalMessage,
      meta: {
        usedLLM: false,
        cacheHit: true,
        durationMs,
        timeout: false
      }
    };
  }
  
  // Check if already in-flight (deduplicate concurrent calls)
  const inFlight = inFlightCalls.get(cacheKey);
  if (inFlight) {
    try {
      const finalMessage = await inFlight.promise;
      const durationMs = Date.now() - tStart;
      stats.totalDurationMs += durationMs;
      
      logger.debug({
        requestId,
        stage,
        event: 'assistant_llm_rewrite',
        cacheHit: false,
        usedLLM: true,
        inFlightDedup: true,
        durationMs
      }, '[AssistantRewriter] In-flight dedup');
      
      return {
        finalMessage,
        meta: {
          usedLLM: true,
          cacheHit: false,
          durationMs,
          timeout: false
        }
      };
    } catch (err) {
      // Fall through to normal flow
    }
  }
  
  // Call LLM with strict timeout
  const llmPromise = callLLM(rawMessage, targetLanguage, tone);
  inFlightCalls.set(cacheKey, { promise: llmPromise });
  
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT')), REWRITE_TIMEOUT_MS);
    });
    
    const finalMessage = await Promise.race([llmPromise, timeoutPromise]);
    const durationMs = Date.now() - tStart;
    stats.llmCalls++;
    stats.totalDurationMs += durationMs;
    
    // Store in cache
    cache.set(cacheKey, {
      finalMessage,
      expiresAt: Date.now() + CACHE_TTL_MS,
      hits: 0
    });
    
    inFlightCalls.delete(cacheKey);
    
    logger.info({
      requestId,
      stage,
      targetLanguage,
      tone,
      event: 'assistant_llm_rewrite',
      cacheHit: false,
      usedLLM: true,
      durationMs,
      model: MODEL,
      timeout: false,
      rawLength: rawMessage.length,
      finalLength: finalMessage.length
    }, '[AssistantRewriter] LLM rewrite success');
    
    return {
      finalMessage,
      meta: {
        usedLLM: true,
        cacheHit: false,
        durationMs,
        model: MODEL,
        timeout: false
      }
    };
  } catch (err: any) {
    const durationMs = Date.now() - tStart;
    const isTimeout = err.message === 'TIMEOUT' || durationMs >= REWRITE_TIMEOUT_MS;
    
    inFlightCalls.delete(cacheKey);
    stats.totalDurationMs += durationMs;
    
    logger.warn({
      requestId,
      stage,
      event: 'assistant_llm_rewrite',
      cacheHit: false,
      usedLLM: false,
      durationMs,
      timeout: isTimeout,
      error: err.message || String(err),
      fallbackToRaw: true
    }, '[AssistantRewriter] LLM failed, using raw message');
    
    return {
      finalMessage: rawMessage,
      meta: {
        usedLLM: false,
        cacheHit: false,
        durationMs,
        timeout: isTimeout,
        error: err.message || String(err)
      }
    };
  }
}

/**
 * Call LLM to rewrite message
 */
async function callLLM(
  rawMessage: string,
  targetLanguage: string,
  tone: string
): Promise<string> {
  const provider = getLLMProvider();
  
  const systemPrompt = `You rewrite system status messages. Output only the rewritten message text.

Constraints:
- Keep one short sentence.
- Do not add facts.
- Do not change any numbers.
- No emojis.
- Tone: ${tone === 'friendly' ? 'slightly friendly, calm' : 'neutral, professional'}.
- Translate to target language if needed.`;

  const userPrompt = `rawMessage: "${rawMessage}"
targetLanguage: "${targetLanguage}"
tone: "${tone}"`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt }
  ];
  
  try {
    const result = await provider.complete(messages, {
      model: MODEL,
      temperature: 0.3,
      timeout: REWRITE_TIMEOUT_MS - 100 // Leave 100ms buffer
    });
    
    return result.trim();
  } catch (err: any) {
    throw new Error(err.message || 'LLM_CALL_FAILED');
  }
}
