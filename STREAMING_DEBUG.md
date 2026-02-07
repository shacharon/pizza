# Assistant Streaming Debug Guide

## Problem: Text appears instantly instead of streaming

## Step 1: Open Browser Console (F12)

Press F12 and go to the Console tab.

## Step 2: Run This Diagnostic

Copy and paste this into the console:

```javascript
console.clear();
console.log('=== ASSISTANT STREAMING DIAGNOSTICS ===\n');

// Check 1: Config Override
const configOverride = window.__ASSISTANT_STREAMING_CONFIG;
console.log('1. Config Override:', configOverride || 'none (default: sentence mode)');
if (configOverride?.mode === 'instant') {
  console.warn('⚠️ ISSUE: Mode is set to INSTANT!');
  console.log('   Fix: Run: setAssistantStreamingMode("sentence")');
}

// Check 2: Helper Function
console.log('2. Helper Available:', typeof setAssistantStreamingMode);
if (typeof setAssistantStreamingMode !== 'function') {
  console.warn('⚠️ ISSUE: Helper function not loaded!');
}

// Check 3: Dev Mode
console.log('3. Dev Mode Logs:', 'Check if you see [AssistantStreaming] logs above');

console.log('\n=== QUICK FIXES ===');
console.log('Try: setAssistantStreamingMode("word")');
console.log('Then perform a new search');
console.log('=====================================\n');
```

## Step 3: What Should You See?

### ✅ Good Output (Streaming Should Work):
```
1. Config Override: none (default: sentence mode)
2. Helper Available: function
3. Dev Mode Logs: Check if you see [AssistantStreaming] logs above
```

### ❌ Bad Output Examples:

**Problem: Instant Mode Override**
```
1. Config Override: { mode: "instant" }  ⚠️
```
**Fix:**
```javascript
setAssistantStreamingMode('sentence')
```

**Problem: Helper Not Available**
```
3. Helper Available: undefined  ⚠️
```
**Fix:** Refresh the page - the config module may not have loaded

## Step 4: Force Word Mode (More Obvious)

Run this in console:

```javascript
setAssistantStreamingMode('word')
```

Then **perform a new search**. You should see text appearing word by word.

## Step 5: Check for [AssistantStreaming] Logs

When you perform a search, you should see logs like:

```
[AssistantStreaming] Service initialized
[AssistantStreaming] Stream started {
  streamId: 0,
  mode: 'sentence',
  tokenCount: 42,
  estimatedDuration: 2400,
  textPreview: 'Here are some great restaurants...'
}
[AssistantStreaming] Sentence stream completed { streamId: 0 }
```

### If You DON'T See These Logs:

**Problem:** Service not running in dev mode or not initializing

**Fix:** Check if dev server is running with:
```bash
ng serve
```

## Step 6: Nuclear Option - Force Slower Streaming

If nothing works, make it VERY obvious:

```javascript
window.__ASSISTANT_STREAMING_CONFIG = {
  mode: 'word',
  msPerWord: 100,           // Very slow: 100ms per word
  maxDurationMs: 30000      // Allow 30 seconds
}
```

Then perform a new search. If this doesn't show animation, something else is wrong.

## Step 6: Check Component

If diagnostics look good but still no streaming, the component might not be wired up.

Check browser console for:
- Red error messages
- [AssistantStreaming] logs appearing
- Any Angular errors

## Common Issues & Solutions

| Symptom | Cause | Fix |
|---------|-------|-----|
| No animation, no logs | Dev server not in dev mode | Check `ng serve` is running |
| "mode: instant" in logs | Config override | Run `setAssistantStreamingMode('sentence')` |
| Logs appear but no animation | Text too short | Use longer test query |
| Animation too fast to see | Default timing too quick | Try word mode with longer delay |

## Test Query

Use this query to test (longer text):

> "I want Italian food with vegetarian options near downtown"

This should give you a longer assistant response to see the streaming effect.

## Still Not Working?

1. **Hard refresh:** Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear cache:** DevTools → Network → Disable cache (checkbox)
3. **Restart dev server:** Stop and run `ng serve` again
4. **Check terminal:** Look for compilation errors

## Report Back

Run the diagnostic and tell me:
1. What does "Config Override" say?
2. Do you see any [AssistantStreaming] logs?
3. Any red errors in console?
