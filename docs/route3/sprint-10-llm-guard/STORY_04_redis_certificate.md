# Story 04 — Check the Redis certificate

**Sprint 10**

## What

Production Redis uses TLS with `rejectUnauthorized: false`, so the certificate is not checked. Turn that check on for `rediss://`. Local `redis://` stays without TLS.

## Scope

`server/src/lib/redis/redis-client.ts` only.

Do not change the Redis URL, the cache keys, or the search pipeline.

## Acceptance criteria

- [ ] A `rediss://` connection verifies the server certificate
- [ ] A `redis://` local connection still connects with no TLS
- [ ] Health still reports Redis when the certificate is valid
- [ ] The password is still redacted in logs

## Agents

`-1 → 0 → 1 → 2 → 3`
