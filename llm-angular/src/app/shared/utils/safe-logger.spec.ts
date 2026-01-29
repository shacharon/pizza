/**
 * Safe Logger Tests
 * Tests sanitization of sensitive data from logs
 */

import { safeLog, safeError, safeWarn, safeDebug } from './safe-logger';

describe('SafeLogger - Secret Sanitization', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Authorization Header Sanitization', () => {
    it('should redact Authorization header', () => {
      const data = {
        headers: {
          'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          'Content-Type': 'application/json'
        }
      };

      safeLog('Test', 'Request details', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.headers.Authorization).toBe('[REDACTED]');
      expect(loggedData.headers['Content-Type']).toBe('application/json');
    });

    it('should redact authorization header (lowercase)', () => {
      const data = {
        headers: {
          'authorization': 'Bearer token123',
          'content-type': 'application/json'
        }
      };

      safeLog('Test', 'Request details', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.headers.authorization).toBe('[REDACTED]');
      expect(loggedData.headers['content-type']).toBe('application/json');
    });
  });

  describe('Session ID Sanitization', () => {
    it('should redact x-session-id header', () => {
      const data = {
        headers: {
          'x-session-id': 'sess_abc123',
          'Content-Type': 'application/json'
        }
      };

      safeLog('Test', 'Request details', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.headers['x-session-id']).toBe('[REDACTED]');
      expect(loggedData.headers['Content-Type']).toBe('application/json');
    });

    it('should redact X-Session-Id header (case insensitive)', () => {
      const data = {
        headers: {
          'X-Session-Id': 'sess_xyz789'
        }
      };

      safeLog('Test', 'Request details', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.headers['X-Session-Id']).toBe('[REDACTED]');
    });
  });

  describe('Sensitive Field Sanitization', () => {
    it('should redact token field', () => {
      const data = {
        user: 'john',
        token: 'secret_token_123',
        role: 'admin'
      };

      safeLog('Test', 'User data', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.token).toBe('[REDACTED]');
      expect(loggedData.user).toBe('john');
      expect(loggedData.role).toBe('admin');
    });

    it('should redact password field', () => {
      const data = {
        username: 'john',
        password: 'secret123',
        email: 'john@example.com'
      };

      safeLog('Test', 'Login data', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.password).toBe('[REDACTED]');
      expect(loggedData.username).toBe('john');
      expect(loggedData.email).toBe('john@example.com');
    });

    it('should redact secret field', () => {
      const data = {
        appId: 'app123',
        appSecret: 'very_secret_key',
        environment: 'production'
      };

      safeLog('Test', 'Config', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.appSecret).toBe('[REDACTED]');
      expect(loggedData.appId).toBe('app123');
      expect(loggedData.environment).toBe('production');
    });

    it('should redact apiKey field', () => {
      const data = {
        service: 'maps',
        apiKey: 'AIzaSyC1234567890',
        region: 'us-east-1'
      };

      safeLog('Test', 'API config', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.apiKey).toBe('[REDACTED]');
      expect(loggedData.service).toBe('maps');
    });

    it('should redact bearer field', () => {
      const data = {
        type: 'auth',
        bearer: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 3600
      };

      safeLog('Test', 'Auth token', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.bearer).toBe('[REDACTED]');
      expect(loggedData.type).toBe('auth');
    });
  });

  describe('Nested Object Sanitization', () => {
    it('should redact sensitive fields in nested objects', () => {
      const data = {
        request: {
          url: '/api/search',
          headers: {
            'Authorization': 'Bearer token123',
            'x-session-id': 'sess_abc'
          },
          body: {
            query: 'pizza',
            apiKey: 'secret_key'
          }
        }
      };

      safeLog('Test', 'Nested request', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.request.headers.Authorization).toBe('[REDACTED]');
      expect(loggedData.request.headers['x-session-id']).toBe('[REDACTED]');
      expect(loggedData.request.body.apiKey).toBe('[REDACTED]');
      expect(loggedData.request.body.query).toBe('pizza');
      expect(loggedData.request.url).toBe('/api/search');
    });

    it('should handle deeply nested objects', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              token: 'secret123',
              data: 'public'
            }
          }
        }
      };

      safeLog('Test', 'Deep nesting', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.level1.level2.level3.token).toBe('[REDACTED]');
      expect(loggedData.level1.level2.level3.data).toBe('public');
    });

    it('should prevent infinite recursion with max depth', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;

      // Should not crash
      expect(() => safeLog('Test', 'Circular', circular)).not.toThrow();
    });
  });

  describe('Array Sanitization', () => {
    it('should sanitize sensitive data in arrays', () => {
      const data = {
        users: [
          { name: 'john', token: 'token1' },
          { name: 'jane', token: 'token2' }
        ]
      };

      safeLog('Test', 'User list', data);

      const loggedData = consoleLogSpy.mock.calls[0][1];
      expect(loggedData.users[0].token).toBe('[REDACTED]');
      expect(loggedData.users[1].token).toBe('[REDACTED]');
      expect(loggedData.users[0].name).toBe('john');
      expect(loggedData.users[1].name).toBe('jane');
    });
  });

  describe('Primitive Types', () => {
    it('should handle null data', () => {
      safeLog('Test', 'Null data', null);
      expect(consoleLogSpy).toHaveBeenCalledWith('[Test] Null data', null);
    });

    it('should handle undefined data', () => {
      safeLog('Test', 'Undefined data', undefined);
      // When data is explicitly undefined, it's treated as "no data" and not passed to console.log
      expect(consoleLogSpy).toHaveBeenCalledWith('[Test] Undefined data');
    });

    it('should handle string data', () => {
      safeLog('Test', 'String data', 'hello');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Test] String data', 'hello');
    });

    it('should handle number data', () => {
      safeLog('Test', 'Number data', 123);
      expect(consoleLogSpy).toHaveBeenCalledWith('[Test] Number data', 123);
    });

    it('should handle boolean data', () => {
      safeLog('Test', 'Boolean data', true);
      expect(consoleLogSpy).toHaveBeenCalledWith('[Test] Boolean data', true);
    });
  });

  describe('All Logger Functions', () => {
    it('safeError should redact sensitive data', () => {
      const data = { error: 'Failed', token: 'secret123' };
      safeError('Test', 'Error occurred', data);

      const loggedData = consoleErrorSpy.mock.calls[0][1];
      expect(loggedData.token).toBe('[REDACTED]');
      expect(loggedData.error).toBe('Failed');
    });

    it('safeWarn should redact sensitive data', () => {
      const data = { warning: 'Deprecated', apiKey: 'key123' };
      safeWarn('Test', 'Warning issued', data);

      const loggedData = consoleWarnSpy.mock.calls[0][1];
      expect(loggedData.apiKey).toBe('[REDACTED]');
      expect(loggedData.warning).toBe('Deprecated');
    });

    it('safeDebug should redact sensitive data', () => {
      const data = { debug: 'Info', password: 'pass123' };
      safeDebug('Test', 'Debug info', data);

      const loggedData = consoleDebugSpy.mock.calls[0][1];
      expect(loggedData.password).toBe('[REDACTED]');
      expect(loggedData.debug).toBe('Info');
    });
  });

  describe('No Data Parameter', () => {
    it('should handle safeLog without data parameter', () => {
      safeLog('Test', 'Simple message');
      expect(consoleLogSpy).toHaveBeenCalledWith('[Test] Simple message');
    });

    it('should handle safeError without data parameter', () => {
      safeError('Test', 'Error message');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[Test] Error message');
    });

    it('should handle safeWarn without data parameter', () => {
      safeWarn('Test', 'Warning message');
      expect(consoleWarnSpy).toHaveBeenCalledWith('[Test] Warning message');
    });

    it('should handle safeDebug without data parameter', () => {
      safeDebug('Test', 'Debug message');
      expect(consoleDebugSpy).toHaveBeenCalledWith('[Test] Debug message');
    });
  });
});
