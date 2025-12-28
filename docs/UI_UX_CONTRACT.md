# UI/UX Contract — Chips, Modes, Actions (Single Control Surface)

**Owner:** Product / UX  
**Agent Mode:** REQUIRED  
**Priority:** HIGH  
**Applies to:** Food Search (Mobile + Desktop)  
**Last Updated:** Dec 28, 2025

---

## 1) Objective

Implement a clean, trusted search UX with:
- **ONE chips row** as the single source of truth for filtering/sorting/view
- **ONE results list** (ranked, best on top)
- **Assistant appears only in Recovery/Clarify/Low-confidence states**
- **Mobile-first presentation** (chips horizontal scroll; assistant bottom sheet)

---

## 2) Non-Negotiable Rules

### R1 — One Intent = One Surface
- Sorting/Filtering/View control must appear only in **ONE chips row**.
- No assistant banner with duplicate chips.
- No secondary result lists/columns ("Nearby vs Closest" lists forbidden).

### R2 — Chips Taxonomy Must Be Unambiguous
Each chip must be exactly one type:
- **FILTER:** Changes which results are included
- **SORT:** Changes ordering only
- **VIEW:** Changes presentation (list vs map)
- **RECOVERY:** Special-only chips shown in RECOVERY mode
- **CLARIFY:** Special-only chips shown in CLARIFY mode

A chip cannot be both FILTER and SORT.

---

## 3) Modes (Determined by backend response)

### NORMAL
- Results found + confidence >= 60%
- Show standard refinement chips (FILTER/SORT/VIEW)
- Assistant hidden

### RECOVERY
- No results OR tool error OR confidence < 60%
- Show Recovery chips
- Assistant appears (text + suggestions)
- Chips become "recovery-first" (expand/remove filters/try nearby)

### CLARIFY
- Ambiguous query; clarification required
- Show Clarification chips
- Assistant appears with clarifying text

---

## 4) Chips Inventory (Canonical)

### 4.1 FILTER Chips (toggle / multi-select unless noted)
| Chip ID | Emoji | Label | Behavior |
|---------|-------|-------|----------|
| `delivery` | 🚗 | Delivery | `filter.delivery=true` |
| `budget` | 💰 | Budget | `filter.priceLevelMax=2` |
| `opennow` | 🟢 | Open Now | `filter.openNow=true` |
| `takeout` | 🥡 | Takeout | `filter.takeout=true` |
| `romantic` | 💕 | Romantic | `filter.vibe=romantic` |
| `family` | 👨‍👩‍👧‍👦 | Family | `filter.vibe=family` |
| `dietary` | 🌱 | Dietary | `filter.dietary[]` (vegan/kosher/gluten-free) |

**Important:** "Top Rated ⭐" is NOT a filter. It's a SORT chip (see below).

---

### 4.2 SORT Chips (single-select; exactly one active)
| Chip ID | Emoji | Label | Behavior |
|---------|-------|-------|----------|
| `sort_best_match` | ✨ | Best match | `sort=BEST_MATCH` (default) |
| `sort_closest` | 📍 | Closest | `sort=CLOSEST` |
| `sort_rating` | ⭐ | Rating | `sort=RATING_DESC` |
| `sort_price` | 💰 | Price | `sort=PRICE_ASC` (cheapest first) |

**Context-Aware Visibility:** Show sort chips when:
- `results.length >= 5` (enough to benefit from sorting)
- `confidence >= 70%` (user knows what they want)
- Mode is NORMAL

---

### 4.3 VIEW Chips (single-select)
| Chip ID | Emoji | Label | Behavior |
|---------|-------|-------|----------|
| `list` | 📋 | List | `view=LIST` (default) |
| `map` | 🗺️ | Map | `view=MAP` |

---

### 4.4 RECOVERY Chips (only in RECOVERY mode)
| Chip ID | Emoji | Label | Behavior |
|---------|-------|-------|----------|
| `expand_radius` | 🔍 | Expand Search | `radius=10000` |
| `remove_filters` | 🔄 | Remove Filters | Clear all filters |
| `try_nearby` | 📍 | Try Nearby | Broaden location strategy |
| `sort_rating` | ⭐ | Rating | `sort=RATING_DESC` |
| `map` | 🗺️ | Map | `view=MAP` |
| `closednow` | 🔴 | Closed now | `filter.openNow=false` (ONLY when user searched "open" but got 0 results) |

---

### 4.5 CLARIFY Chips (only in CLARIFY mode)
| Chip ID | Emoji | Label | Behavior |
|---------|-------|-------|----------|
| City suggestions | 📍 | Tel Aviv / Jerusalem / Haifa | Set `location.city` |
| `sort_closest` | 📍 | Closest | `sort=CLOSEST` |
| `map` | 🗺️ | Map | `view=MAP` |

---

## 5) UI Placement & Duplication Prevention

### Single Chips Row Placement
- Always below the search bar (top of results area).
- In **NORMAL mode:** Show FILTER + SORT + VIEW in one row/grouped row.
- In **RECOVERY mode:** Show RECOVERY chips row (replaces standard chips).
- In **CLARIFY mode:** Show CLARIFY chips row (replaces standard chips).

**No other chips anywhere else in success state.**

---

## 6) Results List Contract

### 6.1 Single ranked list (default)
- Always show one list in LIST view.
- UI renders results as provided; no hidden secondary ordering.

### 6.2 Top Result Highlight
- When confidence is high (>= 70%) show reason label on result #1 only.
- Reason label is a single short line (no paragraphs).

**Example:**
- `Best match · Open now · 4.3★`
- `Closest open option`
- `Top rated nearby`

### 6.3 No duplicate "quick picks"
Quick picks are NOT a second list. They are 1-item highlights in assistant panel/sheet only.

---

## 7) Restaurant Card Quick Actions

Each card includes:
- **Get Directions** 📍 (always)
- **Call Restaurant** 📞 (disabled if no phone)
- **Save Favorite** ❤️ (always)

Optional actions (if implemented):
- Share
- View Menu
- View Details

### Action Levels
Actions must respect action levels:
- **Level 0:** Immediate (no confirmation) - GET_DIRECTIONS, CALL_RESTAURANT
- **Level 1:** Confirm first - SAVE_FAVORITE, SHARE
- **Level 2:** High-impact confirm + explicit user intent - DELETE_FAVORITE, REPORT_ISSUE

---

## 8) Mobile vs Desktop Presentation

### Mobile
- **Chips row:** Horizontal scroll
- **Assistant:** Bottom sheet (Recovery/Clarify only)
- **Results list:** Vertical scroll

### Desktop
- **Chips row:** Can wrap to multiple rows
- **Assistant:** Sticky right panel (Recovery/Clarify only; no chips duplication)
- **Results list:** Left column scrolls; right panel does not scroll independently

---

## 9) State Model (UI)

UI state must track:

```typescript
mode: "NORMAL" | "RECOVERY" | "CLARIFY";
view: "LIST" | "MAP";
sort: "BEST_MATCH" | "CLOSEST" | "RATING_DESC" | "PRICE_ASC";
filters: {
  openNow?: boolean;
  delivery?: boolean;
  takeout?: boolean;
  priceLevelMax?: number;
  dietary?: string[];
  vibe?: string[];
};
```

### State Management Rules
- **SORT:** Single-select (exactly one active)
- **FILTER:** Multi-select (can activate multiple)
- **VIEW:** Single-select (LIST or MAP)

---

## 10) Assistant Visibility Rules

Show assistant ONLY when:
1. **No results** (RECOVERY mode)
2. **Low confidence < 60%** (RECOVERY mode)
3. **Ambiguous query** (CLARIFY mode)
4. **Explicit RECOVERY mode**

Otherwise: **Hide assistant** (NORMAL mode = no assistant, chips only)

---

## 11) Implementation Checklist

- [ ] Chips row is the ONLY control surface
- [ ] Sort chips: Single-select behavior
- [ ] Filter chips: Multi-select behavior
- [ ] View chips: Single-select behavior
- [ ] Context-aware sort visibility (5+ results, 70%+ confidence)
- [ ] "Closed Now" chip ONLY in RECOVERY mode
- [ ] Action levels enforced (0=immediate, 1=confirm, 2=high-impact)
- [ ] Unavailable actions disabled (e.g., call without phone)
- [ ] Assistant visibility follows rules
- [ ] No duplicate control surfaces
- [ ] Mobile: Bottom sheet for assistant
- [ ] Desktop: Sticky right panel for assistant

---

## 12) Anti-Patterns (FORBIDDEN)

❌ Multiple chips rows  
❌ Assistant banner with duplicate chips  
❌ "Nearby vs Closest" competing result lists  
❌ Sort and filter in separate locations  
❌ Hidden secondary result ordering  
❌ Persistent assistant in NORMAL mode  
❌ Filter chips that are actually sort chips  
❌ Sort chips with multiple active at once

---

## 13) Key Principle

> **One intent = one surface.** Every user action has exactly ONE location in the UI.

---

**End of Contract**

