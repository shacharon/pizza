/**
 * Structured Logger with Pino
 * Phase 1: Production-ready logging with file rotation
 * 
 * Features:
 * - Fast JSON logging with Pino
 * - Daily rotated log files (DEV only)
 * - Pretty console output in DEV
 * - Automatic secret redaction
 * - Request/session tracking via child loggers
 */

import pino from 'pino';
import * as rfs from 'rotating-file-stream';
import pinoPretty from 'pino-pretty';
import path from 'path';
import fs from 'fs';
import { getLoggingConfig } from '../../config/logging.config.js';

const config = getLoggingConfig();

// Setup file rotation for DEV
let fileStream: any = undefined;
if (config.toFile) {
  const logsDir = path.resolve(process.cwd(), config.dir);
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  
  fileStream = rfs.createStream('server.log', {
    interval: '1d',
    path: logsDir,
    maxFiles: config.rotateDays,
    compress: 'gzip',
  });
}

// Create Pino logger
export const logger = pino(
  {
    level: config.level,
    redact: {
      paths: config.redactFields,
      censor: '[REDACTED]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    // Console output
    ...(config.console ? [{
      level: config.level,
      stream: config.pretty 
        ? pinoPretty({
            colorize: true,
            translateTime: 'SYS:HH:MM:ss',
            ignore: 'pid,hostname',
          })
        : process.stdout,
    }] : []),
    
    // File output (DEV only)
    ...(fileStream ? [{
      level: config.level,
      stream: fileStream,
    }] : []),
  ])
);

export type Logger = typeof logger;
