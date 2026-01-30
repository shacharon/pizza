# Infrastructure Low-Level Technical Documentation

## Table of Contents
- [Server Initialization](#server-initialization)
- [Middleware Stack](#middleware-stack)
- [LLM Providers](#llm-providers)
- [Logger System](#logger-system)
- [Cache Manager](#cache-manager)
- [Reliability Patterns](#reliability-patterns)
- [WebSocket Infrastructure](#websocket-infrastructure)
- [State Management](#state-management)
- [Metrics & Telemetry](#metrics--telemetry)
- [Configuration](#configuration)

---

## Server Initialization

### File: `server.ts`

```typescript
// Singleton exports for cross-module access
export const requestStateStore = new InMemoryRequestStore(300, 60_000);
export const wsManager = new WebSocketManager(server, {
  path: '/ws',
  heartbeatIntervalMs: 30_000,
  allowedOrigins: process.env.WS_ALLOWED_ORIGINS?.split(',') || ['*'],
  requestStateStore
});

// Initialization Order:
1. Load environment variables (dotenv)
2. Create InMemoryRequestStore
3. Initialize Express app
4. Start HTTP server
5. Initialize WebSocketManager
6. Register shutdown handlers (SIGINT, SIGTERM)
```

### Graceful Shutdown

```typescript
function shutdown(signal: NodeJS.Signals) {
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  // 1. Stop accepting new connections
  requestStateStore.shutdown();  // Clear cleanup intervals
  wsManager.shutdown();          // Close all WebSocket connections
  
  // 2. Close HTTP server
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
  
  // 3. Force exit after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}
```

---

## Middleware Stack

### Request Processing Order

```typescript
// app.ts middleware stack (executed in order)

1. httpLogging.middleware.ts
   - Attaches Pino child logger to req.log
   - Logs request start/end
   - Includes duration and status code

2. requestContext.middleware.ts
   - Generates/extracts traceId
   - Attaches to req.traceId
   - Propagates through entire request lifecycle

3. Route Handlers
   - Search controller
   - Analytics controller
   - 404 handler

4. error.middleware.ts (last)
   - Catches all unhandled errors
   - Transforms to client-safe response
   - Logs detailed error information
```

### File: `middleware/httpLogging.middleware.ts`

```typescript
// Attaches logger to every request
export const httpLogging = (req: Request, res: Response, next: NextFunction) => {
  req.log = logger.child({ reqId: generateRequestId() });
  
  // Log on response finish
  onFinished(res, () => {
    req.log.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: Date.now() - startTime
    }, 'HTTP request completed');
  });
  
  next();
};
```

### File: `middleware/requestContext.middleware.ts`

```typescript
// Propagates traceId through request
export const requestContext = (req: Request, res: Response, next: NextFunction) => {
  // Extract from header or generate new
  const traceId = req.headers['x-trace-id'] as string 
    || `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  req.traceId = traceId;
  res.setHeader('x-trace-id', traceId);
  
  next();
};
```

### File: `middleware/error.middleware.ts`

```typescript
export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Log full error server-side
  req.log.error({
    error: err.message,
    stack: err.stack,
    path: req.path
  }, 'Unhandled error');
  
  // Send safe error to client
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    traceId: req.traceId
  });
};
```

---

## LLM Providers

### File: `llm/types.ts`

```typescript
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompleteOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  model?: string;
}

export interface LLMProvider {
  /**
   * Generate JSON response from LLM
   * @param messages Conversation messages
   * @param schema Zod schema for validation
   * @param options Optional parameters
   * @returns Validated JSON object
   */
  completeJSON<T>(
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompleteOptions
  ): Promise<T>;
}
```

### File: `llm/factory.ts`

```typescript
let cached: LLMProvider | null | undefined;

export function createLLMProvider(): LLMProvider | null {
  // Return cached if available
  if (cached) return cached;
  if (cached === null) return null;
  
  const provider = (process.env.LLM_PROVIDER || "openai").toLowerCase();
  
  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) return null;
    cached = new OpenAiProvider();
    return cached;
  }
  
  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    cached = new AnthropicProvider();
    return cached;
  }
  
  cached = null;
  return null;
}
```

### File: `llm/openai.provider.ts`

```typescript
export class OpenAiProvider implements LLMProvider {
  private client: OpenAI;
  
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  
  async completeJSON<T>(
    messages: Message[],
    schema: z.ZodType<T>,
    options?: CompleteOptions
  ): Promise<T> {
    const model = (options as any)?.model || DEFAULT_LLM_MODEL;
    
    // Convert Zod schema to JSON Schema
    const jsonSchema = zodToJsonSchema(schema);
    
    // Call OpenAI API with structured outputs
    const response = await this.client.chat.completions.create({
      model,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "response",
          strict: true,
          schema: jsonSchema
        }
      },
      temperature: options?.temperature ?? 0,
      max_tokens: options?.maxTokens,
      timeout: options?.timeout
    });
    
    // Parse and validate response
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('No response from LLM');
    
    const parsed = JSON.parse(content);
    return schema.parse(parsed);
  }
}
```

### JSON Schema Conversion

```typescript
// Zod schema
const Gate2Schema = z.object({
  isFoodRelated: z.boolean(),
  language: z.enum(['he', 'en', 'ru', 'ar', 'fr', 'es', 'other']),
  confidence: z.number().min(0).max(1)
});

// Converted to JSON Schema for OpenAI
{
  type: "object",
  properties: {
    isFoodRelated: { type: "boolean" },
    language: {
      type: "string",
      enum: ["he", "en", "ru", "ar", "fr", "es", "other"]
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    }
  },
  required: ["isFoodRelated", "language", "confidence"],
  additionalProperties: false
}
```

---

## Logger System

### File: `lib/logger/structured-logger.ts`

```typescript
// Pino logger with daily rotation
const logger = pino(
  {
    level: config.level,
    redact: {
      paths: ['apiKey', 'password', 'token', '*.apiKey'],
      censor: '[REDACTED]'
    }
  },
  // Multiple streams
  pino.multistream([
    // Console output (pretty in dev)
    {
      level: config.level,
      stream: pinoPretty({
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname'
      })
    },
    // File output (dev only, with daily rotation)
    ...(config.toFile ? [{
      level: config.level,
      stream: fileStream
    }] : [])
  ])
);

// Child loggers for context
const childLogger = logger.child({
  requestId: 'req-123',
  sessionId: 'session-abc'
});
```

### Log Structure

```typescript
// Standard log entry
{
  "level": 30,              // INFO
  "time": 1234567890,
  "msg": "search_started",
  "requestId": "req-...",
  "sessionId": "session-...",
  "query": "pizza near me",
  "hasUserLocation": true
}

// Stage log entry
{
  "level": 30,
  "msg": "[ROUTE2] gate2 completed",
  "requestId": "req-...",
  "pipelineVersion": "route2",
  "stage": "gate2",
  "event": "stage_completed",
  "durationMs": 850,
  "route": "CONTINUE",
  "confidence": 0.95,
  "language": "en",
  "isFoodRelated": true
}

// LLM call log entry
{
  "level": 30,
  "msg": "provider_call",
  "requestId": "req-...",
  "provider": "openai",
  "model": "gpt-4o-mini",
  "promptVersion": "gate2_v4",
  "promptHash": "abc123...",
  "promptLength": 45,
  "durationMs": 820,
  "tokens": {
    "prompt": 35,
    "completion": 15,
    "total": 50
  },
  "cost": 0.00025
}
```

### File Rotation

```typescript
// Daily rotation with compression
fileStream = rfs.createStream('server.log', {
  interval: '1d',              // Daily rotation
  path: logsDir,
  compress: 'gzip',            // Compress old logs
  maxFiles: 14,                // Keep 14 days
  size: '100M'                 // Max file size
});
```

---

## Cache Manager

### File: `lib/cache/cache-manager.ts`

```typescript
export class CacheManager<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0
  };
  
  constructor(
    private maxSize: number = 1000,
    private defaultTTL: number = 300_000  // 5 minutes
  ) {}
  
  set(key: string, value: T, ttl?: number): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }
    
    this.cache.set(key, {
      data: value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      hits: 0
    });
  }
  
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }
    
    // Check if expired
    const age = Date.now() - entry.timestamp;
    if (age > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }
    
    // Update hit count
    entry.hits++;
    this.stats.hits++;
    return entry.data;
  }
  
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }
  }
  
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? this.stats.hits / total : 0;
    
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      evictions: this.stats.evictions
    };
  }
}
```

### Usage Example

```typescript
// In pipeline stage
const cacheKey = `intent2:${createHash('sha256')
  .update(request.query)
  .digest('hex')}`;

// Try cache first
const cached = cache.get(cacheKey);
if (cached) {
  logger.info({ requestId, cacheHit: true }, 'Using cached result');
  return cached;
}

// Execute LLM call
const result = await llmProvider.completeJSON(...);

// Cache for 5 minutes
cache.set(cacheKey, result, 300_000);
```

---

## Reliability Patterns

### File: `lib/reliability/retry-policy.ts`

```typescript
export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableErrors: string[];
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  policy: RetryPolicy
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= policy.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      
      // Check if retryable
      const isRetryable = policy.retryableErrors.some(
        pattern => lastError.message.includes(pattern)
      );
      
      if (!isRetryable || attempt === policy.maxAttempts) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        policy.initialDelayMs * Math.pow(policy.backoffMultiplier, attempt - 1),
        policy.maxDelayMs
      );
      
      logger.warn({
        attempt,
        delay,
        error: lastError.message
      }, 'Retrying after error');
      
      await sleep(delay);
    }
  }
  
  throw lastError!;
}
```

### File: `lib/reliability/timeout-guard.ts`

```typescript
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${errorMessage} (${timeoutMs}ms)`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeout]);
}

// With abort signal
export async function withTimeoutAndAbort<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number
): Promise<T> {
  const controller = new AbortController();
  
  const timeout = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}
```

### Usage in Pipeline Stages

```typescript
// Gate2 stage with timeout
const llmResult = await withTimeout(
  llmProvider.completeJSON(messages, schema, options),
  900,  // 900ms timeout
  'Gate2 LLM call timed out'
);
```

---

## WebSocket Infrastructure

### File: `infra/websocket/websocket-manager.ts`

```typescript
export class WebSocketManager {
  private wss: WebSocketServer;
  private subscriptions = new Map<string, Set<WebSocket>>();
  private socketToRequests = new WeakMap<WebSocket, Set<string>>();
  
  constructor(server: HTTPServer, config: WebSocketManagerConfig) {
    // Create WebSocket server
    this.wss = new WebSocketServer({
      server,
      path: config.path,
      verifyClient: this.verifyClient.bind(this)
    });
    
    // Handle connections
    this.wss.on('connection', this.handleConnection.bind(this));
    
    // Start heartbeat
    this.startHeartbeat(config.heartbeatIntervalMs);
  }
  
  private verifyClient(info: any): boolean {
    const origin = info.origin || info.req.headers.origin;
    
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return true;
    }
    
    // Check allowed origins in production
    return this.config.allowedOrigins.includes('*') ||
           this.config.allowedOrigins.includes(origin);
  }
  
  private handleConnection(ws: WebSocket): void {
    logger.info('WebSocket client connected');
    
    // Initialize request set for this socket
    this.socketToRequests.set(ws, new Set());
    
    // Handle messages
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });
    
    // Handle close
    ws.on('close', () => {
      this.handleDisconnect(ws);
    });
  }
  
  private handleMessage(ws: WebSocket, data: any): void {
    try {
      const message: WSClientMessage = JSON.parse(data.toString());
      
      if (!isWSClientMessage(message)) {
        throw new Error('Invalid message format');
      }
      
      switch (message.type) {
        case 'subscribe':
          this.subscribe(ws, message.requestId);
          break;
        case 'unsubscribe':
          this.unsubscribe(ws, message.requestId);
          break;
        case 'ping':
          this.send(ws, { type: 'pong' });
          break;
      }
    } catch (error) {
      logger.error({ error }, 'Failed to handle WebSocket message');
    }
  }
  
  subscribe(ws: WebSocket, requestId: string): void {
    // Add to subscriptions
    if (!this.subscriptions.has(requestId)) {
      this.subscriptions.set(requestId, new Set());
    }
    this.subscriptions.get(requestId)!.add(ws);
    
    // Track in socket→requests map
    const requests = this.socketToRequests.get(ws)!;
    requests.add(requestId);
    
    logger.info({ requestId }, 'Client subscribed to request');
    
    // Late-subscriber replay
    if (this.requestStateStore) {
      this.replayState(ws, requestId);
    }
  }
  
  private async replayState(ws: WebSocket, requestId: string): Promise<void> {
    const state = await this.requestStateStore!.get(requestId);
    
    if (state && state.assistantStatus === 'completed') {
      // Send completed state immediately
      this.send(ws, {
        type: 'complete',
        requestId,
        data: state.coreResult
      });
    }
  }
  
  broadcast(requestId: string, message: WSServerMessage): void {
    const subscribers = this.subscriptions.get(requestId);
    
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    
    logger.info({
      requestId,
      subscriberCount: subscribers.size,
      messageType: message.type
    }, 'Broadcasting to subscribers');
    
    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        this.send(ws, message);
      }
    }
  }
  
  private send(ws: WebSocket, message: WSServerMessage): void {
    ws.send(JSON.stringify(message));
  }
  
  shutdown(): void {
    // Stop heartbeat
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    // Close all connections
    this.wss.clients.forEach(ws => {
      ws.close(1000, 'Server shutting down');
    });
    
    // Close server
    this.wss.close();
    
    logger.info('WebSocketManager shut down');
  }
}
```

### File: `infra/websocket/websocket-protocol.ts`

```typescript
// Client → Server messages
export type WSClientMessage =
  | { type: 'subscribe'; requestId: string }
  | { type: 'unsubscribe'; requestId: string }
  | { type: 'ping' };

// Server → Client messages
export type WSServerMessage =
  | { type: 'update'; requestId: string; data: any }
  | { type: 'complete'; requestId: string; data: any }
  | { type: 'error'; requestId: string; error: string }
  | { type: 'pong' };

export function isWSClientMessage(msg: any): msg is WSClientMessage {
  return msg &&
    typeof msg.type === 'string' &&
    ['subscribe', 'unsubscribe', 'ping'].includes(msg.type);
}
```

---

## State Management

### File: `infra/state/request-state.store.ts`

```typescript
export interface RequestState {
  requestId: string;
  sessionId?: string;
  traceId?: string;
  coreResult: any;
  assistantStatus: 'pending' | 'running' | 'completed' | 'failed';
  seed: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface IRequestStateStore {
  get(requestId: string): Promise<RequestState | null>;
  set(requestId: string, state: RequestState, ttl?: number): Promise<void>;
  update(requestId: string, partial: Partial<RequestState>): Promise<void>;
  delete(requestId: string): Promise<void>;
}
```

### File: `infra/state/in-memory-request-store.ts`

```typescript
export class InMemoryRequestStore implements IRequestStateStore {
  private store = new Map<string, { state: RequestState; expiresAt: number }>();
  private cleanupInterval: NodeJS.Timeout | undefined;
  
  constructor(
    private defaultTtlSeconds = 300,
    private cleanupIntervalMs = 60_000
  ) {
    this.startCleanup();
  }
  
  async get(requestId: string): Promise<RequestState | null> {
    const entry = this.store.get(requestId);
    
    if (!entry) return null;
    
    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(requestId);
      return null;
    }
    
    return entry.state;
  }
  
  async set(requestId: string, state: RequestState, ttl = this.defaultTtlSeconds): Promise<void> {
    const expiresAt = Date.now() + ttl * 1000;
    this.store.set(requestId, {
      state: { ...state, expiresAt },
      expiresAt
    });
  }
  
  async update(requestId: string, partial: Partial<RequestState>): Promise<void> {
    const entry = this.store.get(requestId);
    if (!entry) return;
    
    entry.state = {
      ...entry.state,
      ...partial,
      updatedAt: Date.now()
    };
  }
  
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, entry] of this.store.entries()) {
        if (now > entry.expiresAt) {
          this.store.delete(key);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        logger.info({ cleaned }, 'Cleaned expired request states');
      }
    }, this.cleanupIntervalMs);
  }
  
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}
```

---

## Metrics & Telemetry

### File: `lib/metrics/performance-metrics.ts`

```typescript
export class PerformanceMetrics {
  private metrics = new Map<string, number[]>();
  
  record(metric: string, value: number): void {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    this.metrics.get(metric)!.push(value);
  }
  
  getStats(metric: string): MetricStats | null {
    const values = this.metrics.get(metric);
    if (!values || values.length === 0) return null;
    
    const sorted = [...values].sort((a, b) => a - b);
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((a, b) => a + b, 0) / values.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }
}
```

### File: `lib/telemetry/providerTrace.ts`

```typescript
export interface LLMCallTrace {
  requestId: string;
  provider: string;
  model: string;
  promptVersion: string;
  promptHash: string;
  promptLength: number;
  durationMs: number;
  tokens: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
  timestamp: number;
}

export class ProviderTraceStore {
  private traces: LLMCallTrace[] = [];
  
  record(trace: LLMCallTrace): void {
    this.traces.push(trace);
    
    // Log immediately
    logger.info({
      ...trace,
      event: 'provider_call'
    }, 'LLM call completed');
  }
  
  getStats(): {
    totalCalls: number;
    totalCost: number;
    avgDuration: number;
    totalTokens: number;
  } {
    return {
      totalCalls: this.traces.length,
      totalCost: this.traces.reduce((sum, t) => sum + t.cost, 0),
      avgDuration: this.traces.reduce((sum, t) => sum + t.durationMs, 0) / this.traces.length,
      totalTokens: this.traces.reduce((sum, t) => sum + t.tokens.total, 0)
    };
  }
}
```

---

## Configuration

### File: `config/env.ts`

```typescript
export interface Config {
  port: number;
  nodeEnv: string;
  openaiApiKey: string | undefined;
  anthropicApiKey: string | undefined;
  googleApiKey: string | undefined;
}

export function getConfig(): Config {
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    openaiApiKey: process.env.OPENAI_API_KEY,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    googleApiKey: process.env.GOOGLE_API_KEY || process.env.GOOGLE_MAPS_API_KEY
  };
}
```

### File: `config/logging.config.ts`

```typescript
export interface LoggingConfig {
  level: string;
  toFile: boolean;
  dir: string;
}

export function getLoggingConfig(): LoggingConfig {
  return {
    level: process.env.LOG_LEVEL || 'info',
    toFile: process.env.LOG_TO_FILE === 'true',
    dir: process.env.LOG_DIR || './logs'
  };
}
```

### File: `config/route2.flags.ts`

```typescript
// Feature flag for ROUTE2 pipeline
export const ROUTE2_ENABLED = process.env.ROUTE2_ENABLED !== 'false';

// Default: enabled (must explicitly set to 'false' to disable)
```

### Environment Variables Reference

```bash
# Server
PORT=3000
NODE_ENV=production

# LLM
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-...
LLM_PROVIDER=openai
DEFAULT_LLM_MODEL=gpt-4o-mini

# Search
ROUTE2_ENABLED=true
DEFAULT_REGION_CODE=IL
GOOGLE_API_KEY=...

# Logging
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_DIR=./logs

# WebSocket
WS_ALLOWED_ORIGINS=https://app.piza.co,https://app-staging.piza.co
```

---

## Performance Optimization

### Request Deduplication

```typescript
// File: lib/concurrency/request-deduplicator.ts
export class RequestDeduplicator<T> {
  private pending = new Map<string, Promise<T>>();
  
  async dedupe(key: string, fn: () => Promise<T>): Promise<T> {
    // Return existing promise if pending
    if (this.pending.has(key)) {
      return this.pending.get(key)!;
    }
    
    // Create new promise
    const promise = fn().finally(() => {
      this.pending.delete(key);
    });
    
    this.pending.set(key, promise);
    return promise;
  }
}
```

### Backpressure Handling

```typescript
// File: lib/concurrency/backpressure.ts
export class BackpressureQueue<T> {
  private queue: Array<() => Promise<T>> = [];
  private running = 0;
  
  constructor(private maxConcurrent: number = 10) {}
  
  async add(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      
      this.process();
    });
  }
  
  private async process(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }
    
    this.running++;
    const fn = this.queue.shift()!;
    
    try {
      await fn();
    } finally {
      this.running--;
      this.process();
    }
  }
}
```

---

## Testing Infrastructure

### Test Utilities

```typescript
// Reset LLM provider cache between tests
import { resetLLMProviderCacheForTests } from '../llm/factory.js';

beforeEach(() => {
  resetLLMProviderCacheForTests();
});

// Mock logger for tests
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(() => mockLogger)
};
```

---

## Next Steps

For architectural overview:
- [INFRASTRUCTURE_OVERVIEW.md](./INFRASTRUCTURE_OVERVIEW.md)
- [INFRASTRUCTURE_HIGH_LEVEL.md](./INFRASTRUCTURE_HIGH_LEVEL.md)

For pipeline documentation:
- [ROUTE2 README](../server/src/services/search/route2/README.md)
