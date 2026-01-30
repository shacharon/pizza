# Signal Rendering (Language-Agnostic)

## Overview

Language-agnostic rendering system for card signals. Handles text of any length gracefully with single-line truncation and consistent styling across all languages.

---

## Design Philosophy

**"Language-Agnostic, Length-Tolerant"**

Signal text is treated as an opaque string. No assumptions about language, script direction, or text length. The UI must handle Hebrew (right-to-left), English (left-to-right), and any future language without layout breaks.

---

## Implementation

### HTML Structure

```html
<!-- Single-line signal slot -->
@if (cardSignal()) {
<p class="card-signal-text" 
  [class.emphasized]="isCardSignalEmphasized()"
  [style.color]="getCardSignalColor()"
  [attr.aria-label]="'Signal: ' + getCardSignalLabel()">
  {{ getCardSignalLabel() }}
</p>
}
```

**Key Features:**
- **Conditional rendering** - Hidden if no signal (`@if (cardSignal())`)
- **Dynamic color** - Set inline via `getCardSignalColor()`
- **Emphasis class** - Applied only for `OPEN_NOW` signal
- **Accessibility** - `aria-label` for screen readers

---

### CSS Styles (Language-Agnostic)

```scss
.card-signal-text {
  // Typography
  font-size: 0.8125rem;   // Desktop: 13px
  font-weight: 400;       // Normal weight (500 when emphasized)
  line-height: 1.4;
  
  // LANGUAGE-AGNOSTIC: Single-line with truncation
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
  
  // Spacing
  margin: 0.25rem 0 0.5rem 0;
  
  // Emphasis (OPEN_NOW only)
  &.emphasized {
    font-weight: 500;
  }
}
```

**Mobile Styles:**
```scss
@media (max-width: 768px) {
  .card-signal-text {
    font-size: 0.75rem;   // Mobile: 12px (smaller)
    margin: 0;            // Gap handles spacing
    
    // Same truncation rules
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
}
```

---

## Truncation Behavior

### Short Text (Normal Case)

**Hebrew:**
```
┌─────────────────────────┐
│ פתוח עכשיו              │  ← Full text visible
└─────────────────────────┘
```

**English:**
```
┌─────────────────────────┐
│ Open now                │  ← Full text visible
└─────────────────────────┘
```

---

### Long Text (Truncated)

**Hebrew:**
```
┌─────────────────────────┐
│ טוב לארוחת בוקר עם המ...│  ← Ellipsis truncation
└─────────────────────────┘
```

**English:**
```
┌─────────────────────────┐
│ Good for breakfast wi...│  ← Ellipsis truncation
└─────────────────────────┘
```

**Hover/Tooltip (Future):**
```
┌─────────────────────────┐
│ Good for breakfast wi...│
│ ┌─────────────────────┐ │
│ │ Good for breakfast  │ │  ← Full text on hover
│ │ with family         │ │
│ └─────────────────────┘ │
└─────────────────────────┘
```

---

## Visual Examples

### Example 1: Hebrew Short Text

```
Card Layout:
┌─────────────────────────┐
│ [Image]                 │
├─────────────────────────┤
│ Restaurant Name         │
│ ⭐ 4.5 · 120 reviews   │
│ Address, City           │
│ פתוח עכשיו   ← Signal  │  ✓ Full text fits
│ [tag]                   │
│ [📍][📞][❤️]          │
└─────────────────────────┘
```

---

### Example 2: English Short Text

```
Card Layout:
┌─────────────────────────┐
│ [Image]                 │
├─────────────────────────┤
│ Restaurant Name         │
│ ⭐ 4.5 · 120 reviews   │
│ Address, City           │
│ Open now     ← Signal   │  ✓ Full text fits
│ [tag]                   │
│ [📍][📞][❤️]          │
└─────────────────────────┘
```

---

### Example 3: Hebrew Long Text (Truncated)

```
Card Layout:
┌─────────────────────────┐
│ [Image]                 │
├─────────────────────────┤
│ Restaurant Name         │
│ ⭐ 4.5 · 120 reviews   │
│ Address, City           │
│ טוב לארוחת בוקר עם... │  ✓ Truncated with ellipsis
│ [tag]                   │
│ [📍][📞][❤️]          │
└─────────────────────────┘
```

---

### Example 4: English Long Text (Truncated)

```
Card Layout:
┌─────────────────────────┐
│ [Image]                 │
├─────────────────────────┤
│ Restaurant Name         │
│ ⭐ 4.5 · 120 reviews   │
│ Address, City           │
│ Good for breakfast wi...│  ✓ Truncated with ellipsis
│ [tag]                   │
│ [📍][📞][❤️]          │
└─────────────────────────┘
```

---

## Language Comparison

### Hebrew (RTL)

**Short Signals:**
```
פתוח עכשיו          (6 chars)  ✓ Fits
סגור עכשיו          (6 chars)  ✓ Fits
זול                 (3 chars)  ✓ Fits
קרוב                (4 chars)  ✓ Fits
```

**Long Signals:**
```
טוב לארוחת בוקר     (15 chars) ✓ Fits
טוב לארוחת בוקר עם המשפחה  (27 chars) ⚠️ Truncates
```

---

### English (LTR)

**Short Signals:**
```
Open now            (8 chars)  ✓ Fits
Closed now          (10 chars) ✓ Fits
Cheap               (5 chars)  ✓ Fits
Nearby              (6 chars)  ✓ Fits
```

**Long Signals:**
```
Good for breakfast  (18 chars) ✓ Fits
Good for breakfast with family  (30 chars) ⚠️ Truncates
```

---

## Styling Rules

### Color System (Applied via Inline Styles)

```typescript
getCardSignalColor(): string {
  const signal = this.cardSignal();
  if (!signal) return '#9ca3af';
  
  switch (signal.type) {
    case 'OPEN_NOW':      return '#10b981';  // Green (emphasized)
    case 'CLOSED_NOW':    return '#9ca3af';  // Light gray
    case 'PRICE_CHEAP':
    case 'PRICE_MID':
    case 'PRICE_EXPENSIVE':
    case 'NEARBY':
    case 'INTENT_MATCH':  return '#6b7280';  // Medium gray
    default:              return '#9ca3af';  // Light gray
  }
}
```

---

### Font Weight System

```scss
.card-signal-text {
  font-weight: 400;       // Default: Normal
  
  &.emphasized {
    font-weight: 500;     // Emphasis: Medium (OPEN_NOW only)
  }
}
```

---

## Responsive Behavior

### Desktop (>768px)

```scss
.card-signal-text {
  font-size: 0.8125rem;   // 13px
  margin: 0.25rem 0 0.5rem 0;
}
```

---

### Mobile (≤768px)

```scss
.card-signal-text {
  font-size: 0.75rem;     // 12px (smaller for space)
  margin: 0;              // Gap handles spacing
}
```

---

## RTL (Right-to-Left) Support

### Automatic Browser Handling

```html
<p class="card-signal-text" dir="auto">
  {{ getCardSignalLabel() }}
</p>
```

**Browser automatically detects:**
- Hebrew text → RTL rendering
- English text → LTR rendering
- Mixed text → Handles bidirectional

**CSS properties work correctly:**
- `text-overflow: ellipsis` → Works in both directions
- `white-space: nowrap` → Works in both directions
- `overflow: hidden` → Works in both directions

---

## Edge Cases Handled

### 1. No Signal (Null)

```html
@if (cardSignal()) {
  <!-- Signal slot -->
}
<!-- ← Slot hidden if cardSignal() is null -->
```

**Result:** No extra spacing, clean layout.

---

### 2. Very Long Text

```
Input:  "Good for breakfast with family and friends on weekends"
Output: "Good for breakfast with family and frie..."
```

**Truncation:** Ellipsis after ~30-40 chars (depends on font/width).

---

### 3. Single Word

```
Hebrew: "זול"
English: "Cheap"
```

**Result:** Full text visible (short enough to fit).

---

### 4. Mixed Scripts

```
Input: "Good for ארוחת בוקר"
```

**Browser:** Handles bidirectional text correctly.  
**Truncation:** Works regardless of script direction.

---

### 5. Special Characters

```
Input: "Brunch's special"
Output: "Brunch's special"
```

**Result:** Apostrophes, quotes, dashes handled correctly.

---

## Accessibility

### Screen Reader Support

```html
<p class="card-signal-text" 
  [attr.aria-label]="'Signal: ' + getCardSignalLabel()">
  {{ getCardSignalLabel() }}
</p>
```

**Example:**
```
Visual:     "פתוח עכשיו"
ARIA label: "Signal: פתוח עכשיו"
```

**Screen reader announces:** "Signal: Open now" (or Hebrew equivalent).

---

### Keyboard Navigation

Signal text is **not focusable** (pure display, no interaction).

If future interaction needed:
```html
<button class="card-signal-text" (click)="onSignalClick()">
  {{ getCardSignalLabel() }}
</button>
```

---

## Testing Scenarios

### Visual Regression Tests

1. **Hebrew short text** - "פתוח עכשיו"
2. **English short text** - "Open now"
3. **Hebrew long text** - "טוב לארוחת בוקר עם המשפחה"
4. **English long text** - "Good for breakfast with family"
5. **No signal** - Slot hidden
6. **Mixed scripts** - "Good for ארוחת בוקר"

### Cross-Browser Tests

- **Chrome** - Truncation works
- **Firefox** - Truncation works
- **Safari** - Truncation works
- **Edge** - Truncation works
- **Mobile Safari** - Truncation works
- **Mobile Chrome** - Truncation works

---

## Future Enhancements

### 1. Tooltip on Truncation

```html
<p class="card-signal-text" 
  [title]="getCardSignalLabel()"
  [class.truncated]="isTextTruncated()">
  {{ getCardSignalLabel() }}
</p>
```

**Behavior:** Show full text on hover if truncated.

---

### 2. Multi-Line Signals (Optional)

```scss
.card-signal-text {
  white-space: normal;    // Allow wrap
  max-height: 2.8em;      // 2 lines max
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
```

**Note:** Current design is single-line only.

---

### 3. Icon Prefix (Optional)

```html
<p class="card-signal-text">
  <span class="signal-icon">🕐</span>
  <span class="signal-label">{{ getCardSignalLabel() }}</span>
</p>
```

**Note:** Current design is text-only (no icons).

---

## Summary

The signal rendering system is **fully language-agnostic** with the following guarantees:

✅ **Single-line slot** - No multi-line wrapping  
✅ **Ellipsis truncation** - Handles long text gracefully  
✅ **RTL/LTR support** - Browser handles automatically  
✅ **Hidden when null** - No extra spacing  
✅ **Consistent sizing** - Same across all languages  
✅ **Accessible** - ARIA labels for screen readers  
✅ **Responsive** - Smaller text on mobile  
✅ **No assumptions** - Treats text as opaque string  

**Implementation:**
- CSS: `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`
- HTML: Conditional rendering with `@if (cardSignal())`
- TypeScript: Helper methods for color/emphasis

**Tested for:**
- Hebrew (RTL)
- English (LTR)
- Short text (fits fully)
- Long text (truncates with ellipsis)
- No signal (slot hidden)
