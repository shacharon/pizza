# Restaurant Card 2025 Modern Refactor

## Overview
Refactored restaurant card to a modern 2025 layout with vertical structure and bottom action bar for improved mobile UX and visual scanning.

## Key Changes

### 1. Layout Transformation
**Before:** Horizontal layout (photo | info | actions stacked vertically on right)
**After:** Vertical layout with bottom action bar

```
┌─────────────────────────────────┐
│  [Photo]  Restaurant Name       │
│           ⭐ 4.5 (200)          │
│           📍 Address            │
├─────────────────────────────────┤
│  📍 Navigate  │  📞 Call        │
└─────────────────────────────────┘
```

### 2. Action Bar (Bottom Strip)
- **Position:** Full-width bottom strip inside card
- **Style:** Clean separator line, neutral background
- **Buttons:** Icon + label, flex-distributed
- **Icons:** Minimal linear SVG (not emojis)
- **Affordance:** Clear actionable buttons with hover states

**Benefits:**
- ✅ Better thumb reach on mobile
- ✅ Clearer visual hierarchy
- ✅ Doesn't compete with main content
- ✅ Feels modern (Google Maps / Apple Maps 2025)

### 3. Visual Modernization

#### Border & Shadow
- **Border radius:** `14px` (card), `10px` (photo) - soft, consistent
- **Shadow:** `0 1px 2px rgba(0,0,0,0.04)` - single-layer, very subtle
- **Hover:** `0 4px 12px rgba(0,0,0,0.08)` - gentle elevation
- **No heavy borders:** Clean, minimal aesthetic

#### Spacing
- **Card padding:** `1.25rem` (20px) - intentional breathing room
- **Photo → Info gap:** `1.125rem` (18px) - comfortable spacing
- **Action bar padding:** `0.875rem 1rem` - thumb-friendly tap targets
- **Removed dead space:** Eliminated unnecessary gaps

#### Colors
- **Brand accent:** `#3b82f6` (single blue for selected/focused states)
- **Primary text:** `#111827` (dark, clear hierarchy)
- **Secondary text:** `#6b7280` (neutral gray, not competing)
- **Border:** `#e5e7eb` (light gray, barely there)
- **Open status:** `#10b981` (green) - only semantic color

### 4. Typography Hierarchy

#### Search Input (Parent Component)
- **Font size:** `18px` - modern, readable standard

#### Card Title
- **Font size:** `1.125rem` (18px) desktop, `1rem` (16px) mobile
- **Font weight:** `600` (semibold) - clear but not oversized
- **Line clamp:** 2 lines max with ellipsis
- **Color:** `#111827` - dark, primary hierarchy

#### Meta Information
- **Rating:** `0.875rem` (14px), weight `500`
- **Address:** `0.875rem` (14px), gray `#6b7280`
- **Status:** `0.8125rem` (13px), colored semantic (green/gray)

#### Action Labels
- **Desktop:** `0.875rem` (14px)
- **Mobile:** `0.8125rem` (13px)
- **Weight:** `500` (medium) - clear but not heavy

### 5. Icon System
**Replaced:** Emoji icons (📍📞❤️)
**With:** Minimal linear SVG icons (Heroicons-style outline)

```html
<svg class="action-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
  <circle cx="12" cy="10" r="3"/>
</svg>
```

**Benefits:**
- ✅ Consistent visual language
- ✅ Scales properly on all screens
- ✅ Professional appearance
- ✅ Matches modern design systems

### 6. Responsive Behavior

#### Desktop (> 768px)
- Photo: `96×96px` - substantial but not dominating
- Action bar: Horizontal buttons with icon + label
- Spacing: Generous, comfortable scanning

#### Mobile (≤ 768px)
- Photo: `80×80px` - compact for thumb scrolling
- Action bar: Compact padding, smaller icons
- Font sizes: Slightly reduced for density

#### Compact Mode (Bottom Sheet)
- Photo: `72×72px` - minimal footprint
- Reduced padding throughout
- Action bar: Ultra-compact

### 7. Interaction Design

#### Card Content Area
- **Clickable:** Entire top area opens detail view
- **Cursor:** Pointer to indicate interactivity
- **Hover:** Subtle shadow lift

#### Action Bar
- **Click blocking:** `stopPropagation()` prevents card click
- **Hover states:** Background change + icon scale
- **Disabled state:** 40% opacity, no-cursor
- **Active state:** Pressed background feedback

### 8. Accessibility

#### Maintained
- ✅ All ARIA labels preserved
- ✅ Keyboard focus states (outline)
- ✅ Semantic HTML (article, h3, button)
- ✅ Alt text for images
- ✅ Disabled button states

#### Improved
- ✅ Larger tap targets in action bar (44px height minimum)
- ✅ Better visual hierarchy for screen readers
- ✅ Clear button labels (not just icons)

## What Was NOT Changed

### Backend & Data
- ✅ No changes to data structure
- ✅ No changes to analytics/tracking
- ✅ No changes to backend API

### Business Logic
- ✅ All actions preserved (Navigate, Call, Favorite)
- ✅ Action availability logic unchanged
- ✅ Photo loading security maintained

### Features
- ✅ Top result badge still shows
- ✅ Dietary hints still display
- ✅ Open/closed status preserved
- ✅ Rating display unchanged

## Design System Alignment

### Matches Modern Patterns
- ✅ Google Maps 2025 - Bottom action bar pattern
- ✅ Apple Maps - Clean card hierarchy
- ✅ Airbnb - Soft shadows, minimal borders
- ✅ Modern iOS/Android - Native feel with bottom sheets

### Avoids Anti-Patterns
- ❌ No heavy drop shadows (feels dated)
- ❌ No emoji overuse (unprofessional)
- ❌ No mixed visual languages (consistent icons)
- ❌ No unnecessary decoration (intentional whitespace)

## Performance Notes
- ✅ CSS-only changes (no JS overhead)
- ✅ Reduced DOM complexity (simpler structure)
- ✅ Better paint performance (fewer shadows)
- ✅ Hardware-accelerated transforms (hover lift)

## File Changes
1. `restaurant-card.component.html` - Restructured to vertical layout
2. `restaurant-card.component.scss` - Complete style rewrite
3. `restaurant-card.component.ts` - No changes needed ✅

## Migration Notes

### Breaking Changes
- None - purely visual refactor

### Visual Regression Testing
- ✅ Check hover states
- ✅ Verify disabled button states
- ✅ Test mobile responsiveness
- ✅ Verify compact mode
- ✅ Check RTL languages (if applicable)

## Result
A modern, scannable, mobile-friendly restaurant card that feels like **Google Maps / Apple Maps 2025**, not 2010. Clean visual hierarchy, intentional spacing, and thumb-friendly action placement.
