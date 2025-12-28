/**
 * Structured Logger
 * Phase 7: Consistent, secure, structured logging
 * 
 * Features:
 * - JSON output for machine parsing
 * - Log level filtering (debug, info, warn, error)
 * - Sensitive data redaction (API keys, tokens, passwords)
 * - Request/session tracking
 * - Error sanitization
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  sessionId?: string;
  timings?: Record<string, number>;
  failureReason?: string;
  mode?: string;
  [key: string]: any;
}

export class StructuredLogger {
  private level: LogLevel;
  
  constructor(level: LogLevel = 'info') {
    this.level = level;
  }
  
  /**
   * Debug level logging - verbose details for development
   */
  debug(message: string, context?: LogContext): void {
    if (this.shouldLog('debug')) {
      this.write('debug', message, context);
    }
  }
  
  /**
   * Info level logging - normal operational messages
   */
  info(message: string, context?: LogContext): void {
    if (this.shouldLog('info')) {
      this.write('info', message, context);
    }
  }
  
  /**
   * Warning level logging - potential issues
   */
  warn(message: string, context?: LogContext): void {
    if (this.shouldLog('warn')) {
      this.write('warn', message, context);
    }
  }
  
  /**
   * Error level logging - errors and exceptions
   */
  error(message: string, context?: LogContext, error?: Error): void {
    if (this.shouldLog('error')) {
      this.write('error', message, { 
        ...context, 
        error: this.sanitizeError(error) 
      });
    }
  }
  
  /**
   * Write structured log entry to console as JSON
   */
  private write(level: LogLevel, message: string, context?: LogContext): void {
    const log = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...this.sanitizeContext(context)
    };
    
    // Output as JSON for structured logging
    console.log(JSON.stringify(log));
  }
  
  /**
   * Sanitize context to redact sensitive information
   */
  private sanitizeContext(context?: LogContext): LogContext {
    if (!context) return {};
    
    const sanitized = { ...context };
    
    // Redact sensitive field patterns
    const sensitiveKeys = ['apikey', 'token', 'password', 'secret', 'auth', 'credentials'];
    
    for (const key of Object.keys(sanitized)) {
      const lowerKey = key.toLowerCase();
      
      // Check if key contains sensitive pattern
      if (sensitiveKeys.some(s => lowerKey.includes(s))) {
        sanitized[key] = '[REDACTED]';
      }
      
      // Recursively sanitize nested objects
      if (typeof sanitized[key] === 'object' && sanitized[key] !== null && !Array.isArray(sanitized[key])) {
        sanitized[key] = this.sanitizeContext(sanitized[key] as LogContext);
      }
    }
    
    return sanitized;
  }
  
  /**
   * Sanitize error object for logging
   * Stack traces only included in development
   */
  private sanitizeError(error?: Error): object | undefined {
    if (!error) return undefined;
    
    const sanitized: any = {
      name: error.name,
      message: error.message
    };
    
    // Include stack trace only in development
    if (process.env.NODE_ENV === 'development') {
      sanitized.stack = error.stack;
    }
    
    // Include additional error properties if present
    if ('code' in error) {
      sanitized.code = (error as any).code;
    }
    
    if ('statusCode' in error) {
      sanitized.statusCode = (error as any).statusCode;
    }
    
    return sanitized;
  }
  
  /**
   * Check if message should be logged based on current level
   */
  private shouldLog(level: LogLevel): boolean {
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(this.level);
    const messageLevelIndex = levels.indexOf(level);
    
    return messageLevelIndex >= currentLevelIndex;
  }
}

/**
 * Singleton logger instance
 * Configure via LOG_LEVEL environment variable
 */
export const logger = new StructuredLogger(
  (process.env.LOG_LEVEL as LogLevel) || 'info'
);



