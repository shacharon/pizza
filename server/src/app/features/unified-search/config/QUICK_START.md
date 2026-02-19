# Quick Start: Change Assistant Streaming Mode

## TL;DR

Edit **ONE LINE** in `assistant-streaming.config.ts`:

```typescript
mode: 'sentence',  // Change this to: 'instant', 'sentence', or 'word'
```

That's it! No other code changes needed.

---

## Examples

### Example 1: Disable All Streaming (Instant Mode)

```typescript
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'instant',  // ← Changed from 'sentence' to 'instant'
  msPerWord: 60,
  pauseAfterSentenceMs: 400,
  maxDurationMs: 5000
};
```

**Result:** All messages appear instantly, no animation.

---

### Example 2: Typewriter Effect (Word Mode)

```typescript
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'word',     // ← Changed from 'sentence' to 'word'
  msPerWord: 60,    // ← Fast typing (adjust to slow down)
  pauseAfterSentenceMs: 400,
  maxDurationMs: 5000
};
```

**Result:** Words appear one by one, typewriter style.

---

### Example 3: Slower Word Mode

```typescript
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'word',
  msPerWord: 120,   // ← Doubled the delay (slower)
  pauseAfterSentenceMs: 400,
  maxDurationMs: 5000
};
```

**Result:** Slower typewriter effect.

---

### Example 4: Faster Sentence Mode

```typescript
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'sentence',
  msPerWord: 60,
  pauseAfterSentenceMs: 200,  // ← Halved the pause (faster)
  maxDurationMs: 5000
};
```

**Result:** Sentences appear with shorter pauses between them.

---

### Example 5: Longer Max Duration

```typescript
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'sentence',
  msPerWord: 60,
  pauseAfterSentenceMs: 400,
  maxDurationMs: 10000  // ← Increased cap to 10 seconds
};
```

**Result:** Longer messages can stream for up to 10 seconds before hitting the cap.

---

## File Location

```
llm-angular/src/app/features/unified-search/config/assistant-streaming.config.ts
```

## Testing Changes

1. Edit the config file
2. Save
3. Refresh your browser (or wait for hot reload)
4. Test with an assistant message

No build step required for config changes in development mode.

## Accessibility Note

Users with `prefers-reduced-motion` enabled will always see `instant` mode, regardless of your configuration. This is intentional for accessibility.
