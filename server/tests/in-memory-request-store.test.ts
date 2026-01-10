/**
 * Phase 2: InMemoryRequestStore Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { InMemoryRequestStore } from '../src/infra/state/in-memory-request-store.js';
import type { RequestState } from '../src/infra/state/request-state.store.js';

describe('InMemoryRequestStore - Phase 2', () => {
  let store: InMemoryRequestStore;

  beforeEach(() => {
    store = new InMemoryRequestStore(300, 60_000);
  });

  afterEach(() => {
    store.shutdown();
  });

  it('should store and retrieve state', async () => {
    const state: RequestState = {
      requestId: 'test-123',
      sessionId: 'session-456',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 12345,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    };

    await store.set('test-123', state);
    const retrieved = await store.get('test-123');

    assert.ok(retrieved, 'Should retrieve stored state');
    assert.strictEqual(retrieved.requestId, 'test-123');
    assert.strictEqual(retrieved.assistantStatus, 'pending');
  });

  it('should return null for non-existent key', async () => {
    const result = await store.get('non-existent');
    assert.strictEqual(result, null, 'Should return null for non-existent key');
  });

  it('should expire state after TTL', async () => {
    const state: RequestState = {
      requestId: 'expire-test',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 123,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 1000
    };

    // Store with 1 second TTL
    await store.set('expire-test', state, 1);

    // Should exist immediately
    let retrieved = await store.get('expire-test');
    assert.ok(retrieved, 'Should exist before TTL');

    // Wait 1.5 seconds
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Should be expired
    retrieved = await store.get('expire-test');
    assert.strictEqual(retrieved, null, 'Should be expired after TTL');
  });

  it('should cleanup expired entries', async () => {
    // Create 3 entries: 2 expired, 1 valid
    await store.set('expired-1', {
      requestId: 'expired-1',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now()
    }, 0.001); // 1ms TTL

    await store.set('expired-2', {
      requestId: 'expired-2',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 2,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now()
    }, 0.001);

    await store.set('valid', {
      requestId: 'valid',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 3,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    }, 300);

    // Wait for expiry
    await new Promise(resolve => setTimeout(resolve, 100));

    // Run cleanup
    const cleaned = await store.cleanup();

    assert.strictEqual(cleaned, 2, 'Should clean 2 expired entries');

    // Valid entry should still exist
    const validEntry = await store.get('valid');
    assert.ok(validEntry, 'Valid entry should still exist');
  });

  it('should shutdown and clear interval', async () => {
    const stats = store.getStats();
    assert.strictEqual(stats.size, 0, 'Should start empty');

    await store.set('test', {
      requestId: 'test',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    });

    assert.strictEqual(store.getStats().size, 1, 'Should have 1 entry');

    store.shutdown();

    assert.strictEqual(store.getStats().size, 0, 'Should be empty after shutdown');
  });

  it('should delete specific entry', async () => {
    await store.set('delete-test', {
      requestId: 'delete-test',
      coreResult: {} as any,
      assistantStatus: 'pending',
      seed: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      expiresAt: Date.now() + 300_000
    });

    let entry = await store.get('delete-test');
    assert.ok(entry, 'Should exist before delete');

    await store.delete('delete-test');

    entry = await store.get('delete-test');
    assert.strictEqual(entry, null, 'Should be deleted');
  });
});
