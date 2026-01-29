# WS Assistant Status UX Fix

**Date**: 2026-01-29  
**Status**: ✅ **COMPLETE**

## Problem

The `app-assistant-line` component had several UX issues:
1. **Infinite "Connecting..." loop** - Showed "Connecting to assistant..." repeatedly from heartbeat broadcasts
2. **No success feedback** - When connection succeeded, the message just disappeared (no acknowledgment)
3. **Technical spam** - Too many status updates from heartbeat pings every 30s
4. **No state management** - No proper state machine, just raw status mapping

## Solution

### A) Frontend: Finite State Machine + One-time ACK

**File**: `llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`

**Changes**:

1. **Finite State Machine** - Implemented 4-state FSM:
   ```typescript
   type WsAssistantState = 'CONNECTING' | 'CONNECTED' | 'RECONNECTING' | 'OFFLINE';
   ```

2. **distinctUntilChanged** - Only process state transitions:
   ```typescript
   if (this.currentWsState === newState) {
     return; // Skip duplicate states
   }
   ```

3. **One-time Connection ACK**:
   ```typescript
   private ackShown = false;
   
   // Show "העוזרת מחוברת ✅" for 2.5s on first CONNECTED transition
   if (!this.ackShown && (from === 'CONNECTING' || from === 'RECONNECTING')) {
     this.wsStatusMessage.set({
       message: 'העוזרת מחוברת ✅',
       status: 'connected'
     });
     this.ackShown = true;
     
     setTimeout(() => this.wsStatusMessage.set(null), 2500);
   }
   ```

4. **Throttled RECONNECTING** - Max 1 update per 5 seconds:
   ```typescript
   private readonly RECONNECT_THROTTLE_MS = 5000;
   
   if (now - this.lastReconnectUpdate < this.RECONNECT_THROTTLE_MS) {
     return; // Skip throttled updates
   }
   ```

5. **Hebrew Messages**:
   - **CONNECTING**: "מתחבר לעוזרת..."
   - **CONNECTED (ACK)**: "העוזרת מחוברת ✅"
   - **RECONNECTING**: "מתחבר מחדש לעוזרת..."
   - **OFFLINE**: "לא מחובר לעוזרת"

### B) Backend: Lifecycle-only Broadcasts

**File**: `server/src/infra/websocket/websocket-manager.ts`

**Changes**:

1. **Send ws_status on connection only** (lifecycle event):
   ```typescript
   private handleConnection(ws: WebSocket, req: any): void {
     setupConnection(/* ... */);
     
     // Send ws_status ONLY on new connection (not every heartbeat)
     this.sendConnectionStatus(ws, 'connected');
   }
   ```

2. **Removed heartbeat broadcasts**:
   ```typescript
   private startHeartbeat(): void {
     this.heartbeatInterval = setInterval(() => {
       executeHeartbeat(this.wss.clients, this.cleanup.bind(this));
       
       // NO ws_status broadcast on heartbeat
       // This prevents infinite "connecting" spam
       
       // ... cleanup tasks ...
     }, this.config.heartbeatIntervalMs);
   }
   ```

3. **Single-client status sender**:
   ```typescript
   private sendConnectionStatus(ws: WebSocket, state: 'connected' | 'reconnecting' | 'offline'): void {
     // Send to specific client only, on lifecycle events
     ws.send(JSON.stringify({ type: 'ws_status', state, ts: new Date().toISOString() }));
   }
   ```

## State Transitions

### Normal Flow
```
null → CONNECTING (debounced 1s) → CONNECTED (ACK shown 2.5s) → null
```

### Reconnect Flow
```
CONNECTED → RECONNECTING (throttled 5s) → CONNECTED (ACK shown 2.5s) → null
```

### Offline Flow
```
CONNECTED → OFFLINE (show immediately) → CONNECTING → CONNECTED
```

## Key Features

✅ **Finite State Machine** - 4 states with explicit transitions  
✅ **distinctUntilChanged** - Only react to state changes  
✅ **One-time ACK** - "העוזרת מחוברת ✅" shown once per session  
✅ **Debounced CONNECTING** - Only show if lasts > 1s  
✅ **Throttled RECONNECTING** - Max 1 update per 5s  
✅ **Lifecycle-only events** - Server sends ws_status on connection, not heartbeat  
✅ **Hebrew messages** - User-friendly status messages in Hebrew  

## Testing

### Manual Test Flow

1. **First Connection**:
   - Open app
   - Should see "מתחבר לעוזרת..." briefly (if > 1s)
   - Then "העוזרת מחוברת ✅" for 2.5s
   - Then status clears

2. **Stable Connection**:
   - Leave app open for 5 minutes
   - Should see NO repeated "connecting" messages
   - Status line should be empty/stable

3. **Reconnection**:
   - Disconnect network
   - Should see "לא מחובר לעוזרת" immediately
   - Reconnect network
   - Should see "מתחבר מחדש לעוזרת..." (throttled, max 1 per 5s)
   - Then "העוזרת מחוברת ✅" for 2.5s
   - Then status clears

4. **Fast Reconnects**:
   - Simulate multiple reconnect attempts
   - Should see max 1 "מתחבר מחדש" per 5s (throttled)
   - No infinite loop

### Browser Console Logs

```javascript
// Check state transitions
// Should see:
[AssistantLine] State transition: null -> CONNECTING
[AssistantLine] State transition: CONNECTING -> CONNECTED
// ACK shown for 2.5s
// Then status cleared
```

### Server Logs

```bash
# Check ws_status is only sent on connection
grep "ws_status" server.log | grep "lifecycle event"

# Should see 1 event per connection, NOT repeated every 30s
```

## Before/After

### Before ❌
- Infinite "Connecting to assistant..." from heartbeats
- No success feedback when connected
- English messages
- No state management
- Heartbeat spam every 30s

### After ✅
- Finite state machine with 4 states
- One-time "העוזרת מחוברת ✅" acknowledgment
- Hebrew user-friendly messages
- distinctUntilChanged + throttling
- Lifecycle-only events (no heartbeat spam)

## Files Modified

### Frontend
1. ✅ `llm-angular/src/app/features/unified-search/components/assistant-line/assistant-line.component.ts`
   - Added finite state machine (WsAssistantState)
   - Implemented distinctUntilChanged logic
   - Added one-time ACK flag and timer
   - Added RECONNECTING throttle (5s)
   - Hebrew messages

### Backend
2. ✅ `server/src/infra/websocket/websocket-manager.ts`
   - Send ws_status on connection only (lifecycle event)
   - Removed heartbeat broadcasts
   - Changed from broadcast to single-client send

## Acceptance Criteria

✅ **1. No infinite loop** - Status messages only on state transitions  
✅ **2. Success ACK** - Shows "העוזרת מחוברת ✅" once when connected  
✅ **3. No spam** - Max 1 RECONNECTING update per 5s  
✅ **4. Lifecycle only** - Server sends ws_status on connection, not heartbeat  
✅ **5. Hebrew UX** - User-friendly messages in Hebrew  
✅ **6. Clean state** - Finite state machine with 4 explicit states  
✅ **7. No narrator** - SUMMARY/CLARIFY/GATE_FAIL ignored (handled by facade)  

## Deployment

### Phase 1: Frontend
```bash
cd llm-angular
npm start  # Test locally
npm run build  # Deploy when ready
```

### Phase 2: Backend
```bash
cd server
npm test  # Run tests
npm start  # Deploy when ready
```

**Note**: Both changes are backward compatible. Can deploy independently.

## Rollback Plan

**Frontend**:
- Revert assistant-line.component.ts to previous version
- Remove state machine, restore simple status mapping

**Backend**:
- Revert websocket-manager.ts
- Restore heartbeat broadcasts if needed

## Monitoring

**Frontend Console**:
```javascript
// Check for state transitions
// Should see clean state changes, no infinite loops
```

**Server Logs**:
```bash
# Check ws_status events are lifecycle-only
grep "ws_status" server.log | grep "lifecycle event"

# Should see 1 event per connection, not repeated
```

---

**Result**: Clean, finite, user-friendly assistant status with no infinite loops! 🎉
