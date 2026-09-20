/**
 * HTTP response log level: drop scanner 404 noise, keep real API 4xx/5xx.
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApplicationHttpPath,
  isExpiredTokenError,
  resolveHttpResponseLog,
} from './http-response-log.js';

describe('isApplicationHttpPath', () => {
  test('API and search paths count as app', () => {
    assert.equal(isApplicationHttpPath('/search', '/api/v1/search'), true);
    assert.equal(isApplicationHttpPath('/ws-ticket'), true);
    assert.equal(isApplicationHttpPath('/session'), true);
    assert.equal(isApplicationHttpPath('/healthz'), true);
    assert.equal(isApplicationHttpPath('/', '/api/v1/search'), true);
  });

  test('scanner and root paths are not app', () => {
    assert.equal(isApplicationHttpPath('/'), false);
    assert.equal(isApplicationHttpPath('/favicon.ico'), false);
    assert.equal(isApplicationHttpPath('/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php'), false);
    assert.equal(isApplicationHttpPath('/.env'), false);
  });

  test('/health does not match /healthz via prefix accident', () => {
    assert.equal(isApplicationHttpPath('/healthz'), true);
    assert.equal(isApplicationHttpPath('/health'), true);
    assert.equal(isApplicationHttpPath('/healthy-scam'), false);
  });
});

describe('resolveHttpResponseLog', () => {
  const slow = 5000;

  test('skips 404 on scanner paths', () => {
    const a = resolveHttpResponseLog({
      path: '/',
      statusCode: 404,
      durationMs: 1,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, true);
    assert.equal(a.level, 'debug');
  });

  test('skips phpunit 404', () => {
    const a = resolveHttpResponseLog({
      path: '/vendor/phpunit/phpunit/src/Util/PHP/eval-stdin.php',
      statusCode: 404,
      durationMs: 0,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, true);
  });

  test('skips 401 on ws-ticket (stale JWT)', () => {
    const a = resolveHttpResponseLog({
      path: '/ws-ticket',
      statusCode: 401,
      durationMs: 2,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, true);
  });

  test('warns 401 on search', () => {
    const a = resolveHttpResponseLog({
      path: '/search',
      originalUrl: '/api/v1/search',
      statusCode: 401,
      durationMs: 2,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, false);
    assert.equal(a.level, 'warn');
  });

  test('keeps warn for API 4xx', () => {
    const a = resolveHttpResponseLog({
      path: '/search',
      originalUrl: '/api/v1/search',
      statusCode: 400,
      durationMs: 10,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, false);
    assert.equal(a.level, 'warn');
  });

  test('keeps error for 5xx even on /', () => {
    const a = resolveHttpResponseLog({
      path: '/',
      statusCode: 500,
      durationMs: 1,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, false);
    assert.equal(a.level, 'error');
  });

  test('slow 2xx on API is info', () => {
    const a = resolveHttpResponseLog({
      path: '/search',
      statusCode: 202,
      durationMs: 6000,
      slowThresholdMs: slow,
    });
    assert.equal(a.skip, false);
    assert.equal(a.level, 'info');
  });
});

describe('isExpiredTokenError', () => {
  test('detects jwt expired', () => {
    assert.equal(isExpiredTokenError(new Error('jwt expired')), true);
    assert.equal(isExpiredTokenError(new Error('invalid signature')), false);
  });
});
