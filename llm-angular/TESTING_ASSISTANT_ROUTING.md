# Testing Assistant Routing Fix

## Quick Verification

### 1. Test GATE_FAIL Scenario

**Query**: `"what the wather is ?"`

**Expected Behavior**:
- ✅ One GATE_FAIL card appears in assistant-summary
- ✅ Zero assistant-line entries (except WS status/progress)
- ✅ Results section is completely hidden
- ✅ No confusing "success" visuals

**Console Output**:
```
[AssistantHandler][ROUTING] { 
  requestId: "...", 
  type: "GATE_FAIL", 
  messageId: "...:GATE_FAIL:...",
  dedupDropped: false,
  routedTo: "card"
}
[AssistantHandler][CARD] { 
  messageId: "...", 
  type: "GATE_FAIL",
  totalCardMessages: 1,
  blocksSearch: true
}
```

### 2. Test Normal Search Flow

**Query**: `"pizza near me"`

**Expected Behavior**:
- ✅ PROGRESS messages appear in assistant-line (if any)
- ✅ SUMMARY card appears in assistant-summary
- ✅ Results show below
- ✅ No duplication between line and card

**Console Output**:
```
[AssistantHandler][ROUTING] { type: "PROGRESS", routedTo: "line" }
[AssistantHandler][LINE] { type: "PROGRESS", totalLineMessages: 1 }
[AssistantHandler][ROUTING] { type: "SUMMARY", routedTo: "card" }
[AssistantHandler][CARD] { type: "SUMMARY", totalCardMessages: 1 }
```

### 3. Test Deduplication (Dev Tools)

**Open Browser Console**:
```javascript
// Test duplicate detection
window.assistantDevTools.simulateDuplicates()

// Expected console output:
// [AssistantHandler][ROUTING] { dedupDropped: false, routedTo: "card" }
// [AssistantHandler][ROUTING] { dedupDropped: true, routedTo: "dropped" }
// [AssistantHandler][ROUTING] { dedupDropped: true, routedTo: "dropped" }
```

### 4. Test Reconnect Backlog

**Open Browser Console**:
```javascript
// Test reconnect scenario
window.assistantDevTools.simulateReconnectBacklog()

// Expected: All messages deduplicated, proper routing
```

## Dev Tools Commands

```javascript
// Enable verbose logging
window.assistantDevTools.enableVerboseLogging()

// Disable verbose logging
window.assistantDevTools.disableVerboseLogging()

// Simulate duplicates
window.assistantDevTools.simulateDuplicates('test-request-1', 'SUMMARY')

// Simulate reconnect backlog
window.assistantDevTools.simulateReconnectBacklog('test-request-2')
```

## Monitoring Logs

### Key Log Prefixes

Filter console by these prefixes:

1. **[AssistantHandler][ROUTING]** - All routing decisions
2. **[AssistantHandler][LINE]** - Line channel messages
3. **[AssistantHandler][CARD]** - Card channel messages
4. **[AssistantHandler][VERBOSE]** - Detailed payload info (when enabled)

### Example: Monitor Routing

```javascript
// In browser console, filter by:
[AssistantHandler]

// You'll see:
[AssistantHandler][ROUTING] { requestId, type, messageId, dedupDropped, routedTo }
[AssistantHandler][LINE] { messageId, type, message, totalLineMessages }
[AssistantHandler][CARD] { messageId, type, message, totalCardMessages, blocksSearch }
```

## Acceptance Tests

### Test 1: Canonical Routing

**Steps**:
1. Perform any search
2. Check console for routing logs
3. Verify each message type goes to correct channel

**Pass Criteria**:
- PRESENCE → line only
- WS_STATUS → line only
- PROGRESS → line only
- SUMMARY → card only
- CLARIFY → card only
- GATE_FAIL → card only

### Test 2: No Duplication

**Steps**:
1. Perform search: "pizza near me"
2. Watch for SUMMARY message
3. Verify it appears ONLY in assistant-summary
4. Verify it does NOT appear in assistant-line

**Pass Criteria**:
- Summary text appears once
- No duplicate rendering
- Console shows `dedupDropped: false` for first, `true` for any duplicates

### Test 3: GATE_FAIL UX

**Steps**:
1. Search: "what the wather is ?"
2. Wait for GATE_FAIL response
3. Verify UI state

**Pass Criteria**:
- One GATE_FAIL card visible
- Results section hidden
- No "Found X restaurants" text
- Clean failure UX

### Test 4: Reconnect Safety

**Steps**:
1. Use dev tools: `window.assistantDevTools.simulateReconnectBacklog()`
2. Check console logs
3. Verify no duplicates rendered

**Pass Criteria**:
- All messages show `dedupDropped: true` (except first of each type)
- No duplicate UI elements
- Proper ordering maintained

## Common Issues

### Issue: Messages not appearing

**Debug**:
1. Check console for routing logs
2. Verify `routedTo` is correct channel
3. Check `dedupDropped` - might be duplicate

### Issue: Duplicates still showing

**Debug**:
1. Check if multiple components subscribing to WS
2. Verify messageId is stable (uses seq/ts/hash)
3. Enable verbose logging: `window.assistantDevTools.enableVerboseLogging()`

### Issue: Wrong channel

**Debug**:
1. Check message type against `ASSISTANT_ROUTING` map
2. Verify type is valid `AssistantMessageType`
3. Check `assistant-routing.types.ts` for routing rules

## Performance Checks

### Expected Behavior

1. **Single WS subscription** - Only AssistantHandler subscribes
2. **Fast dedup** - O(1) Set lookup per message
3. **Minimal re-renders** - Signals update only on new messages
4. **Memory cleanup** - Old requestIds cleared automatically

### Monitor Performance

```javascript
// Check number of line messages (should stay low)
console.log('Line messages:', facade.assistantLineMessages().length)

// Check number of card messages (should be max 3: SUMMARY, CLARIFY, GATE_FAIL)
console.log('Card messages:', facade.assistantCardMessages().length)
```

## Rollback Plan

If issues arise, the changes are backward compatible:

1. Legacy `messages` signal still works
2. Components will fallback to old behavior if new signals are empty
3. Can disable new routing by reverting `SearchAssistantHandler`

## Next Steps

After verification:

1. Monitor production logs for routing patterns
2. Verify deduplication is working (check `dedupDropped: true` frequency)
3. Gather metrics on GATE_FAIL scenarios
4. Consider adding analytics for channel routing distribution

## Support

**Console Commands**:
```javascript
// Check current state
window.assistantDevTools

// Get help
console.log(window.assistantDevTools)
```

**Logging**:
All logs prefixed with `[AssistantHandler]` for easy filtering.

**Documentation**:
See `ASSISTANT_ROUTING_FIX.md` for architecture details.
