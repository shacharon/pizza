# Assistant Streaming Configuration

This directory contains configuration for assistant message streaming behavior.

## Overview

Assistant messages are revealed progressively to create a more engaging user experience. The streaming behavior is fully configurable without requiring code changes.

## Configuration File

**Location:** `assistant-streaming.config.ts`

## Streaming Modes

### 1. `instant` Mode
- **Behavior:** Renders the full message immediately
- **Use case:** Users who prefer no animations, accessibility
- **Note:** Automatically activated when `prefers-reduced-motion` is detected

### 2. `sentence` Mode (Default)
- **Behavior:** Reveals text sentence by sentence with pauses between
- **Configuration:**
  - `pauseAfterSentenceMs`: Pause duration after each sentence (default: 400ms)
  - `maxDurationMs`: Maximum total animation time (default: 5000ms)
- **Use case:** Balanced, natural reading rhythm

### 3. `word` Mode
- **Behavior:** Reveals text word by word
- **Configuration:**
  - `msPerWord`: Milliseconds per word (default: 60ms)
  - `maxDurationMs`: Maximum total animation time (default: 5000ms)
- **Use case:** Typewriter effect, faster streaming

## Changing the Mode

Edit `DEFAULT_ASSISTANT_STREAMING_CONFIG` in `assistant-streaming.config.ts`:

```typescript
export const DEFAULT_ASSISTANT_STREAMING_CONFIG: AssistantStreamingConfig = {
  mode: 'sentence',              // Change to: 'instant', 'sentence', or 'word'
  msPerWord: 60,                 // Only used in 'word' mode
  pauseAfterSentenceMs: 400,     // Only used in 'sentence' mode
  maxDurationMs: 5000            // Caps total animation time
};
```

## User Interactions

### Click-to-Reveal
Users can click or tap on any streaming message to reveal the full text immediately.

### Reduced Motion
The system automatically detects `prefers-reduced-motion` and forces `instant` mode for accessibility.

## Implementation Details

### Service
**Location:** `../../services/assistant-streaming.service.ts`

The `AssistantStreamingService` handles:
- Progressive text reveal based on configuration
- Cancellation when new messages arrive
- Accessibility (prefers-reduced-motion detection)
- Timing calculations with max duration caps

### Component Integration
**Location:** `../../components/assistant-summary/assistant-summary.component.ts`

The `AssistantSummaryComponent`:
- Uses the streaming service for all assistant messages
- Manages streaming state per message
- Handles click-to-reveal
- Cancels streaming on new messages

## V1 Baseline

- **Language:** English only
- **Text Direction:** LTR (left-to-right) only
- **Sentence Detection:** English sentence boundaries (. ! ?)
- **Word Detection:** English word boundaries (whitespace)

## Future Enhancements

Potential improvements for future versions:
- Multi-language support (RTL, CJK sentence detection)
- Runtime mode switching (user preference UI)
- Per-message-type configuration
- Custom timing curves
- Sound effects or haptic feedback options
