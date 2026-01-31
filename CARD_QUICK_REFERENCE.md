# Restaurant Card - Quick Reference

## Component Usage

```typescript
<app-restaurant-card
  [restaurant]="restaurant"
  [selected]="false"
  [isTopResult]="false"
  [showReasonLabel]="false"
  [compact]="false"
  (cardClick)="onRestaurantClick($event)"
  (actionClick)="onActionClick($event)"
/>
```

## New Features at a Glance

### 1. Clickable Name

```html
<h3 class="restaurant-name clickable">Restaurant Name</h3>
```

- Blue link color
- Underlines on hover
- Emits `cardClick` when clicked

### 2. Cuisine Tag

```html
<p class="cuisine-tag">🍕 Pizza · Italian</p>
```

- Auto-detected from tags
- 40+ cuisines supported
- English + Hebrew

### 3. Compact Address

```html
<p class="restaurant-address-compact">📍 Tel Aviv · 2.3 km</p>
```

- City + distance format
- Falls back gracefully

### 4. Action Bar

```html
<div class="action-bar">
  <button class="action-button">
    <span class="action-icon">📍</span>
    <span class="action-label">Navigate</span>
  </button>
  <!-- More buttons... -->
</div>
```

- Desktop: Vertical, right side
- Mobile: Horizontal, bottom
- Labeled for clarity

### 5. Edge States

**Closed Restaurant:**

```html
<article class="restaurant-card closed"></article>
```

- 75% opacity
- Gray background
- Muted appearance

**No Image:**

```html
<div class="restaurant-photo-placeholder">🍽️</div>
```

- Blue gradient
- Dashed border
- High-quality feel

## New Methods

### getCuisineTag()

```typescript
getCuisineTag(): string
// Returns: "🍕 Pizza" or "🍣 Sushi · Asian"
```

### getCompactAddress()

```typescript
getCompactAddress(): string
// Returns: "📍 Tel Aviv · 2.3 km"
```

### getOpeningTime()

```typescript
getOpeningTime(): string
// Returns: "Opens at 18:00" (future)
```

## CSS Classes

### New Classes

- `.clickable` - Clickable restaurant name
- `.cuisine-tag` - Cuisine/category display
- `.restaurant-address-compact` - Compact address
- `.action-bar` - Horizontal action bar
- `.action-button` - Labeled action button
- `.action-icon` - Button icon
- `.action-label` - Button label
- `.opening-time` - Opening time display
- `.closed` - Closed restaurant state

### Modified Classes

- `.restaurant-card` - Added `.closed` state
- `.restaurant-photo-placeholder` - Enhanced styling
- `.restaurant-name` - Added `.clickable` variant

### Deprecated (but maintained)

- `.quick-actions` - Old vertical action buttons
- `.icon-only` - Old icon-only buttons

## Responsive Breakpoints

```scss
// Desktop (default)
@media (min-width: 769px) {
  // Action bar on right with vertical separator
  // Full labels visible
  // Hover effects
}

// Mobile
@media (max-width: 768px) {
  // Action bar at bottom with horizontal separator
  // Compact labels
  // Touch-safe targets (44px)
}

// Compact mode (prop-based)
&.compact {
  // Ultra-minimal variant
  // 60px images
  // Minimal spacing
}
```

## Color Palette

```scss
// Links
$link-blue: #2563eb;
$link-hover: #1d4ed8;
$link-active: #1e40af;

// Placeholder
$placeholder-bg: linear-gradient(135deg, #f0f9ff 0%, #dbeafe 100%);
$placeholder-color: #93c5fd;
$placeholder-border: #bfdbfe;

// Closed state
$closed-opacity: 0.75;
$closed-bg: #fafafa;

// Action bar
$action-border: #e5e7eb;
$action-hover-bg: #f3f4f6;
$action-active-bg: #e5e7eb;
```

## Events

### cardClick

```typescript
cardClick.emit(restaurant: Restaurant)
// Triggered when: Name or card body clicked
```

### actionClick

```typescript
actionClick.emit({
  type: ActionType,
  level: ActionLevel,
});
// Triggered when: Action button clicked
// Types: GET_DIRECTIONS, CALL_RESTAURANT, SAVE_FAVORITE
```

## Cuisine Mapping

Supported cuisines (examples):

- `sushi` → 🍣 Sushi
- `pizza` → 🍕 Pizza
- `italian` → 🍝 Italian
- `burger` → 🍔 Burger
- `chinese` → 🥡 Chinese
- `indian` → 🍛 Indian
- ... 40+ total (see component for full list)

Hebrew support:

- `סושי` → 🍣 סושי
- `פיצה` → 🍕 פיצה
- `איטלקי` → 🍝 איטלקי
- ... (full list in component)

## Accessibility

```html
<!-- All buttons have proper aria-labels -->
<button [attr.aria-label]="'Navigate to ' + restaurant().name">
  <!-- Disabled states announced -->
  <button [disabled]="!isActionAvailable('CALL_RESTAURANT')">
    <!-- Focus indicators -->
    &:focus { outline: 2px solid #60a5fa; }

    <!-- Touch targets ≥44px on mobile -->
    .action-button { min-height: 44px; }
  </button>
</button>
```

## Performance Tips

1. **Photo Loading**

   - Non-blocking by default
   - Lazy loading enabled
   - Placeholder shows immediately

2. **Change Detection**

   - OnPush strategy (already enabled)
   - All inputs use signals
   - Minimal re-renders

3. **Layout Shifts**
   - Fixed photo heights (140px desktop, 130px mobile)
   - Prevents CLS
   - Smooth rendering

## Common Patterns

### Display with actions

```typescript
<app-restaurant-card
  [restaurant]="restaurant"
  (cardClick)="viewDetails($event)"
  (actionClick)="handleAction($event)"
/>
```

### Compact mode (mobile)

```typescript
<app-restaurant-card
  [restaurant]="restaurant"
  [compact]="true"
/>
```

### Top result highlight

```typescript
<app-restaurant-card
  [restaurant]="restaurant"
  [isTopResult]="index === 0"
  [showReasonLabel]="true"
/>
```

## Debugging

### Check cuisine detection

```typescript
console.log("Cuisine:", component.getCuisineTag());
console.log("Tags:", component.restaurant().tags);
```

### Check address formatting

```typescript
console.log("Compact:", component.getCompactAddress());
console.log("Distance:", component.restaurant().distanceMeters);
```

### Check action availability

```typescript
console.log("Call available:", component.isActionAvailable("CALL_RESTAURANT"));
console.log("Phone:", component.restaurant().phoneNumber);
```

## Browser DevTools

### Inspect states

```javascript
// Get component
const card = document.querySelector("app-restaurant-card");

// Check classes
console.log(card.classList);
// Should see: restaurant-card, [selected], [top-result], [compact], [closed]

// Check computed styles
console.log(getComputedStyle(card));
```

### Test interactions

```javascript
// Click name
card.querySelector(".restaurant-name").click();

// Click action
card.querySelector(".action-button").click();
```

## FAQ

**Q: Why is the name blue?**
A: It's now clearly clickable (primary action) with link styling.

**Q: Can I hide the cuisine tag?**
A: Not currently, but it auto-detects and falls back to "🍽️ Restaurant".

**Q: How do I add more cuisines?**
A: Edit the `cuisineMap` in `getCuisineTag()` method.

**Q: Can I revert to icon-only buttons?**
A: Use `compact="true"` prop for minimal buttons without labels.

**Q: How do I customize colors?**
A: Edit the SCSS variables in the component stylesheet.

**Q: Is RTL supported?**
A: Yes! Hebrew text and layout work correctly.

**Q: What about dark mode?**
A: Not currently implemented, but colors can be themed.

## Resources

- Full documentation: `CARD_REFACTOR_SUMMARY.md`
- Visual guide: `CARD_VISUAL_GUIDE.md`
- Migration guide: `MIGRATION_GUIDE.md`
- Component code: `restaurant-card.component.ts`
- Template: `restaurant-card.component.html`
- Styles: `restaurant-card.component.scss`
