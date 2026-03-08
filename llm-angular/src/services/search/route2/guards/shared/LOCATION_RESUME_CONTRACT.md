# Missing-location auto-resume contract

Minimal, explicit contract for when the backend requires location and it is missing. Clients can request permission and re-submit the same request without overloading generic error shapes.

## Deterministic signal

- **`meta.failureReason === 'LOCATION_REQUIRED'`** — Existing enum; always set when location was required and missing.
- **`meta.locationRequired === true`** — Optional explicit boolean; set only in this case. Use for explicit branching without string comparison.

## Resume state

When location is required and missing, the response includes enough to resume the exact original request:

- **`meta.locationResume?.query`** — Exact query to use when re-submitting (same as `query.original`; explicit for the contract).
- **`sessionId`** — On response root; use the same session when re-submitting.
- Re-submit with **`userLocation`** set (e.g. from geolocation) and the same `query`; other filters are optional (none applied for guard responses).

## Backward compatibility

- Old clients that only check `failureReason === 'LOCATION_REQUIRED'` continue to work.
- New clients may use `meta.locationRequired === true` and `meta.locationResume?.query` for explicit behavior.
- These fields are **only** set when location is required and missing; they are not added to generic error or success responses.

## Where the contract is set

- Route2 guards: `buildGuardResponse` when `failureReason === 'LOCATION_REQUIRED'`.
- Route2 deterministic clarify: `buildDeterministicMissingLocationClarify` (server).
- Near-me module: `handleNearMeLocationCheck` when returning LOCATION_REQUIRED.
