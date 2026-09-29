# Handoff: Agent 1 — Developer — Story 04

**Agent:** 1 developer  
**Story:** [STORY_04_redis_certificate.md](../../STORY_04_redis_certificate.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

`rediss://` now verifies the server certificate. `redis://` still has no TLS options. The password in Redis logs is still replaced with `:****@`.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/redis/redis-client.ts` | `redisTlsOptions` with `rejectUnauthorized: true`; `redactRedisUrl` |
| `server/src/lib/redis/redis-client.test.ts` | created |

---

## Decisions (do not reverse without discussion)

- `getRedisClient` passes `tls` only when `redisTlsOptions` returns an object.
- SNI `servername` is still the URL hostname when it parses.
- A `rediss://` string that `new URL` rejects (`rediss://[`) still sets `rejectUnauthorized: true`.
- Health, `REDIS_URL`, cache keys, and the search pipeline were not edited.

---

## Route2 safety

- [x] Gate, Intent, Google, and the search pipeline untouched
- [x] `ROUTE3_ENABLED` untouched
- [x] Password redaction still uses `:****@`

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/redis/redis-client.test.ts` from `server/`
- [x] Result: pass (4)
- [x] `redis://localhost:6379` has no TLS options
- [x] `rediss://master.example.cache.amazonaws.com:6379` is `rejectUnauthorized: true` with that `servername`
- [x] `rediss://[` is `rejectUnauthorized: true`
- [x] `rediss://:secret@host:6379` redacts to `:****@` and does not contain `secret`

A live local connect and health check are Agent 3. This process does not open a socket.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 2 sprint 10 story 4`
