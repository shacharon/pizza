# Handoff: Agent 3 — QA — Story 04

**Agent:** 3 QA  
**Story:** [STORY_04_redis_certificate.md](../../STORY_04_redis_certificate.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** pass

---

## Summary

Local Redis is `redis://localhost:6379`. After the client change, nodemon reconnected with `useTls` false and no TLS server name. Health reports Redis `UP`. A normal search is still Route2.

`rediss://` certificate verification is the unit helper: `rejectUnauthorized` is `true`, and SNI is the hostname. This machine does not open a production `rediss://` socket.

---

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/redis/redis-client.ts` | reviewed, not edited |
| `server/src/lib/redis/redis-client.test.ts` | reviewed, not edited |

---

## Decisions (do not reverse without discussion)

- Local proof of “no TLS” is the 20:31:29 boot log: `useTls` false, `tlsServername` null, then `REDIS_CONNECTED`.
- Certificate verification for `rediss://` is the unit result. A live ElastiCache handshake is not part of this local check.
- The local URL has no password. Redaction of `:secret` is the unit result. The boot log URL is `redis://localhost:6379`.

---

## Route2 safety

- [x] Flag off: `pizza on Allenby` is `meta.source` `route2`
- [x] `ROUTE3_ENABLED` does not exist

---

## Tests / verification

- [x] Command: `node --test --import tsx src/lib/redis/redis-client.test.ts` from `server/`
- [x] Result: pass (4)
- [x] `redis://localhost:6379` has no TLS options
- [x] `rediss://master.example.cache.amazonaws.com:6379` is `rejectUnauthorized: true` with that `servername`
- [x] `rediss://[` is `rejectUnauthorized: true`
- [x] `rediss://:secret@host:6379` contains `:****@` and does not contain `secret`

Live, after the 20:31:29 restart that loaded this client:

| Check | Result |
|-------|--------|
| Boot `REDIS_INIT_ATTEMPT` | `redisUrl` `redis://localhost:6379`, `useTls` false, `tlsServername` null |
| `GET /healthz` | `status` `UP`, `checks.redis` `UP` |
| `POST /api/v1/search?mode=sync` `pizza on Allenby` | 200, `source` `route2`, `mode` `textsearch`, 8 places |

- [x] A `rediss://` connection verifies the server certificate (`rejectUnauthorized: true`)
- [x] A `redis://` local connection still connects with no TLS
- [x] Health still reports Redis
- [x] The password is still redacted

---

## Open questions / next agent

None. Story 04 is done.

**Next:** `--g2e-agent -1 sprint 10 story 5`
