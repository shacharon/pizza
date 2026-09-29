import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { redisTlsOptions, redactRedisUrl } from './redis-client.js';

describe('redisTlsOptions', () => {
  it('leaves a local redis:// connection without TLS', () => {
    assert.equal(redisTlsOptions('redis://localhost:6379'), undefined);
  });

  it('verifies the certificate for rediss:// and sets SNI', () => {
    const hostname = 'master.example.cache.amazonaws.com';
    assert.deepEqual(
      redisTlsOptions(`rediss://${hostname}:6379`),
      { rejectUnauthorized: true, servername: hostname }
    );
  });

  it('still verifies the certificate when the URL cannot be parsed', () => {
    assert.deepEqual(
      redisTlsOptions('rediss://['),
      { rejectUnauthorized: true }
    );
  });
});

describe('redactRedisUrl', () => {
  it('hides the password', () => {
    const redacted = redactRedisUrl('rediss://:secret@host:6379');
    assert.match(redacted, /:\*\*\*\*@/);
    assert.equal(redacted.includes('secret'), false);
  });
});
