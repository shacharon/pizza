/**
 * Logging Configuration
 * Single source of truth for all logging behavior
 * Phase 1: Core logging foundation
 */

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  pretty: boolean;
  toFile: boolean;
  dir: string;
  rotateDays: number;
  console: boolean;
  redactFields: string[];
  
  // Future tracing config (not used yet)
  traceEnabled: boolean;
  traceSampleRate: number;
  traceDebugRoutes: boolean;
}

export function getLoggingConfig(): LoggingConfig {
  const isDev = process.env.NODE_ENV !== 'production';
  
  return {
    level: (process.env.LOG_LEVEL as any) || 'info',
    pretty: process.env.LOG_PRETTY === 'true' || isDev,
    toFile: process.env.LOG_TO_FILE === 'true' || isDev,
    dir: process.env.LOG_DIR || './logs',
    rotateDays: Number(process.env.LOG_ROTATE_DAYS || 14),
    console: process.env.LOG_CONSOLE !== 'false',
    redactFields: (process.env.LOG_REDACT_FIELDS || 
      'authorization,cookie,x-api-key,key,token,password,apiKey,api_key,secret')
      .split(',').map(f => f.trim()),
    
    // Tracing (for future use)
    traceEnabled: process.env.TRACE_ENABLED !== 'false',
    traceSampleRate: Number(process.env.TRACE_SAMPLE_RATE || 0.0),
    traceDebugRoutes: process.env.TRACE_DEBUG_ROUTES === 'true' || isDev,
  };
}

