/**
 * Configuration Validator
 * Phase 7: Fail fast on misconfiguration
 * 
 * Validates required environment variables at startup
 * Ensures system has necessary configuration to operate
 */

import { logger } from '../logger/structured-logger.js';

export interface ConfigRequirements {
  required: string[];
  optional: string[];
}

/**
 * Configuration requirements for the application
 */
export const CONFIG_REQUIREMENTS: ConfigRequirements = {
  required: [
    'GOOGLE_MAPS_API_KEY',  // Required for Google Places API
    // OPENAI_API_KEY is optional - system can use fallbacks
  ],
  optional: [
    'OPENAI_API_KEY',        // LLM for intent detection and assistant
    'LOG_LEVEL',             // Logging verbosity (debug, info, warn, error)
    'PLACES_PROVIDER_MODE',  // Provider mode (real, mock)
    'NODE_ENV',              // Environment (development, production)
    'PORT'                   // Server port
  ]
};

export interface ValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export class ConfigValidator {
  /**
   * Validate configuration against requirements
   * Returns result with missing/warning details
   */
  validate(): ValidationResult {
    const missing: string[] = [];
    const warnings: string[] = [];
    
    // Check required environment variables
    for (const key of CONFIG_REQUIREMENTS.required) {
      if (!process.env[key]) {
        missing.push(key);
      }
    }
    
    // Check optional environment variables (warnings only)
    for (const key of CONFIG_REQUIREMENTS.optional) {
      if (!process.env[key]) {
        warnings.push(`Optional config ${key} not set`);
      }
    }
    
    return {
      valid: missing.length === 0,
      missing,
      warnings
    };
  }
  
  /**
   * Validate configuration or throw ConfigError
   * Use this at application startup to fail fast
   */
  validateOrThrow(): void {
    const result = this.validate();
    
    if (!result.valid) {
      const message = `Missing required configuration: ${result.missing.join(', ')}`;
      
      // Log error before throwing
      logger.error({
        missing: result.missing,
        required: CONFIG_REQUIREMENTS.required
      }, 'Configuration validation failed');
      
      throw new ConfigError(message);
    }
    
    // Log warnings for missing optional config
    if (result.warnings.length > 0) {
      logger.warn({ 
        warnings: result.warnings 
      }, 'Configuration warnings');
    }
    
    // Log successful validation
    logger.info({
      providerMode: process.env.PLACES_PROVIDER_MODE || 'real',
      logLevel: process.env.LOG_LEVEL || 'info',
      nodeEnv: process.env.NODE_ENV || 'development'
    }, 'Configuration validated');
  }
  
  /**
   * Get current configuration summary (sanitized)
   */
  getConfigSummary(): Record<string, string> {
    return {
      providerMode: process.env.PLACES_PROVIDER_MODE || 'real',
      logLevel: process.env.LOG_LEVEL || 'info',
      nodeEnv: process.env.NODE_ENV || 'development',
      hasGoogleKey: !!process.env.GOOGLE_MAPS_API_KEY,
      hasOpenAIKey: !!process.env.OPENAI_API_KEY
    } as any;
  }
}





