# Handoff: Agent 2 — Code Review — Story 04

**Agent:** 2 code review  
**Story:** [STORY_04_redis_certificate.md](../../STORY_04_redis_certificate.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

`redisTlsOptions` returns `undefined` for `redis://` and `{ rejectUnauthorized: true }` for `rediss://`, with `servername` when the hostname parses. `getRedisClient` passes `tls` only when that object exists. Both Redis URL log sites call `redactRedisUrl`, which still replaces the password with `:****@`.

Search still calls `searchRoute2`. There is no graph. Health was not edited.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/redis/redis-client.ts` | `redisTlsOptions`, `redactRedisUrl`, wired into `getRedisClient` |
| `server/src/lib/redis/redis-client.test.ts` | created |

---

## Decisions (do not reverse without discussion)

- Approve `rejectUnauthorized: true` on the parsed path and on the `new URL` failure path.
- Approve omitting `tls` when the helper returns `undefined`.
- Keep SNI as the parsed hostname.
- The extra test file is the architect’s allowed exception to the story’s single-file scope. Do not edit the health handler here.

---

## Route2 safety

- [x] Gate routing, Intent route selection, and Google untouched
- [x] No new graph, schema, or agent loop
- [x] Retry counts, connect timeout, and command timeout unchanged
- [x] `health.controler.ts`, `REDIS_URL`, and cache keys untouched
- [x] No `rejectUnauthorized: false` left in `server/src`

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/redis/redis-client.test.ts` from `server/`
- [x] Result: pass (4)
- [x] `redis://localhost:6379` is `undefined`
- [x] `rediss://master.example.cache.amazonaws.com:6379` is `rejectUnauthorized: true` with that `servername`
- [x] `rediss://[` is `rejectUnauthorized: true`
- [x] `rediss://:secret@host:6379` contains `:****@` and does not contain `secret`

A live local connect and health check are Agent 3.

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 3 sprint 10 story 4`
