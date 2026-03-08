/**
 * Provider Worker - Cache write guard tests
 *
 * Only FOUND (VERIFIED) is written to cache. NOT_FOUND and UNKNOWN are never cached.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { shouldWriteProviderCache } from './provider-cache-guard.js';

describe('ProviderWorker cache write guard (shouldWriteProviderCache)', () => {
  it('returns true only for FOUND - cache write allowed', () => {
    assert.strictEqual(shouldWriteProviderCache('FOUND'), true);
  });

  it('returns false for NOT_FOUND - do not cache', () => {
    assert.strictEqual(shouldWriteProviderCache('NOT_FOUND'), false);
  });

  it('returns false for UNKNOWN - do not cache', () => {
    assert.strictEqual(shouldWriteProviderCache('UNKNOWN'), false);
  });
});
