# Handoff: Agent 0 — Architect — Story 04

**Agent:** 0 architect  
**Story:** [STORY_04_redis_certificate.md](../../STORY_04_redis_certificate.md)  
**Sprint:** sprint-10-llm-guard  
**Date:** 2026-09-29  
**Status:** complete  
**Verdict:** approved

---

## Summary

Not Route3. No graph nodes. No Angular.

`rediss://` keeps TLS and SNI, and `rejectUnauthorized` becomes `true` on both the parsed-hostname path and the parse-failure fallback. `redis://` still gets no `tls` option. The password redaction string stays. Health is not edited.

---

## Files to add

| Path | Purpose |
|------|---------|
| `server/src/lib/redis/redis-client.test.ts` | TLS option and redaction cases, no live socket |

## Graph

Not Route3. No nodes, no edges. `ROUTE3_ENABLED` stays unset / false.

## Stay on Route2

Keep `getRedisClient` as the shared client. Do not replace it. Search, cache keys, and Google stay imported as they are.

## Artifacts

| Path | Change |
|------|--------|
| `server/src/lib/redis/redis-client.ts` | `rejectUnauthorized: true` for `rediss://`; export the TLS helper and the existing redaction |
| `server/src/lib/redis/redis-client.test.ts` | created |
| Health handler, `REDIS_URL`, cache keys, search pipeline | N/A |
| `llm-angular/`, `route3/` | N/A |

---

## Decisions (do not reverse without discussion)

- Extract the TLS choice so a test does not open a connection:

```ts
export function redisTlsOptions(url: string): { rejectUnauthorized: true; servername?: string } | undefined {
  if (!url.startsWith('rediss://')) {
    return undefined;
  }
  try {
    const hostname = new URL(url).hostname;
    return {
      rejectUnauthorized: true,
      ...(hostname ? { servername: hostname } : {})
    };
  } catch {
    return { rejectUnauthorized: true };
  }
}
```

- `getRedisClient` uses `redisTlsOptions(url)` for the `tls` field. Do not pass `tls` when the helper returns `undefined`.
- Keep SNI `servername` as the URL hostname.
- Move the existing redaction into one function and keep both log sites on it:

```ts
export function redactRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':****@');
}
```

- Do not change `REDIS_URL`, cache key strings, retry counts, timeouts, or the search pipeline.
- Do not edit `health.controler.ts`. A valid certificate still connects, and health already reports that client as `UP`.

---

## Route2 safety

- [x] Gate, Intent, Google, and the search pipeline stay untouched
- [x] `ROUTE3_ENABLED` default remains false
- [ ] `rejectUnauthorized` for `rediss://` is the edit this story allows

---

## Tests / verification

Run from `server/`:

```text
node --test --import tsx src/lib/redis/redis-client.test.ts
```

- [ ] `redisTlsOptions('redis://localhost:6379')` is `undefined`
- [ ] `redisTlsOptions('rediss://master.example.cache.amazonaws.com:6379')` is `rejectUnauthorized: true` and `servername` is that hostname
- [ ] A `rediss://` value that throws in `new URL` still returns `rejectUnauthorized: true`
- [ ] `redactRedisUrl('rediss://:secret@host:6379')` contains `:****@` and does not contain `secret`

---

## Open questions / next agent

None.

**Next:** `--g2e-agent 1 sprint 10 story 4`
