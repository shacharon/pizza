# Restaurant Card UX/UI Refactor - Visual Guide

## Desktop View

### BEFORE:

```
┌─────────────────────────────────────────────────────────┐
│  ┌────┐                                          📍    │
│  │IMG │  Test Restaurant                         📞    │
│  │    │  ⭐ 4.5 · 250 reviews · $$                ❤️    │
│  └────┘  123 Main St, City                             │
│          Open now                                       │
│          Italian  Pizza                                 │
└─────────────────────────────────────────────────────────┘
```

### AFTER:

```
┌─────────────────────────────────────────────────────────────────┐
│  ┌────┐                                    │ ┌───────────┐     │
│  │IMG │  Test Restaurant (clickable blue)  │ │📍Navigate │     │
│  │    │  🍕 Pizza · Italian                │ ├───────────┤     │
│  └────┘  ⭐ 4.5 · 250 reviews · $$          │ │📞 Call    │     │
│          📍 City · 2.3 km                   │ ├───────────┤     │
│          Open now                           │ │❤️ Save     │     │
└─────────────────────────────────────────────┴─┴───────────┴─────┘
```

## Mobile View

### BEFORE:

```
┌────────────────────┐
│                    │
│    ┌──────────┐    │
│    │   IMG    │    │
│    │          │    │
│    └──────────┘    │
│                    │
│  Test Restaurant   │
│  ⭐ 4.5 · 250      │
│  123 Main St       │
│  Open now          │
│                    │
│    📍  📞  ❤️      │
└────────────────────┘
```

### AFTER:

```
┌────────────────────┐
│                    │
│  ┌──────────────┐  │
│  │     IMG      │  │
│  └──────────────┘  │
│                    │
│  Test Restaurant   │  ← Blue link
│  🍕 Pizza          │  ← New!
│  ⭐ 4.5 · 250      │
│  📍 City · 2.3 km  │  ← Compact!
│  Open now          │
│                    │
│ ────────────────── │
│ 📍      📞     ❤️  │  ← Horizontal bar
│Navigate Call  Save │  ← Labels!
└────────────────────┘
```

## Key Visual Changes

### 1. Restaurant Name

**Before:** Black text, not obviously clickable
**After:** Blue link color (#2563eb), underlines on hover, clearly interactive

### 2. Cuisine Tag

**Before:** Not present or buried in tags
**After:** Prominent second line with emoji "🍕 Pizza · Italian"

### 3. Address

**Before:** "123 Main Street, City, Israel"
**After:** "📍 City · 2.3 km" (compact, icon-led)

### 4. Action Buttons (Desktop)

**Before:**

- Vertical stack on far right
- Icon-only (📍📞❤️)
- Floats disconnected from content

**After:**

- Separated by vertical line
- Labeled buttons (Navigate, Call, Save)
- Grouped as cohesive action bar
- Balances right side visually

### 5. Action Buttons (Mobile)

**Before:**

- Small icons at bottom
- 44px touch targets
- Icon-only

**After:**

- Horizontal row at bottom
- Labeled (Navigate, Call, Save)
- Separated by top border
- Still 44px touch targets
- Better discoverability

### 6. Placeholder (No Image)

**Before:**

- Gray gradient
- 🍽️ icon in gray
- Plain appearance

**After:**

- Blue gradient (f0f9ff → dbeafe)
- 🍽️ icon in softer blue
- Dashed border
- Hover effect (brightens)
- Higher quality feel

### 7. Closed State

**Before:**

- Same appearance as open
- Only text indicator

**After:**

- Muted card (75% opacity)
- Gray background (#fafafa)
- "Closed" in gray color
- Optional "Opens at HH:MM"
- Clear visual distinction

## Color Palette

### Links

- Default: `#2563eb` (blue-600)
- Hover: `#1d4ed8` (blue-700)
- Active: `#1e40af` (blue-800)

### Placeholder

- Background: `linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%)`
- Icon: `#93c5fd` (blue-300)
- Border: `#bfdbfe` (blue-200, dashed)
- Hover Background: `linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)`
- Hover Icon: `#60a5fa` (blue-400)

### Closed State

- Opacity: `0.75`
- Background: `#fafafa`
- Border: `#e5e7eb`

### Action Bar

- Border: `#e5e7eb`
- Button Background (hover): `#f3f4f6`
- Button Background (active): `#e5e7eb`
- Text: `#6b7280` → `#111827` on hover

## Typography Scale

### Desktop

- Name: `1.375rem` (22px) - Bold 600
- Cuisine: `0.875rem` (14px) - Medium 500
- Meta: `0.875rem` (14px) - Normal 400
- Address: `0.8125rem` (13px) - Normal 400
- Signal: `0.8125rem` (13px) - Normal 400
- Action Label: `0.75rem` (12px) - Medium 500

### Mobile

- Name: `1.0625rem` (17px) - Bold 600
- Cuisine: `0.75rem` (12px) - Medium 500
- Meta: `0.8125rem` (13px) - Normal 400
- Address: `0.75rem` (12px) - Normal 400
- Signal: `0.75rem` (12px) - Normal 400
- Action Label: `0.6875rem` (11px) - Medium 500

### Compact Mode

- Name: `0.9375rem` (15px) - Bold 600
- Cuisine: `0.6875rem` (11px) - Medium 500
- Meta: `0.75rem` (12px) - Normal 400
- Address: `0.6875rem` (11px) - Normal 400
- Signal: `0.6875rem` (11px) - Normal 400
- Action: Icon only (labels hidden)

## Spacing

### Desktop

- Card padding: `1.5rem` (24px)
- Content gap: `1.5rem` (24px)
- Action bar left padding: `1rem` (16px)
- Action bar gap: `0.75rem` (12px)
- Button padding: `0.5rem 0.75rem` (8px 12px)

### Mobile

- Content padding: `0.875rem` (14px)
- Content gap: `0.375rem` (6px)
- Action bar padding: `0.875rem` (14px)
- Action bar gap: `0.5rem` (8px)
- Button padding: `0.5rem 0.375rem` (8px 6px)

### Compact

- Card padding: `0.75rem` (12px)
- Content gap: `0.625rem` (10px)
- Action bar gap: `0.25rem` (4px)
- Button padding: `0.375rem 0.5rem` (6px 8px)

## Interaction States

### Restaurant Name (clickable)

1. Default: Blue (#2563eb)
2. Hover: Darker blue (#1d4ed8) + underline
3. Active: Darkest blue (#1e40af)
4. Focus: 2px blue outline

### Action Buttons (Desktop)

1. Default: Transparent background, gray text
2. Hover: Light gray background (#f3f4f6), dark text (#111827)
3. Active: Medium gray background (#e5e7eb), scale(0.97)
4. Disabled: 40% opacity, not-allowed cursor

### Action Buttons (Mobile)

1. Default: Transparent background, gray text
2. Tap: Light gray background (#f3f4f6), scale(0.95)
3. Disabled: 40% opacity, not-allowed cursor

## Browser Support

✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+
✅ Mobile Safari (iOS 14+)
✅ Mobile Chrome (Android 10+)

## Accessibility

✅ All buttons have aria-labels
✅ Disabled states properly announced
✅ Focus indicators visible
✅ Touch targets ≥ 44px
✅ Color contrast WCAG AA compliant
✅ Keyboard navigation supported
✅ Screen reader friendly

## Performance

✅ No layout shifts (fixed heights)
✅ Non-blocking photo loading
✅ CSS transitions GPU-accelerated
✅ Minimal repaints
✅ OnPush change detection
✅ Lazy image loading

## Internationalization (i18n)

✅ RTL support (Hebrew)
✅ English/Hebrew cuisine names
✅ Bilingual action labels ready
✅ Dynamic text truncation
✅ Emoji icons (language-agnostic)
