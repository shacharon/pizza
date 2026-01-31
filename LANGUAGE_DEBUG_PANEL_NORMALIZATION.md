# Language Debug Panel - UI Normalization

## Task
Reduce and normalize the DEV Language Debug panel so it does NOT dominate the UI.

## Files Changed
- ✅ `llm-angular/src/app/features/unified-search/components/language-debug-panel/language-debug-panel.component.ts`

## Changes Made

### 1. **Compact Collapsed State (Default)**
- **Before**: Large, always-expanded panel with bright green borders (`320px min-width`, `z-index: 9999`)
- **After**: Single-line compact summary (`max-height: 40px`, `z-index: 100`)
  ```
  🌐 UI=he | Asst=he | Search=he
  ```

### 2. **Hover-to-Expand Interaction**
- **Collapsed (default)**: Minimal footprint, opacity 0.6
- **Expanded (on hover)**: Shows full details including Context Sources
- Smooth CSS transitions (0.2s ease-in-out)

### 3. **Visual Weight Reduction**
- **Font size**: 11px (down from 12px)
- **Borders**: Subtle dashed outline (`1px dashed rgba(128, 128, 128, 0.4)`)
- **Background**: `rgba(0, 0, 0, 0.75)` at rest, `rgba(0, 0, 0, 0.9)` on hover
- **Colors**: Muted palette (grays, subtle accent colors)
- **Removed**: Bright green borders (`#00ff00`), glowing box-shadow
- **z-index**: Reduced from `9999` to `100` (non-intrusive)

### 4. **Content Compression**
- **Collapsed**: Single line format
  - Icon: `🌐` (replaces `🔍`)
  - Text: `UI=<lang> | Asst=<lang> | Search=<lang>`
- **Expanded**: Compact grid layout
  - Labels: shortened (`UI:`, `Assistant:`, `Search:` → `UI:`, `Asst:`, `Search:`)
  - Sources: only visible when expanded

### 5. **Positioning**
- `position: fixed`
- `bottom: 16px; right: 16px` (corner placement)
- Low z-index (non-blocking)

### 6. **Production Safety**
- ✅ Guard maintained: `@if (!isProd() && response())`
- Panel is **completely hidden** in production builds

## Before vs. After

### Before (Dominant)
```
┌─────────────────────────────────┐
│ 🔍 Language Debug (DEV)        │ ← Always visible
│ ─────────────────────────────── │    Bright green
│ UI Language:        he          │    Large footprint
│ Assistant Language: he          │    z-index: 9999
│ Search Language:    he          │
│ ─────────────────────────────── │
│ Context Sources:                │
│   assistant: query, search: ... │
└─────────────────────────────────┘
```

### After (Compact)
```
Collapsed (default):
┌──────────────────────────┐
│ 🌐 UI=he | Asst=he | ... │ ← Subtle, small
└──────────────────────────┘    opacity: 0.6
                                z-index: 100

On hover (expanded):
┌──────────────────────────┐
│ 🌐 UI=he | Asst=he | ... │
│ ───────────────────────── │
│ Language Debug (DEV)      │
│ UI:        he             │
│ Assistant: he             │
│ Search:    he             │
│ Sources:   asst: query... │
└──────────────────────────┘
```

## Testing
1. **DEV mode**: Panel appears in bottom-right, collapsed by default
2. **Hover**: Panel expands smoothly to show full details
3. **Production**: Panel completely hidden (guarded by `!isProd()`)

## UI Impact
- ✅ Minimal visual footprint (40px height when collapsed)
- ✅ Non-intrusive colors and opacity
- ✅ Low z-index (doesn't block UI)
- ✅ Smooth transitions (professional feel)
- ✅ Information preserved (accessible on hover)
