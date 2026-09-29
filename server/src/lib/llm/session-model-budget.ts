import { logger } from '../logger/structured-logger.js';
import { getExistingRedisClient } from '../redis/redis-client.js';

/** Model calls allowed for one session during one UTC day. */
export const MODEL_CALLS_PER_SESSION_DAY = 40;

const BUDGET_TTL_MS = 48 * 60 * 60 * 1000;

const memoryCounts = new Map<string, number>();

export class ModelBudgetExceededError extends Error {
  constructor() {
    super('Try again later');
    this.name = 'ModelBudgetExceededError';
  }
}

export type ModelBudgetStore = {
  increment(key: string): Promise<number>;
};

export function modelBudgetLog(count: number, sessionId: string | undefined): {
  event: 'model_budget_exceeded';
  count: number;
  sessionPrefix: string;
} {
  const sessionPrefix = sessionId && sessionId.length > 0 ? sessionId.slice(0, 8) : 'none';
  return { event: 'model_budget_exceeded', count, sessionPrefix };
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function sessionBucket(sessionId: string | undefined): string {
  return sessionId && sessionId.length > 0 ? sessionId : 'nosession';
}

function memoryIncrement(key: string): number {
  const next = (memoryCounts.get(key) ?? 0) + 1;
  memoryCounts.set(key, next);
  return next;
}

async function redisIncrement(key: string): Promise<number> {
  const redis = getExistingRedisClient();
  if (!redis) {
    return memoryIncrement(key);
  }
  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.pexpire(key, BUDGET_TTL_MS);
    }
    return count;
  } catch (error) {
    logger.warn({
      event: 'model_budget_redis_fallback',
      error: error instanceof Error ? error.message : 'unknown'
    }, '[LLM] Model budget Redis failed, using memory');
    return memoryIncrement(key);
  }
}

/**
 * Count one model-call entry. Throws before the provider HTTP call when the
 * session is already at the daily cap.
 */
export async function consumeSessionModelCall(
  sessionId: string | undefined,
  store?: ModelBudgetStore
): Promise<void> {
  const key = `llm-budget:${sessionBucket(sessionId)}:${utcDay()}`;
  const count = store ? await store.increment(key) : await redisIncrement(key);
  if (count > MODEL_CALLS_PER_SESSION_DAY) {
    const fields = modelBudgetLog(count, sessionId);
    logger.warn(fields, '[LLM] Session model budget exceeded');
    throw new ModelBudgetExceededError();
  }
}
