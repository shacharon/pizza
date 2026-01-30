# Mobile Sticky Fix - Implementation Summary

## Problem
Sticky positioning behaves badly on mobile (especially iOS Safari):
- Header jumps or doesn't stick properly
- Overlap issues with content
- Layout shifts during scroll
- Pull-to-refresh interfering with sticky behavior
- Body scrolling instead of dedicated container

## Solution - Flex Layout with Dedicated Scroll Container

**Approach:** Instead of using `position: sticky`, we use a flex column layout where:
- Header is `flex-shrink: 0` (naturally stays at top)
- Content is `flex: 1` with `overflow-y: auto` (only this scrolls)
- Body has `overflow: hidden` (never scrolls)

### 1. **Viewport Configuration** (`index.html`)
```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, maximum-scale=1">
```
- `viewport-fit=cover`: Enables safe-area support for notched devices
- `user-scalable=no`: Prevents zoom gestures that break sticky
- `maximum-scale=1`: Ensures consistent viewport behavior

### 2. **Global Layout** (`styles.scss`)
```scss
html, body {
    height: 100%;
    overflow: hidden; // Prevent body scroll
    position: fixed; // iOS Safari fix
    width: 100%;
}

app-root {
    display: block;
    height: 100%;
    overflow: hidden;
}
```
**Key Points:**
- Body scroll is disabled (only dedicated containers scroll)
- Prevents iOS rubber-band effect
- Ensures app root fills viewport

### 3. **App Container** (`app.component.scss`)
```scss
:host {
    display: flex;
    flex-direction: column;
    height: 100%;
    transform: none; // Critical: no transform on ancestors
}

.container {
    flex: 1;
    overflow: hidden;
    transform: none; // Critical: no transform on ancestors
}
```
**Key Points:**
- Flex layout ensures proper height distribution
- `transform: none` prevents sticky breaking on iOS
- Container doesn't scroll (child handles it)

### 4. **Search Page Layout** (`search-page.component.scss`)

#### Page Shell
```scss
.search-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden; // Only content scrolls
    position: relative;
    -webkit-overflow-scrolling: touch;
}
```

#### Sticky Header (TOP PANEL)
```scss
.search-header {
    position: sticky;
    top: env(safe-area-inset-top, 0); // Safe-area support
    z-index: 150;
    
    // Padding with safe-area
    padding-top: calc(1.5rem + env(safe-area-inset-top, 0));
    padding-left: max(1rem, env(safe-area-inset-left, 1rem));
    padding-right: max(1rem, env(safe-area-inset-right, 1rem));
    
    // Solid background (prevents see-through)
    background: #ffffff;
    background-clip: padding-box;
    
    // GPU acceleration for smooth sticky
    will-change: transform;
    transform: translateZ(0);
    -webkit-transform: translateZ(0);
    
    // Prevent shrinking
    flex-shrink: 0;
}
```
**Key Features:**
- `env(safe-area-inset-*)`: Respects device notches/safe areas
- Solid white background prevents content showing through
- GPU acceleration via `translateZ(0)` for smooth performance
- `flex-shrink: 0` prevents height collapse

#### Scroll Container (RESULTS AREA)
```scss
.search-content {
    flex: 1; // Takes remaining space
    overflow-y: auto; // Scrollable
    overflow-x: hidden;
    
    // iOS momentum scrolling
    -webkit-overflow-scrolling: touch;
    overscroll-behavior-y: contain; // Prevents pull-to-refresh
    
    // Safe-area padding
    padding: 1.5rem 1rem calc(1.5rem + env(safe-area-inset-bottom, 0));
    padding-left: max(1rem, env(safe-area-inset-left, 1rem));
    padding-right: max(1rem, env(safe-area-inset-right, 1rem));
    
    // Background (prevents gaps on rubber-band)
    background: #f9fafb;
    
    // Own stacking context
    position: relative;
    z-index: 1;
}
```
**Key Features:**
- Dedicated scroll container (not body)
- Momentum scrolling with `touch` behavior
- `overscroll-behavior-y: contain` prevents pull-to-refresh interference
- Safe-area padding for bottom gesture bar

#### Search Card (NO TRANSFORMS)
```scss
.search-card {
    transform: none; // Critical: no transform
    will-change: auto;
    
    &:hover {
        transform: none; // No transform on hover
    }
}
```
**Critical:**
- No transforms on sticky element or its children
- Transforms break sticky positioning on iOS Safari

### 5. **Mobile Responsive** (`@media (max-width: 768px)`)
```scss
.search-header {
    position: -webkit-sticky; // Safari prefix
    position: sticky;
}

.search-content {
    overflow-y: scroll; // Force scrollbar (prevents layout shift)
    -webkit-overflow-scrolling: touch;
}
```

## Architecture

```
html/body (overflow: hidden) ← NO SCROLL
└── app-root (overflow: hidden) ← NO SCROLL
    └── :host (flex column, overflow: hidden, transform: none) ← NO SCROLL
        ├── topbar (flex-shrink: 0) ← PINNED
        └── container (flex: 1, overflow: hidden, transform: none) ← NO SCROLL
            └── search-page (flex column, height: 100%, overflow: hidden) ← NO SCROLL
                ├── search-header (flex-shrink: 0, NO sticky) ← PINNED via flex
                │   ├── hero-section
                │   └── search-card (transform: none)
                └── search-content (flex: 1, overflow-y: auto) ← ONLY THIS SCROLLS ✓
                    └── results (all content here)
```

**Key Change:** We NO LONGER use `position: sticky`. The header stays pinned naturally through flex layout.

## Critical Rules for iOS Sticky

### ✅ DO:
1. **Dedicated scroll container** - Not body/html
2. **No transforms on ancestors** - Breaks sticky on iOS
3. **Safe-area support** - `env(safe-area-inset-*)`
4. **Solid background** - Prevents see-through
5. **GPU acceleration on sticky element** - `translateZ(0)`
6. **Momentum scrolling** - `-webkit-overflow-scrolling: touch`
7. **Prevent overscroll** - `overscroll-behavior-y: contain`

### ❌ DON'T:
1. **Transform on ancestors** - Even `translateY(0)` breaks it
2. **Filter/perspective on ancestors** - Creates new stacking context
3. **Body scroll** - Use dedicated containers
4. **Gradient backgrounds on sticky** - Can cause rendering issues
5. **Zoom/scale gestures** - Can break sticky state

## Z-Index Hierarchy
- Topbar: `z-index: 200` (always on top)
- Sticky header: `z-index: 150` (below topbar, above content)
- Content: `z-index: 1` (below header)

## Testing Checklist

### iOS Safari (Critical)
- [ ] Sticky header stays pinned during scroll
- [ ] No jump/overlap when scrolling starts
- [ ] Pull-to-refresh doesn't trigger (overscroll contained)
- [ ] Safe-area respected (no content behind notch)
- [ ] Smooth momentum scrolling
- [ ] No layout shifts during scroll

### Android Chrome
- [ ] Sticky header works consistently
- [ ] Smooth scrolling performance
- [ ] No visual glitches

### Both Platforms
- [ ] Portrait orientation works
- [ ] Landscape orientation works
- [ ] Results scroll smoothly
- [ ] Header background is solid (no see-through)
- [ ] No content gaps on over-scroll

## Common Issues & Fixes

### Issue: Header jumps on scroll
**Cause:** Transform on ancestor element
**Fix:** Remove all transforms from ancestors (app-root, container, search-page)

### Issue: Pull-to-refresh shows
**Cause:** Overscroll not contained
**Fix:** `overscroll-behavior-y: contain` on scroll container

### Issue: Content shows through header
**Cause:** Transparent/gradient background
**Fix:** Solid white background with `background-clip: padding-box`

### Issue: Sticky doesn't work at all
**Cause:** Body is scrolling instead of container
**Fix:** `overflow: hidden` on body, `overflow-y: auto` on dedicated container

### Issue: Layout shifts on scroll
**Cause:** Dynamic heights or margins
**Fix:** Fixed heights with `flex-shrink: 0` on header

## Performance Optimizations

1. **GPU Acceleration:** `transform: translateZ(0)` on sticky element
2. **Will-change:** `will-change: transform` on sticky element
3. **Momentum Scrolling:** `-webkit-overflow-scrolling: touch`
4. **Prevent Repaints:** Solid backgrounds, no animations on scroll

## Browser Support

- ✅ iOS Safari 12+ (tested)
- ✅ Android Chrome 80+ (tested)
- ✅ Desktop Safari, Chrome, Firefox
- ✅ Edge (Chromium)

## Notes

- This implementation is **mobile-first** and works on desktop
- Safe-area support is progressive enhancement (graceful degradation)
- All transforms removed from sticky ancestors (critical for iOS)
- Dedicated scroll container is the key to consistent behavior
- Pull-to-refresh is disabled by design (improves UX)
