# Unified Search UI/UX Specification

**Version:** 1.0  
**Date:** 2025-12-20  
**Status:** Draft for Implementation

---

## Overview

This document specifies the visual design, interaction patterns, and accessibility requirements for the Unified Search page with Human-in-the-Loop action pattern.

**Design Principles:**
- Discovery-first: Results take priority
- Action-aware: Clear, safe, accessible actions
- Adaptive: Micro-assist when needed
- Multilingual: RTL and LTR support
- Mobile-first: Responsive from 320px up

---

## Page Layout

### Desktop (≥768px)

```
┌─────────────────────────────────────────────┐
│  Header: "Search for restaurants"          │
│  [Search Bar with icon]        [User Menu] │
├─────────────────────────────────────────────┤
│  ┌───────────────────────────────────────┐ │
│  │ Micro-Assist Card (if confidence<0.7) │ │
│  └───────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│  < Budget > < Top Rated > < Map > < ... >  │  ← Refinement Chips
├─────────────────────────────────────────────┤
│  Found 10 restaurants · Confidence: 85%    │  ← Meta info
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Restaurant│  │Restaurant│  │Restaurant│ │
│  │  Card 1  │  │  Card 2  │  │  Card 3  │ │
│  │  ⭐4.5   │  │  ⭐4.8   │  │  ⭐4.3   │ │
│  │[📍][📞]│  │[📍][📞]│  │[📍][📞]│ │  ← Action buttons
│  └──────────┘  └──────────┘  └──────────┘ │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │Restaurant│  │Restaurant│  │Restaurant│ │
│  │  Card 4  │  │  Card 5  │  │  Card 6  │ │
│  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────┘
```

### Mobile (<768px)

```
┌──────────────────────────┐
│  Header + Search         │
├──────────────────────────┤
│  ┌────────────────────┐ │
│  │  Micro-Assist Card │ │
│  └────────────────────┘ │
├──────────────────────────┤
│  < Budget > < Rated >   │  ← Horizontal scroll
├──────────────────────────┤
│  ┌────────────────────┐ │
│  │   Restaurant Card  │ │
│  │   ⭐ 4.5          │ │
│  │   [📍] [📞] [❤️] │ │
│  └────────────────────┘ │
│  ┌────────────────────┐ │
│  │   Restaurant Card  │ │
│  └────────────────────┘ │
│  ┌────────────────────┐ │
│  │   Restaurant Card  │ │
│  └────────────────────┘ │
└──────────────────────────┘
```

---

## Component Specifications

### 1. Search Bar Component

#### Visual Design

**Desktop:**
- Width: 100% (max 800px centered)
- Height: 56px
- Border-radius: 28px
- Background: White
- Box-shadow: 0 2px 8px rgba(0,0,0,0.1)

**Mobile:**
- Width: 100% - 32px margin
- Height: 48px
- Border-radius: 24px

#### States

| State | Visual |
|-------|--------|
| Default | Gray border, placeholder text gray-500 |
| Focus | Blue border (2px), placeholder fades |
| Loading | Search icon → spinner animation |
| Disabled | Gray background, cursor not-allowed |
| Error | Red border, error icon right side |

#### Content

- Placeholder: "Search for restaurants..." (localized)
- Icon: 🔍 (left side, 24px)
- Clear button: ✕ (right side, appears when text entered)
- Loading spinner: (replaces search icon)

#### Accessibility

```html
<div role="search">
  <input 
    type="search"
    aria-label="Search for restaurants"
    aria-describedby="search-hint"
    placeholder="Search for restaurants..."
  />
  <span id="search-hint" class="sr-only">
    Type a food or location, then press Enter
  </span>
</div>
```

---

### 2. Micro-Assist Card Component

#### When to Show

- Confidence < 0.7 (70%)
- Not dismissed by user in current session
- Has suggested actions to display

#### Visual Design

**Desktop:**
- Width: 100%
- Padding: 24px
- Border-radius: 12px
- Background: Linear gradient (blue-50 → purple-50)
- Border: 1px solid blue-200

**Mobile:**
- Padding: 16px
- Border-radius: 8px

#### Layout

```
┌──────────────────────────────────────────────┐
│  💡 We're not 100% sure about your search... │  ← Title
│                                               │
│  Did you mean:                                │  ← Subtitle
│  [🍕 Pizza in Paris]  [🍝 Pasta in Paris]   │  ← Action buttons
│                                               │
│  [Dismiss ✕]                                 │  ← Dismiss link
└──────────────────────────────────────────────┘
```

#### Action Buttons

- Style: Outlined buttons
- Border: 1px solid gray-300
- Background: White on hover
- Padding: 8px 16px
- Border-radius: 20px
- Font-size: 14px

#### Accessibility

```html
<aside 
  role="complementary" 
  aria-label="Search assistance"
  aria-live="polite"
>
  <h3>We're not 100% sure about your search...</h3>
  <p>Did you mean:</p>
  <div role="group" aria-label="Suggested searches">
    <button aria-label="Search for pizza in Paris">
      🍕 Pizza in Paris
    </button>
    <!-- ... -->
  </div>
  <button aria-label="Dismiss assistance">Dismiss</button>
</aside>
```

---

### 3. Restaurant Card Component

#### Visual Design

**Desktop (Grid: 3 columns):**
- Width: calc(33.33% - 16px)
- Aspect ratio: 4:3
- Border-radius: 12px
- Box-shadow: 0 2px 12px rgba(0,0,0,0.08)
- Hover: Transform scale(1.02), shadow increase

**Mobile (Single column):**
- Width: 100%
- Min-height: 120px
- Border-radius: 8px

#### Layout

```
┌─────────────────────────────────┐
│  ┌───────────────────────────┐ │
│  │     Photo (16:9)          │ │  ← Restaurant photo
│  └───────────────────────────┘ │
│  Restaurant Name               │  ← Bold, 18px
│  ⭐ 4.5 (123) · $$ · 0.8km   │  ← Meta info
│  Italian · Pizza · Pasta      │  ← Tags
│  ┌──────┐ ┌──────┐ ┌──────┐  │
│  │ 📍  │ │ 📞  │ │ ❤️  │  │  ← Quick actions (L0/L1)
│  └──────┘ └──────┘ └──────┘  │
└─────────────────────────────────┘
```

#### Quick Action Buttons

**Visual:**
- Size: 40px × 40px
- Border-radius: 8px
- Background: White
- Border: 1px solid gray-200
- Icon: 24px, centered
- Spacing: 8px gap

**States:**

| State | Visual |
|-------|--------|
| Default | Gray-200 border, gray-600 icon |
| Hover | Blue-100 background, blue-600 icon |
| Active | Blue-200 background |
| Disabled | Gray-100 background, gray-400 icon, cursor not-allowed |
| Loading | Spinner inside button |

**Action Types:**

| Icon | Label | Level | Action |
|------|-------|-------|--------|
| 📍 | Directions | L0 | Opens Google Maps |
| 📞 | Call | L0 | Opens phone dialer |
| ❤️ | Save | L1 | Saves to favorites (shows toast) |
| 🔗 | Share | L0 | Opens share dialog |
| 📋 | Menu | L0 | Opens restaurant website |

#### Tooltips

Show on hover (desktop) or long-press (mobile):
- "Get directions"
- "Call restaurant"
- "Save to favorites (local)"
- "Share restaurant"
- "View menu"

#### Accessibility

```html
<article 
  role="article" 
  aria-label="Pizza Place, rated 4.5 stars"
  tabindex="0"
>
  <img src="..." alt="Interior of Pizza Place" />
  <h3>Pizza Place</h3>
  <div aria-label="Rating and details">
    <span aria-label="4.5 out of 5 stars">⭐ 4.5</span>
    <span aria-label="123 reviews">(123)</span>
    <span aria-label="Price level: Moderate">$$</span>
    <span aria-label="Distance: 0.8 kilometers">0.8km</span>
  </div>
  <div role="group" aria-label="Quick actions">
    <button 
      aria-label="Get directions to Pizza Place"
      title="Get directions"
    >
      📍
    </button>
    <button 
      aria-label="Call Pizza Place"
      title="Call restaurant"
    >
      📞
    </button>
    <button 
      aria-label="Save Pizza Place to favorites"
      title="Save to favorites (local)"
    >
      ❤️
    </button>
  </div>
</article>
```

---

### 4. Refinement Chips Component

#### Visual Design

**Container:**
- Horizontal scroll (overflow-x: auto)
- Hide scrollbar (custom CSS)
- Padding: 12px 0
- Gap: 8px between chips

**Chip:**
- Height: 36px
- Padding: 8px 16px
- Border-radius: 18px
- Border: 1px solid gray-300
- Background: White
- Font-size: 14px
- Emoji + Text

**States:**

| State | Visual |
|-------|--------|
| Default | Gray-300 border, black text |
| Hover | Gray-400 border, blue text |
| Active | Blue-600 background, white text |
| Disabled | Gray-200 border, gray-400 text |

#### Chip Types

| Emoji | Label | Filter |
|-------|-------|--------|
| 💰 | Budget | price<=2 |
| ⭐ | Top Rated | rating>=4.5 |
| 🗺️ | Map | (opens map view) |
| 📍 | Closest | sort by distance |
| 🕒 | Open Now | opennow=true |
| 🌱 | Vegetarian | dietary=vegetarian |

#### Accessibility

```html
<nav aria-label="Search refinements">
  <ul role="list">
    <li>
      <button 
        aria-label="Filter by budget options"
        aria-pressed="false"
      >
        💰 Budget
      </button>
    </li>
    <!-- ... -->
  </ul>
</nav>
```

---

### 5. Restaurant Details Panel (Optional)

#### Trigger

- User clicks restaurant card (not action button)
- Or: User taps "View Details" action

#### Visual Design

**Desktop:**
- Position: Fixed right side
- Width: 400px
- Height: 100vh
- Background: White
- Box-shadow: -4px 0 16px rgba(0,0,0,0.1)
- Animation: Slide in from right (300ms)

**Mobile:**
- Position: Fixed bottom
- Width: 100vw
- Height: 80vh
- Border-radius: 16px 16px 0 0
- Animation: Slide up from bottom (300ms)

#### Layout

```
┌────────────────────────────────┐
│  [Close ✕]                     │  ← Header
│  Restaurant Name               │
│  ⭐⭐⭐⭐⭐ 4.5 (123)         │
├────────────────────────────────┤
│  ┌──────────┐ ┌──────────┐   │
│  │  Photo 1 │ │  Photo 2 │   │  ← Photo gallery
│  └──────────┘ └──────────┘   │
├────────────────────────────────┤
│  📍 Address                    │
│  📞 Phone: +1234567890         │
│  🌐 Website: example.com       │
│  🕒 Open now · Closes at 10pm  │
├────────────────────────────────┤
│  About                         │
│  Italian restaurant serving... │
├────────────────────────────────┤
│  Detailed Actions:             │  ← L0/L1 actions
│  [Get Directions]              │
│  [Call Restaurant]             │
│  [View Menu]                   │
│  [Save to Favorites]           │
│  [Share]                       │
└────────────────────────────────┘
```

#### Detailed Action Buttons

**Visual:**
- Width: 100%
- Height: 48px
- Border-radius: 8px
- Margin: 8px 0
- Font-size: 16px

**Primary (L0):**
- Background: Blue-600
- Color: White
- Bold

**Secondary (L1):**
- Background: White
- Border: 1px solid blue-600
- Color: Blue-600

#### Accessibility

```html
<aside 
  role="dialog" 
  aria-labelledby="details-title"
  aria-modal="true"
>
  <header>
    <button aria-label="Close details">✕</button>
    <h2 id="details-title">Pizza Place</h2>
  </header>
  <!-- ... content ... -->
  <nav aria-label="Restaurant actions">
    <button>Get Directions</button>
    <button>Call Restaurant</button>
    <!-- ... -->
  </nav>
</aside>
```

---

## Color Palette

### Light Mode (Default)

```scss
// Brand colors
$primary: #3b82f6;      // Blue-500
$primary-hover: #2563eb; // Blue-600
$primary-light: #dbeafe; // Blue-100

// Semantic colors
$success: #10b981;      // Green-500
$warning: #f59e0b;      // Amber-500
$error: #ef4444;        // Red-500
$info: #3b82f6;         // Blue-500

// Neutral colors
$gray-50: #f9fafb;
$gray-100: #f3f4f6;
$gray-200: #e5e7eb;
$gray-300: #d1d5db;
$gray-400: #9ca3af;
$gray-500: #6b7280;
$gray-600: #4b5563;
$gray-900: #111827;

// Background
$bg-primary: #ffffff;
$bg-secondary: #f9fafb;
$bg-tertiary: #f3f4f6;

// Text
$text-primary: #111827;
$text-secondary: #6b7280;
$text-tertiary: #9ca3af;
```

### Dark Mode (Future)

```scss
// Placeholder for dark mode support
// Will be added in Phase 2
```

---

## Typography

### Font Family

```scss
$font-primary: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
$font-mono: 'JetBrains Mono', 'Courier New', monospace;
```

### Font Sizes

```scss
$text-xs: 0.75rem;    // 12px
$text-sm: 0.875rem;   // 14px
$text-base: 1rem;     // 16px
$text-lg: 1.125rem;   // 18px
$text-xl: 1.25rem;    // 20px
$text-2xl: 1.5rem;    // 24px
$text-3xl: 1.875rem;  // 30px
```

### Font Weights

```scss
$font-normal: 400;
$font-medium: 500;
$font-semibold: 600;
$font-bold: 700;
```

---

## Spacing Scale

```scss
$spacing-0: 0;
$spacing-1: 0.25rem;  // 4px
$spacing-2: 0.5rem;   // 8px
$spacing-3: 0.75rem;  // 12px
$spacing-4: 1rem;     // 16px
$spacing-5: 1.25rem;  // 20px
$spacing-6: 1.5rem;   // 24px
$spacing-8: 2rem;     // 32px
$spacing-10: 2.5rem;  // 40px
$spacing-12: 3rem;    // 48px
```

---

## Responsive Breakpoints

```scss
$breakpoint-xs: 320px;  // Small phones
$breakpoint-sm: 640px;  // Large phones
$breakpoint-md: 768px;  // Tablets
$breakpoint-lg: 1024px; // Laptops
$breakpoint-xl: 1280px; // Desktops
```

### Grid Layout

**Desktop (≥768px):** 3 columns
```scss
.restaurant-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}
```

**Tablet (≥640px, <768px):** 2 columns
```scss
@media (max-width: 767px) and (min-width: 640px) {
  .restaurant-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
```

**Mobile (<640px):** 1 column
```scss
@media (max-width: 639px) {
  .restaurant-grid {
    grid-template-columns: 1fr;
  }
}
```

---

## Animations

### Transitions

```scss
$transition-fast: 150ms ease;
$transition-base: 200ms ease;
$transition-slow: 300ms ease;
```

### Common Animations

**Fade In:**
```scss
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
```

**Slide Up:**
```scss
@keyframes slideUp {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}
```

**Slide Right:**
```scss
@keyframes slideRight {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}
```

**Scale Hover:**
```scss
.restaurant-card:hover {
  transform: scale(1.02);
  transition: transform $transition-base;
}
```

---

## Loading States

### Search Bar Loading

- Search icon → spinner (rotating 360deg, 1s infinite)

### Results Loading

**Skeleton Cards:**
```
┌─────────────────────┐
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │  ← Gray animated gradient
│  ▓▓▓▓▓▓▓▓          │  ← Shimmer effect
│  ▓▓▓▓              │
│  ▓▓▓▓ ▓▓▓▓ ▓▓▓▓   │
└─────────────────────┘
```

**Shimmer animation:**
```scss
@keyframes shimmer {
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
}
```

---

## Error States

### Search Error

```
┌──────────────────────────────────┐
│  ❌ Oops! Something went wrong   │
│                                   │
│  We couldn't complete your search.│
│  Please try again.                │
│                                   │
│  [Retry Search]                  │
└──────────────────────────────────┘
```

### No Results

```
┌──────────────────────────────────┐
│  🔍 No restaurants found          │
│                                   │
│  Try:                             │
│  • Broader location               │
│  • Different food type            │
│  • Removing filters               │
│                                   │
│  [Clear Search]                  │
└──────────────────────────────────┘
```

---

## Accessibility Requirements

### WCAG 2.1 Level AA

**Color Contrast:**
- Text: Minimum 4.5:1 ratio
- Large text (18px+): Minimum 3:1 ratio
- UI components: Minimum 3:1 ratio

**Keyboard Navigation:**
- All interactive elements tabbable
- Focus indicator visible (2px blue outline)
- Logical tab order
- Escape key closes modals

**Screen Readers:**
- Semantic HTML (header, nav, main, article)
- ARIA labels for all actions
- ARIA live regions for dynamic content
- Alt text for all images

**Touch Targets:**
- Minimum 44x44px for buttons
- Minimum 48x48px recommended
- Adequate spacing (8px minimum)

---

## RTL (Right-to-Left) Support

### Languages

- Hebrew (he)
- Arabic (ar)

### Layout Changes

```scss
[dir="rtl"] {
  .search-icon { left: auto; right: 16px; }
  .clear-button { right: auto; left: 16px; }
  .restaurant-card { text-align: right; }
  .action-buttons { flex-direction: row-reverse; }
  .refinement-chips { direction: rtl; }
}
```

### Text Alignment

- Default (LTR): text-align: left
- RTL: text-align: right
- Numbers: Always LTR (e.g., "4.5⭐")

---

## Performance Targets

| Metric | Target |
|--------|--------|
| First Contentful Paint | <1.5s |
| Time to Interactive | <3.0s |
| Largest Contentful Paint | <2.5s |
| Cumulative Layout Shift | <0.1 |
| Image load time | <2s |

### Optimizations

- Lazy load images (intersection observer)
- Virtual scrolling for >50 results
- Debounce search input (300ms)
- Cache restaurant images
- Preload critical CSS

---

## Browser Support

| Browser | Version |
|---------|---------|
| Chrome | Last 2 versions |
| Firefox | Last 2 versions |
| Safari | Last 2 versions |
| Edge | Last 2 versions |
| Mobile Safari | iOS 14+ |
| Chrome Android | Last 2 versions |

---

## Next Steps

1. Review this spec with design team
2. Create Figma mockups (if needed)
3. Validate accessibility with a11y expert
4. Start component implementation (Phase 4)

---

**Status:** ✅ Ready for implementation  
**Approved by:** Pending review











