# Reveal-Limit UX Implementation

## Overview
Progressive result disclosure with WebSocket-based assistant nudge when user reaches the reveal limit (20 results).

## Requirements Met

### ✅ Core Behavior
- [x] Store full `results[]` from server (max 20)
- [x] Render only `visibleCount` results
- [x] Initial `visibleCount` = 10
- [x] "Load more" button adds +5 per click
- [x] Max `visibleCount` = 20
- [x] Hide/disable button when `visibleCount` == 20
- [x] **NEVER show total count** (no "found X", no "20 results")

### ✅ WebSocket Integration
- [x] On reaching `visibleCount==20` (second click): Send WS message
- [x] Message format: `{v:1, type:"reveal_limit_reached", requestId:<current>, channel:"assistant", uiLanguage}`
- [x] Display incoming `NUDGE_REFINE` assistant message in Assistant panel
- [x] Route to card display (not line)

### ✅ Fallback Behavior
- [x] If WS not connected: Use local fallback from `ws-nudge-copypack-v1.json`
- [x] Deterministic selection based on `requestId` hash
- [x] Hardcoded fallback if JSON load fails

### ✅ No Search Trigger
- [x] Load more does NOT trigger new search
- [x] Pure client-side pagination

## Implementation Details

### 1. Frontend - Search Page Component

**State Management**:
```typescript
private displayLimit = signal(10); // Starts at 10
private hasTriggeredRefinementSuggestion = signal(false); // One-time trigger
```

**Computed Properties**:
```typescript
// Full results (all 20 from server)
readonly fullResults = computed(() => {
  const groups = this.response()?.groups;
  // Returns all results, applies filters
});

// Visible results (sliced to displayLimit)
readonly visibleResults = computed(() => {
  return this.fullResults().slice(0, this.displayLimit());
});

// Can show more? (limit < fetched && limit < 20)
readonly canShowMore = computed(() => {
  const limit = this.displayLimit();
  const fetched = this.fetchedCount();
  return limit < fetched && limit < 20;
});
```

**Load More Logic**:
```typescript
loadMore(): void {
  // Increase limit by 5, max 20
  const currentLimit = this.displayLimit();
  const newLimit = Math.min(currentLimit + 5, 20);
  this.displayLimit.set(newLimit);

  // On reaching 20 (second click: 10→15→20), trigger refinement suggestion
  if (newLimit >= 20 && !this.hasTriggeredRefinementSuggestion()) {
    this.hasTriggeredRefinementSuggestion.set(true);
    this.triggerRefinementSuggestion();
  }
}
```

**Progression**:
1. Initial load: 10 results shown
2. First click: 15 results shown (+5)
3. Second click: 20 results shown (+5) → **Trigger NUDGE_REFINE**
4. Button hidden/disabled

### 2. WebSocket Message (Connected State)

**Message Format**:
```typescript
{
  v: 1,
  type: 'reveal_limit_reached',
  requestId: '<current-request-id>',
  channel: 'assistant',
  uiLanguage: 'he' | 'en' // Derived from query language
}
```

**Backend Response**:
```typescript
{
  type: 'assistant',
  requestId: '<request-id>',
  payload: {
    type: 'NUDGE_REFINE',
    message: '<language-specific-message>',
    question: null,
    blocksSearch: false,
    suggestedAction: 'REFINE_QUERY',
    uiLanguage: 'he' | 'en'
  }
}
```

### 3. Local Fallback (Disconnected State)

**Copypack Structure** (`ws-nudge-copypack-v1.json`):
```json
{
  "version": "v1",
  "messages": {
    "en": [
      "Showing all results. For more precise matches, try refining your search...",
      "You've seen all available results. To find more specific options...",
      "All results displayed. Want more targeted recommendations?...",
      "That's all the results we have. For better matches..."
    ],
    "he": [
      "הצגת כל התוצאות. כדי לקבל תוצאות מדויקות יותר...",
      "צפית בכל התוצאות הזמינות. כדי למצוא אפשרויות...",
      "כל התוצאות מוצגות. רוצה המלצות ממוקדות...",
      "אלו כל התוצאות שיש לנו. לתוצאות טובות..."
    ]
  },
  "selectionRules": {
    "algorithm": "Last char of requestId → index: '0-3'→0, '4-7'→1, '8-b'→2, 'c-f'→3"
  }
}
```

**Selection Algorithm**:
```typescript
// Get last character of requestId
const lastChar = requestId.charAt(requestId.length - 1).toLowerCase();

// Map to index (0-3)
if (['0','1','2','3'].includes(lastChar)) index = 0;
else if (['4','5','6','7'].includes(lastChar)) index = 1;
else if (['8','9','a','b'].includes(lastChar)) index = 2;
else if (['c','d','e','f'].includes(lastChar)) index = 3;

// Get message
const message = copypack.messages[language][index];
```

**Fallback Behavior**:
```typescript
if (wsConnected) {
  // Send WS signal to backend
  this.wsClient.send({ v:1, type:'reveal_limit_reached', ... });
} else {
  // Use local fallback
  const fallbackMessage = await this.getLocalNudgeMessage(requestId, language);
  this.facade.assistantHandler.addMessage('NUDGE_REFINE', fallbackMessage, ...);
}
```

### 4. Message Routing

**Assistant Routing** (`assistant-routing.types.ts`):
```typescript
export const ASSISTANT_ROUTING = {
  // ... other types
  'NUDGE_REFINE': 'card' // Display as card (not line)
}
```

**Display**:
- Shows in Assistant card panel
- Does not block search
- Suggests query refinement
- No action buttons (informational only)

## User Flow

### Scenario 1: WebSocket Connected

```
User searches "italian restaurants"
↓
Server returns 20 results
↓
UI shows 10 results + "Load more" button
↓
User clicks "Load more" (1st time)
↓
UI shows 15 results + "Load more" button
↓
User clicks "Load more" (2nd time)
↓
UI shows 20 results + button disappears
↓
Frontend sends WS message: {v:1, type:'reveal_limit_reached', ...}
↓
Backend responds with NUDGE_REFINE message
↓
Assistant card appears with refinement suggestion
✓ User sees: "Showing all results. Try refining your search..."
```

### Scenario 2: WebSocket Disconnected

```
User searches "italian restaurants"
↓
Server returns 20 results
↓
WebSocket fails to connect (503 Redis unavailable)
↓
UI shows 10 results + "Load more" button
↓
User clicks "Load more" (2nd time) → reaches 20
↓
Frontend detects WS disconnected
↓
Frontend loads local copypack
↓
Frontend selects message deterministically (requestId hash)
↓
Frontend injects NUDGE_REFINE message locally
↓
Assistant card appears with refinement suggestion
✓ User sees: "Showing all results. Try refining your search..."
```

## No-Count Policy

**Violations Removed**:
- ❌ ~~"Found 20 restaurants"~~
- ❌ ~~"Showing 10 of 20"~~
- ❌ ~~"Show 5 more (15 of 20)"~~

**Current Display**:
- ✅ "Load more" (no count)
- ✅ Results grid (no header count)
- ✅ Assistant message (no count mention)

**Why?**
- Prevents user from knowing if results are artificially limited
- Encourages query refinement instead of "seeing all"
- Reduces cognitive load (focus on quality, not quantity)

## Files Modified

### Frontend
1. **`search-page.component.ts`**
   - `displayLimit` signal (10 initial, +5 increment, 20 max)
   - `loadMore()` method with NUDGE_REFINE trigger
   - `triggerRefinementSuggestion()` with WS/fallback logic
   - `getLocalNudgeMessage()` copypack loader
   - `getHardcodedFallback()` emergency fallback

2. **`search-page.component.html`**
   - "Load more" button (no count)
   - `visibleResults()` rendering (sliced array)
   - `canShowMore()` conditional display

3. **`ws-nudge-copypack-v1.json`** (NEW)
   - 4 English messages
   - 4 Hebrew messages
   - Selection rules documentation

### Backend (Already Implemented)
1. **`websocket-protocol.ts`**
   - Updated `WSClientRevealLimitReached` interface (v1 format)

2. **`websocket-manager.ts`**
   - `handleRevealLimitReached()` handler
   - NUDGE_REFINE message generation

3. **`message-router.ts`**
   - Routes `reveal_limit_reached` to handler

## Testing

### Manual Test - Connected WS

```bash
# Start backend + frontend
npm start (both)

# Browser
1. Search "italian restaurants gedera"
2. Wait for 20 results
3. Click "Load more" → 15 visible
4. Click "Load more" → 20 visible
5. Observe:
   ✓ Button disappears
   ✓ Assistant card appears
   ✓ Message: "הצגת כל התוצאות. כדי לקבל תוצאות מדויקות יותר..."
   ✓ No count shown anywhere
```

### Manual Test - Disconnected WS

```bash
# Start backend without Redis (WS will fail)
REDIS_URL=redis://localhost:9999 npm start

# Browser
1. Search "italian restaurants"
2. Click "Load more" twice
3. Observe:
   ✓ Local fallback message appears
   ✓ No WS error in console
   ✓ Message is deterministic (same requestId → same message)
```

### Automated Test

```typescript
describe('Reveal Limit UX', () => {
  it('should show 10 results initially', () => {
    expect(component.visibleResults().length).toBe(10);
    expect(component.canShowMore()).toBe(true);
  });

  it('should show 15 results after first load more', () => {
    component.loadMore();
    expect(component.visibleResults().length).toBe(15);
    expect(component.canShowMore()).toBe(true);
  });

  it('should show 20 results after second load more', () => {
    component.loadMore();
    component.loadMore();
    expect(component.visibleResults().length).toBe(20);
    expect(component.canShowMore()).toBe(false);
  });

  it('should trigger NUDGE_REFINE on reaching 20', () => {
    const sendSpy = spyOn(wsClient, 'send');
    component.loadMore();
    component.loadMore();
    
    expect(sendSpy).toHaveBeenCalledWith({
      v: 1,
      type: 'reveal_limit_reached',
      requestId: jasmine.any(String),
      channel: 'assistant',
      uiLanguage: jasmine.any(String)
    });
  });

  it('should use local fallback when WS disconnected', async () => {
    wsClient.connectionStatus.set('disconnected');
    
    component.loadMore();
    component.loadMore();
    
    await fixture.whenStable();
    
    const assistantMessages = component.facade.assistantCardMessages();
    expect(assistantMessages.length).toBe(1);
    expect(assistantMessages[0].type).toBe('NUDGE_REFINE');
  });
});
```

## Key Behaviors

### ✅ Correct
- User clicks "Load more" → sees 5 more results
- User reaches 20 → sees assistant suggestion
- User refines search → starts fresh with 10 visible
- WS connected → backend generates message
- WS disconnected → local fallback (deterministic)
- No counts shown anywhere

### ❌ Incorrect (Prevented)
- ~~User sees "20 results found"~~
- ~~User sees "showing 10 of 20"~~
- ~~Load more triggers new search~~
- ~~Button shows after 20~~
- ~~Random fallback messages~~
- ~~WS error spam~~

## Future Improvements

1. **A/B Test**: Compare reveal-limit (10→15→20) vs show-all (20 immediate)
2. **Analytics**: Track how many users click "Load more" vs refine immediately
3. **Dynamic Limits**: Adjust initial limit based on screen size (mobile=5, desktop=10)
4. **Prefetch**: Load 20 results but render 10 (instant load-more)
5. **Smart Nudge**: Use query complexity to trigger earlier/later
6. **Copypack Rotation**: A/B test different message variants

## Related Documents
- `WS_TICKET_RETRY_BACKOFF_FIX.md` - WebSocket reliability
- `REDIS_INITIALIZATION_FIX.md` - Backend Redis setup
- `BASE_FILTERS_TIMEOUT_FIX.md` - Search reliability
