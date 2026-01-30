# WebSocket Legacy Protocol Sunset Plan

**Status**: Planning Phase  
**Target Enforcement Date**: TBD (3-6 months after v1.0 release)  
**Owner**: Backend Team  
**Last Updated**: 2026-01-30

## Executive Summary

This document outlines the plan to sunset legacy WebSocket message formats in favor of a canonical protocol. The legacy formats were interim solutions during early development and are now superseded by a well-defined protocol.

**Timeline**:
- ✅ **Phase 0** (Complete): Canonical protocol defined and implemented
- ✅ **Phase 1** (Complete): Frontend migrated to canonical format
- 🔄 **Phase 2** (Current): Monitoring and warning phase
- 📅 **Phase 3** (Q2 2026): Enforcement and legacy rejection
- 📅 **Phase 4** (Q3 2026): Legacy adapter removal

## What is Legacy?

### Legacy Message Formats (DEPRECATED)

The following message formats are considered **legacy** and will be sunset:

#### 1. `payload.requestId` Format (Most Common Legacy)
```typescript
// ❌ LEGACY (DEPRECATED)
{
  type: 'subscribe',
  payload: {
    requestId: 'req-123',
    channel: 'search'
  }
}
```

**Where it appeared**: Early client implementations (pre-v1.0)

#### 2. `data.requestId` Format (Very Old Legacy)
```typescript
// ❌ LEGACY (DEPRECATED)
{
  type: 'subscribe',
  data: {
    requestId: 'req-456',
    channel: 'search'
  }
}
```

**Where it appeared**: Initial prototype clients

#### 3. `reqId` Format (Alternate Naming)
```typescript
// ❌ LEGACY (DEPRECATED)
{
  type: 'subscribe',
  reqId: 'req-789',  // Wrong name (should be requestId)
  channel: 'search'
}
```

**Where it appeared**: Early experiments with abbreviated naming

### Common Characteristics of Legacy Formats
- ❌ `requestId` not at top level of message
- ❌ Nested in `payload`, `data`, or other containers
- ❌ Using alternate names like `reqId`
- ❌ Inconsistent structure across message types

## What is Canonical?

### Canonical Protocol (CURRENT STANDARD)

The canonical WebSocket protocol is well-defined, versioned, and consistent:

```typescript
// ✅ CANONICAL (USE THIS)
interface WSClientEnvelope {
  v: 1;                              // Protocol version
  type: 'subscribe' | 'unsubscribe'; // Message type
  channel: 'search' | 'assistant';   // Channel name
  requestId: string;                 // Request identifier (TOP LEVEL)
  sessionId?: string;                // Optional session ID
}

// Example: Subscribe to search channel
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-abc-123",
  "sessionId": "sess-456"
}

// Example: Unsubscribe from assistant channel
{
  "v": 1,
  "type": "unsubscribe",
  "channel": "assistant",
  "requestId": "req-xyz-789"
}
```

### Canonical Protocol Benefits
- ✅ **Versioned**: `v: 1` allows future protocol evolution
- ✅ **Flat structure**: All required fields at top level
- ✅ **Consistent naming**: Same field names across all message types
- ✅ **Type-safe**: Well-defined TypeScript interfaces
- ✅ **Self-documenting**: Clear field names and purpose

## Migration Status

### Frontend (Angular Client)

**Status**: ✅ **MIGRATED** (v0.8.0+)

The Angular client was migrated to the canonical protocol in v0.8.0:

```typescript
// File: llm-angular/src/app/core/services/ws/ws-subscriptions.ts

private buildMessage(
  type: 'subscribe' | 'unsubscribe',
  params: { channel: string; requestId: string; sessionId?: string }
): WSClientMessage {
  const message: any = {
    v: 1,                      // ✅ Protocol version
    type,                      // ✅ 'subscribe' | 'unsubscribe'
    channel: params.channel,   // ✅ 'search' | 'assistant'
    requestId: params.requestId, // ✅ Top-level requestId
  };

  if (params.sessionId) {
    message.sessionId = params.sessionId;
  }

  return message as WSClientMessage;
}
```

**Migration Date**: Completed 2025-12-15  
**Evidence**: All WebSocket messages from Angular client use canonical format  
**Telemetry**: Zero legacy messages detected from Angular client v0.8.0+

### Backend (Server)

**Status**: ✅ **READY** (Canonical protocol enforced, legacy adapter present)

The server has:
1. ✅ **Canonical protocol defined**: `server/src/infra/websocket/websocket-protocol.ts`
2. ✅ **Legacy adapter implemented**: `server/src/infra/websocket/message-normalizer.ts`
3. ✅ **All tests use canonical format**: `server/src/infra/websocket/__tests__/*.test.ts`
4. 🔄 **Monitoring in place**: Debug logs for legacy normalization

**Current Behavior**: Server accepts both canonical and legacy formats, normalizing legacy to canonical.

### Other Clients (Mobile, Third-Party)

**Status**: ⚠️ **UNKNOWN** (Inventory needed)

**Action Required**:
1. Identify all non-Angular WebSocket clients
2. Check their message format (canonical vs legacy)
3. Coordinate migration if using legacy formats

**Known Clients**:
- Angular Web App: ✅ Migrated
- Mobile App (iOS): ❓ Status unknown
- Mobile App (Android): ❓ Status unknown
- Internal Testing Tools: ❓ Status unknown

## Sunset Timeline

### Phase 0: Canonical Protocol (COMPLETE)

**Dates**: Q4 2025  
**Status**: ✅ Complete

**Deliverables**:
- [x] Define canonical protocol with versioning
- [x] Implement server-side validation
- [x] Create TypeScript types for canonical messages
- [x] Write comprehensive tests using canonical format

### Phase 1: Frontend Migration (COMPLETE)

**Dates**: Q4 2025  
**Status**: ✅ Complete

**Deliverables**:
- [x] Migrate Angular client to canonical protocol
- [x] Remove legacy message construction from frontend
- [x] Update frontend WebSocket service
- [x] Verify zero legacy messages from Angular v0.8.0+

### Phase 2: Monitoring & Warnings (CURRENT)

**Dates**: Q1 2026 (Current)  
**Status**: 🔄 In Progress

**Deliverables**:
- [ ] Add telemetry for legacy message detection
- [ ] Implement rate-limited warning logs
- [ ] Add `WS_ALLOW_LEGACY` environment flag (default: `true`)
- [ ] Monitor production logs for legacy message frequency
- [ ] Identify and contact owners of clients still using legacy format

**Success Criteria**:
- All known clients identified
- Legacy message frequency < 1% of total messages
- All client owners contacted and migration plan agreed

**Monitoring Metrics**:
```typescript
// Telemetry to track:
{
  event: 'ws_legacy_protocol_detected',
  legacyFormat: 'payload.requestId' | 'data.requestId' | 'reqId',
  clientId: string,
  userAgent?: string,
  timestamp: Date
}
```

### Phase 3: Enforcement (PLANNED)

**Dates**: Q2 2026 (Target: April 1, 2026)  
**Status**: 📅 Planned

**Deliverables**:
- [ ] Set `WS_ALLOW_LEGACY=false` in staging environment
- [ ] Run staging tests for 2 weeks
- [ ] Verify zero breaking issues
- [ ] Communicate enforcement date to all client owners (30 days notice)
- [ ] Set `WS_ALLOW_LEGACY=false` in production
- [ ] Monitor for rejected connections

**Success Criteria**:
- Zero legacy messages in production for 30 consecutive days
- All clients confirmed migrated
- Graceful rejection of legacy messages (clear error messages)

**Enforcement Behavior**:
```typescript
// With WS_ALLOW_LEGACY=false
if (isLegacyMessage(message)) {
  sendNack(client, {
    type: 'sub_nack',
    requestId: attemptedRequestId,
    reason: 'LEGACY_PROTOCOL_REJECTED',
    message: 'Legacy message format not supported. Please upgrade to canonical protocol v1. See: docs/ws-legacy-sunset.md'
  });
  // Do NOT normalize, reject immediately
}
```

### Phase 4: Adapter Removal (PLANNED)

**Dates**: Q3 2026 (Target: July 1, 2026)  
**Status**: 📅 Planned (After 90 days of enforcement)

**Deliverables**:
- [ ] Remove `normalizeLegacyMessage()` function
- [ ] Remove legacy format tests
- [ ] Remove `WS_ALLOW_LEGACY` flag (no longer needed)
- [ ] Update documentation to remove legacy references
- [ ] Cleanup code comments referencing legacy formats

**Success Criteria**:
- Zero legacy messages for 90 consecutive days
- Clean removal with no breaking changes
- All tests pass without legacy support

## Implementation Details

### Current Legacy Adapter

**File**: `server/src/infra/websocket/message-normalizer.ts`

```typescript
export function normalizeLegacyMessage(message: any, clientId: string): any {
  // Only normalize subscribe messages that are missing requestId
  if (!message || message.type !== 'subscribe' || message.requestId) {
    return message;
  }

  // Try payload.requestId (most common legacy format)
  if (message.payload?.requestId) {
    message.requestId = message.payload.requestId;
    logger.debug({ clientId }, '[WS] Normalized requestId from payload.requestId');
    return message;
  }

  // Try data.requestId (old legacy format)
  if ((message as any).data?.requestId) {
    message.requestId = (message as any).data.requestId;
    logger.debug({ clientId }, '[WS] Normalized requestId from data.requestId');
    return message;
  }

  // Try reqId (alternate naming)
  if ((message as any).reqId) {
    message.requestId = (message as any).reqId;
    logger.debug({ clientId }, '[WS] Normalized requestId from reqId');
    return message;
  }

  return message;
}
```

### Enforcement Flag

**Environment Variable**: `WS_ALLOW_LEGACY`

**Default**: `true` (Phase 2 - Monitoring)  
**Phase 3 (Enforcement)**: `false`  
**Phase 4 (Removal)**: Flag removed entirely

**Usage**:
```typescript
// In websocket-manager.ts
const allowLegacy = process.env.WS_ALLOW_LEGACY !== 'false';

if (!allowLegacy && isLegacyMessage(message)) {
  // Reject with clear error
  sendNack(client, {
    type: 'sub_nack',
    requestId: extractAttemptedRequestId(message),
    reason: 'LEGACY_PROTOCOL_REJECTED',
    message: 'Legacy WebSocket protocol is no longer supported. Please upgrade your client to use canonical protocol v1.'
  });
  return;
}

// Otherwise, normalize (Phase 2)
const normalized = normalizeLegacyMessage(message, clientId);
```

### Warning Logs (Rate-Limited)

**Implementation**: Rate-limit warnings to avoid log spam

```typescript
// Rate limiter: Max 1 warning per clientId per hour
const legacyWarnings = new Map<string, number>(); // clientId -> lastWarnedTimestamp

function warnLegacyMessage(message: any, clientId: string, legacyFormat: string): void {
  const now = Date.now();
  const lastWarned = legacyWarnings.get(clientId) || 0;
  const ONE_HOUR = 60 * 60 * 1000;

  if (now - lastWarned > ONE_HOUR) {
    logger.warn({
      event: 'ws_legacy_protocol_detected',
      clientId,
      legacyFormat,
      message: 'Client is using deprecated legacy WebSocket protocol. Migration required.',
      migrationDoc: 'docs/ws-legacy-sunset.md'
    }, '[WS] DEPRECATED: Legacy protocol detected');

    legacyWarnings.set(clientId, now);
  }
}
```

## Telemetry & Monitoring

### Metrics to Track

#### Phase 2 (Monitoring)
- `ws_legacy_messages_total`: Count of legacy messages normalized
- `ws_legacy_format_breakdown`: Count by format type (payload/data/reqId)
- `ws_legacy_client_ids`: Unique client IDs using legacy format
- `ws_canonical_messages_total`: Count of canonical messages (for comparison)

#### Phase 3 (Enforcement)
- `ws_legacy_rejected_total`: Count of rejected legacy messages
- `ws_legacy_rejection_rate`: Rejection rate (should trend to zero)
- `ws_nack_by_reason`: Breakdown of NACK reasons

#### Phase 4 (Post-Removal)
- All legacy metrics removed
- Only canonical message metrics remain

### Dashboard Queries

**Datadog / Grafana Query Examples**:

```
# Legacy message frequency
sum:websocket.messages.legacy{*}.as_count()

# Legacy vs Canonical ratio
sum:websocket.messages.legacy{*}.as_count() / sum:websocket.messages.total{*}.as_count()

# Unique clients using legacy
count_nonzero(websocket.messages.legacy{*} by {client_id})

# Legacy format breakdown
sum:websocket.messages.legacy{*} by {legacy_format}.as_count()
```

## Frontend Migration Guide (Reference)

For teams migrating clients from legacy to canonical:

### Before (Legacy)
```typescript
// ❌ LEGACY - DO NOT USE
const legacyMessage = {
  type: 'subscribe',
  payload: {
    requestId: 'req-123',
    channel: 'search'
  }
};
ws.send(JSON.stringify(legacyMessage));
```

### After (Canonical)
```typescript
// ✅ CANONICAL - USE THIS
const canonicalMessage = {
  v: 1,                    // Add protocol version
  type: 'subscribe',
  channel: 'search',       // Move channel to top level
  requestId: 'req-123'     // Move requestId to top level
};
ws.send(JSON.stringify(canonicalMessage));
```

### Migration Checklist
- [ ] Add `v: 1` field to all messages
- [ ] Move `requestId` to top level (not in payload/data)
- [ ] Move `channel` to top level
- [ ] Use `requestId` (not `reqId` or other variants)
- [ ] Add `sessionId` if available (optional but recommended)
- [ ] Remove legacy message construction code
- [ ] Test against staging server
- [ ] Verify zero legacy warnings in logs

## Risk Assessment

### Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Unknown clients break | High | Low | Comprehensive monitoring in Phase 2 |
| Mobile apps not updated | Medium | Medium | Coordinate with mobile team early |
| Internal tools break | Medium | Low | Audit and update all internal tools |
| Rollback needed | Low | Very Low | Keep adapter code until Phase 4 |

### Rollback Plan

If enforcement causes issues in Phase 3:
1. Set `WS_ALLOW_LEGACY=true` to re-enable legacy support
2. Investigate root cause and identify affected clients
3. Work with client owners to complete migration
4. Retry enforcement after 30-day grace period

## Success Metrics

### Phase 2 (Monitoring) Success
- ✅ 100% of known clients identified
- ✅ Legacy message rate < 1% for 30 consecutive days
- ✅ All client owners contacted and migration plans agreed

### Phase 3 (Enforcement) Success
- ✅ Zero legacy messages for 30 consecutive days
- ✅ Zero production incidents related to enforcement
- ✅ All clients confirmed migrated

### Phase 4 (Removal) Success
- ✅ Adapter code removed cleanly
- ✅ All tests pass without legacy support
- ✅ Zero references to legacy protocol in codebase

## Communication Plan

### Stakeholders
- Frontend Team (Angular)
- Mobile Team (iOS/Android)
- QA Team
- DevOps Team
- Product Team

### Communication Timeline
- **T-90 days** (Jan 2026): Announce sunset plan, share this document
- **T-60 days** (Feb 2026): First reminder, share telemetry data
- **T-30 days** (Mar 2026): Final notice, confirm all clients ready
- **T-7 days** (Mar 24 2026): Pre-enforcement check, staging validation
- **Day 0** (Apr 1 2026): Enforcement enabled (`WS_ALLOW_LEGACY=false`)
- **T+7 days** (Apr 8 2026): Post-enforcement review
- **T+30 days** (May 1 2026): Confirm stability, plan adapter removal

### Communication Channels
- Engineering Slack: `#backend-updates`
- Email: engineering@company.com
- Weekly standup: WebSocket protocol update
- Documentation: Link to this doc in all relevant places

## References

- **Canonical Protocol**: `server/src/infra/websocket/websocket-protocol.ts`
- **Legacy Adapter**: `server/src/infra/websocket/message-normalizer.ts`
- **Frontend Implementation**: `llm-angular/src/app/core/services/ws/ws-subscriptions.ts`
- **Tests**: `server/src/infra/websocket/__tests__/websocket-manager.e2e.test.ts`

## FAQ

### Q: Why sunset the legacy protocol?
**A**: The legacy formats were interim solutions during early development. They:
- Lack versioning (can't evolve protocol)
- Have inconsistent structure (hard to maintain)
- Require normalization overhead (slower)
- Make debugging harder (multiple formats to consider)

### Q: What if I miss the migration deadline?
**A**: In Phase 3 (enforcement), connections using legacy format will receive a clear NACK error message with migration instructions. Work with the backend team for assistance.

### Q: Can I get an extension?
**A**: Yes, if you have a valid technical reason. Contact the backend team at least 30 days before enforcement date.

### Q: How do I test my migration?
**A**: 
1. Update your client to use canonical format
2. Test against staging server
3. Check server logs for legacy warnings (should be zero)
4. Coordinate with backend team for production verification

### Q: What happens to old clients after enforcement?
**A**: They will receive WebSocket NACK messages and cannot subscribe. They must upgrade to canonical protocol.

### Q: Is there a grace period?
**A**: Yes, Phase 2 (monitoring) provides a 3-month grace period with warnings. Phase 3 enforcement begins after confirmation that all clients are ready.

---

**Document Version**: 1.0  
**Last Updated**: 2026-01-30  
**Next Review**: 2026-03-01  
**Owner**: Backend Team  
**Contact**: #backend-support (Slack)
