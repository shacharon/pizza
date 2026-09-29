# Handoff: Agent -1 — Preflight — Story 04

**Agent:** -1 preflight  
**Story:** [STORY_04_redis_certificate.md](../../STORY_04_redis_certificate.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** ready

---

## Summary

Server story on Going2Eat (`angular-piza`), not Dating and not a Route3 graph. Size **S**.

`getRedisClient` in `server/src/lib/redis/redis-client.ts` treats `rediss://` as TLS and sets `rejectUnauthorized: false` on both the hostname path and the URL-parse fallback. The certificate is not checked. `redis://` does not set a `tls` option, so local Redis stays without TLS.

This story turns the check on for `rediss://` only. It does not change the Redis URL, cache keys, or the search pipeline. It does not rewrite Gate2, Intent, or Google.

Health already reports Redis `UP` when the shared client answers a ping (`health.controler.ts`). A valid certificate still has to connect for that to stay true. Password redaction is already `url.replace(/:[^:@]+@/, ':****@')` on `REDIS_INIT_ATTEMPT` and `REDIS_CONNECTED`. Leave that in place.

---

## Artifacts

| Path | Change |
|------|--------|
| `docs/route3/sprint-10-llm-guard/handoffs/story-04-redis-certificate/agent--1-preflight.md` | created |
| `server/src/lib/redis/redis-client.ts` | N/A (later agents; TLS check only) |

---

## Decisions (do not reverse without discussion)

- Repo is `angular-piza`. Do not touch Dating or `dating-api`.
- Not Route3. Do not add graph nodes. Do not change `ROUTE3_ENABLED`.
- Allowed edit: `server/src/lib/redis/redis-client.ts` only.
- `rediss://` must verify the server certificate (`rejectUnauthorized: true`), including the parse-failure fallback.
- `redis://` stays without a `tls` option.
- Keep the ElastiCache `servername` (SNI) when the hostname parses.
- Do not change `REDIS_URL`, cache key names, or the search pipeline.
- Do not remove the password redaction in the Redis logs.
- Do not edit the health handler. It already reports the connected client.

---

## Route2 safety

- [x] Gate, Intent, Google, and the search pipeline stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] The TLS flag in `redis-client.ts` is the exception this story allows

---

## Tests / verification

- [x] Command: read story, sprint README, epic, and the TLS block plus URL redaction in `redis-client.ts`
- [x] Result: pass (preflight only; no code run)

---

## Open questions / next agent

None. Ready for architect.

**Next:** `--g2e-agent 0 sprint 10 story 4`
