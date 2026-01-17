# Unified WebSocket Protocol

## Overview

The unified WebSocket protocol supports both **search** and **assistant** channels through a canonical message envelope.

## Canonical Message Envelope (v1)

All client messages SHOULD use this canonical format:

```typescript
{
  "v": 1,
  "type": "subscribe" | "unsubscribe" | "event",
  "channel": "search" | "assistant",
  "requestId": "<req-...>",
  "sessionId": "<session-...>"  // optional
}
```

### Fields

- **v**: Protocol version (always `1`)
- **type**: Message type (`subscribe`, `unsubscribe`, or `event`)
- **channel**: Target channel (`search` or `assistant`)
- **requestId**: Request identifier (required)
- **sessionId**: Optional session identifier for session-based subscriptions

## Accepted Message Shapes

### 1. Canonical Subscribe (Recommended)

**Search Channel:**
```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-1234567890-abc123"
}
```

**Assistant Channel:**
```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "assistant",
  "requestId": "req-1234567890-abc123",
  "sessionId": "session-xyz789"
}
```

### 2. Canonical Unsubscribe

```json
{
  "v": 1,
  "type": "unsubscribe",
  "channel": "search",
  "requestId": "req-1234567890-abc123"
}
```

### 3. Legacy Compatibility

**Server accepts requestId from multiple locations:**
- `message.requestId` (preferred)
- `message.payload.requestId` (legacy)
- `message.data.requestId` (legacy)
- `message.reqId` (legacy)

The server automatically normalizes these to `message.requestId` before validation.

### 4. Legacy Subscribe (Backward Compatible)

The server still accepts the legacy format for backward compatibility:

```json
{
  "type": "subscribe",
  "requestId": "req-1234567890-abc123"
}
```

**Note:** Legacy messages are automatically normalized to canonical format with `channel: "search"`.

## Server Behavior

### Subscription Keys

Subscriptions are tracked by:
- `channel:request:<requestId>` - for request-based subscriptions
- `channel:session:<sessionId>` - for session-based subscriptions

### Logging

Server logs only metadata (NOT full payload):
```typescript
{
  clientId: "ws-...",
  type: "subscribe",
  channel: "search",
  hasRequestId: true,
  hasSessionId: false
}
```

### Error Handling

- **JSON Parse Error:** Returns `{"type": "error", "error": "parse_error", "message": "Failed to parse JSON"}`
- **Invalid Format:** Returns `{"type": "error", "error": "invalid_message", "message": "Invalid message format"}`

## Client API

### TypeScript/Angular

```typescript
import { WsClientService } from './core/services/ws-client.service';

// Subscribe to search channel
wsClient.subscribe('req-123', 'search');

// Subscribe to assistant channel with session
wsClient.subscribe('req-456', 'assistant', 'session-789');

// Unsubscribe
wsClient.unsubscribe('req-123', 'search');
```

## Migration Guide

### From Legacy to Canonical

**Before:**
```json
{
  "type": "subscribe",
  "requestId": "req-123"
}
```

**After:**
```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-123"
}
```

### Legacy requestId Locations (Auto-normalized)

The server accepts requestId from these locations and normalizes to top-level:
- `payload.requestId` → `requestId`
- `data.requestId` → `requestId`
- `reqId` → `requestId`

## Files Changed

### Server
- `server/src/infra/websocket/websocket-protocol.ts` - Protocol definitions
- `server/src/infra/websocket/websocket-manager.ts` - Subscription manager

### Client
- `llm-angular/src/app/core/models/ws-protocol.types.ts` - Type definitions
- `llm-angular/src/app/core/services/ws-client.service.ts` - Client service

### Documentation
- `server/docs/websocket-protocol-unified.md` - This file

## Examples

### Example 1: Search Subscription (Canonical v1)

```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "search",
  "requestId": "req-1737055535495-l0a654u1s"
}
```

### Example 2: Assistant Subscription (Canonical v1)

```json
{
  "v": 1,
  "type": "subscribe",
  "channel": "assistant",
  "requestId": "req-1737055600000-xyz456",
  "sessionId": "session-user123-20260116"
}
```

### Example 3: Legacy (Still Supported)

```json
{
  "type": "subscribe",
  "requestId": "req-1737055535495-l0a654u1s"
}
```
_Automatically normalized to canonical v1 with search channel_

### Example 4: Legacy with requestId in payload (Supported)

```json
{
  "type": "subscribe",
  "channel": "search",
  "payload": {
    "requestId": "req-1737055535495-l0a654u1s"
  }
}
```
_Automatically normalized: `payload.requestId` → `requestId`_
