# Phase B: Frontend Implementation Plan

**Status:** 🟡 In Progress  
**Started:** 2025-12-21  
**Target:** Complete by EOD 2025-12-21

---

## Overview

Implement frontend components to consume the new street grouping API from Phase A. The frontend will display results in "Exact" and "Nearby" groups for street-specific queries.

---

## Architecture

### Component Structure
```
SearchPageComponent
├── SearchBarComponent (with input state)
├── GroupedResultsComponent
│   ├── ResultGroupSection (Exact)
│   │   └── RestaurantCard[]
│   └── ResultGroupSection (Nearby)
│       └── RestaurantCard[]
└── (existing components)
```

### Services Layer
```
SearchFacade
├── UnifiedSearchService (API client)
├── SearchStore (state + groups)
├── InputStateMachine (search bar behavior)
└── RecentSearchesService (persistence)
```

---

## Implementation Tasks

### Task 1: InputStateMachine ⏳
**File:** `llm-angular/src/app/services/input-state-machine.service.ts`

**Purpose:** Manage search bar state transitions

**States:**
- `EMPTY` - No input, show recent searches
- `TYPING` - User typing, show suggestions
- `SEARCHING` - API call in progress
- `RESULTS` - Results displayed
- `EDITING` - User editing existing query

**Events:**
- `input(text)` - User types
- `clear()` - Clear button clicked
- `submit()` - Search submitted
- `selectRecent(query)` - Recent search clicked
- `selectChip(chip)` - Refinement chip clicked

**Implementation:**
```typescript
export class InputStateMachine {
  private state = signal<InputState>('EMPTY');
  private query = signal<string>('');
  
  // Computed
  showRecentSearches = computed(() => 
    this.state() === 'EMPTY' && this.query().length === 0
  );
  
  showClearButton = computed(() => this.query().length > 0);
  
  // Methods
  input(text: string): void;
  clear(): void;
  submit(): void;
  selectRecent(query: string): void;
}
```

---

### Task 2: RecentSearchesService ⏳
**File:** `llm-angular/src/app/services/recent-searches.service.ts`

**Purpose:** Persist recent searches in sessionStorage

**Features:**
- Store last 5 searches
- Deduplicate (same query moves to top)
- sessionStorage for session persistence
- Clear all functionality

**API:**
```typescript
export class RecentSearchesService {
  private searches = signal<string[]>([]);
  
  add(query: string): void;
  clear(): void;
  getAll(): string[];
}
```

**Storage Format:**
```json
{
  "recent_searches": ["איטלקית ברחוב אלנבי", "pizza in tel aviv", ...]
}
```

---

### Task 3: GroupedResultsComponent ⏳
**File:** `llm-angular/src/app/features/unified-search/components/grouped-results/`

**Purpose:** Display results in groups (Exact vs Nearby)

**Component Structure:**
```typescript
@Component({
  selector: 'app-grouped-results',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RestaurantCardComponent, CommonModule],
})
export class GroupedResultsComponent {
  @Input() groups: ResultGroup[] = [];
  @Input() loading = false;
  @Output() restaurantClick = new EventEmitter<RestaurantResult>();
  @Output() actionClick = new EventEmitter<ActionClickEvent>();
}
```

**Template Structure:**
```html
<div class="grouped-results">
  @if (loading) {
    <app-loading-spinner />
  }
  
  @for (group of groups; track group.kind) {
    <section class="result-group" [attr.data-kind]="group.kind">
      <header class="group-header">
        <h3 class="group-label">{{ group.label }}</h3>
        @if (group.distanceLabel) {
          <span class="distance-label">{{ group.distanceLabel }}</span>
        }
        <span class="count-badge">{{ group.results.length }}</span>
      </header>
      
      <div class="results-list">
        @for (result of group.results; track result.id) {
          <app-restaurant-card
            [restaurant]="result"
            (click)="restaurantClick.emit(result)"
            (actionClick)="actionClick.emit($event)"
          />
        }
      </div>
    </section>
  }
  
  @if (!loading && groups.length === 0) {
    <div class="empty-state">
      <p>No results found</p>
    </div>
  }
</div>
```

**Styling:**
- Exact group: Highlighted with accent color
- Nearby group: Subtle gray background
- Responsive: Stack on mobile, side-by-side on desktop (if needed)

---

### Task 4: SearchStore Updates ⏳
**File:** `llm-angular/src/app/state/search.store.ts`

**Changes:**
1. Add `groups` signal
2. Add computed for `hasGroups`
3. Add computed for `exactResults` and `nearbyResults`
4. Update `setResults` to handle groups

**New Computed Signals:**
```typescript
export class SearchStore {
  // Existing
  private resultsSignal = signal<RestaurantResult[]>([]);
  
  // NEW: Groups support
  private groupsSignal = signal<ResultGroup[] | undefined>(undefined);
  
  // Computed
  groups = computed(() => this.groupsSignal());
  hasGroups = computed(() => {
    const groups = this.groupsSignal();
    return groups !== undefined && groups.length > 0;
  });
  exactResults = computed(() => 
    this.groupsSignal()?.find(g => g.kind === 'EXACT')?.results || []
  );
  nearbyResults = computed(() => 
    this.groupsSignal()?.find(g => g.kind === 'NEARBY')?.results || []
  );
  
  // Updated method
  setSearchResponse(response: SearchResponse): void {
    this.resultsSignal.set(response.results);
    this.groupsSignal.set(response.groups); // NEW
    this.chipsSignal.set(response.chips);
    this.metaSignal.set(response.meta);
  }
}
```

---

### Task 5: SearchFacade Updates ⏳
**File:** `llm-angular/src/app/facades/search.facade.ts`

**Changes:**
1. Inject `InputStateMachine` and `RecentSearchesService`
2. Add input state methods
3. Add recent searches methods
4. Expose groups from store

**New API:**
```typescript
export class SearchFacade {
  // Existing
  results = this.searchStore.results;
  loading = this.searchStore.loading;
  
  // NEW: Groups
  groups = this.searchStore.groups;
  hasGroups = this.searchStore.hasGroups;
  exactResults = this.searchStore.exactResults;
  nearbyResults = this.searchStore.nearbyResults;
  
  // NEW: Input state
  inputState = this.inputStateMachine.state;
  showRecentSearches = this.inputStateMachine.showRecentSearches;
  showClearButton = this.inputStateMachine.showClearButton;
  
  // NEW: Recent searches
  recentSearches = this.recentSearchesService.searches;
  
  constructor(
    private searchStore: SearchStore,
    private unifiedSearchService: UnifiedSearchService,
    private inputStateMachine: InputStateMachine,
    private recentSearchesService: RecentSearchesService
  ) {}
  
  // NEW: Input methods
  onInput(text: string): void {
    this.inputStateMachine.input(text);
  }
  
  onClear(): void {
    this.inputStateMachine.clear();
    this.searchStore.clearResults();
  }
  
  onSelectRecent(query: string): void {
    this.inputStateMachine.selectRecent(query);
    this.search(query);
  }
  
  // Modified: Add to recent searches
  search(query: string, options?: SearchOptions): void {
    this.recentSearchesService.add(query);
    this.inputStateMachine.submit();
    // ... existing search logic
  }
}
```

---

### Task 6: SearchPageComponent Updates ⏳
**File:** `llm-angular/src/app/features/unified-search/search-page/search-page.component.ts`

**Changes:**
1. Use `GroupedResultsComponent` instead of flat list
2. Wire input state to search bar
3. Show recent searches when input empty
4. Handle group-specific interactions

**Template:**
```html
<div class="search-page">
  <header class="search-header">
    <app-search-bar
      [query]="facade.currentQuery()"
      [loading]="facade.loading()"
      [showClearButton]="facade.showClearButton()"
      (search)="facade.search($event)"
      (inputChange)="facade.onInput($event)"
      (clear)="facade.onClear()"
    />
  </header>
  
  <!-- Recent Searches -->
  @if (facade.showRecentSearches()) {
    <aside class="recent-searches">
      <h3>Recent Searches</h3>
      <ul>
        @for (query of facade.recentSearches(); track query) {
          <li (click)="facade.onSelectRecent(query)">{{ query }}</li>
        }
      </ul>
    </aside>
  }
  
  <!-- Grouped Results (NEW) -->
  @if (facade.hasGroups()) {
    <app-grouped-results
      [groups]="facade.groups()!"
      [loading]="facade.loading()"
      (restaurantClick)="onRestaurantClick($event)"
      (actionClick)="onActionClick($event)"
    />
  } @else if (facade.hasResults()) {
    <!-- Fallback: Flat list for backward compatibility -->
    <div class="results-list">
      @for (result of facade.results(); track result.id) {
        <app-restaurant-card [restaurant]="result" />
      }
    </div>
  }
  
  <!-- Refinement Chips -->
  @if (facade.hasChips()) {
    <app-refinement-chips [chips]="facade.chips()" />
  }
</div>
```

---

### Task 7: SearchBarComponent Updates ⏳
**File:** `llm-angular/src/app/features/unified-search/components/search-bar/search-bar.component.ts`

**Changes:**
1. Add `@Input() showClearButton: boolean`
2. Add `@Output() inputChange = new EventEmitter<string>()`
3. Add `@Output() clear = new EventEmitter<void>()`

**Template:**
```html
<div class="search-bar">
  <input
    type="text"
    [value]="query"
    (input)="onInput($event)"
    (keydown.enter)="onSubmit()"
    placeholder="Search for food..."
  />
  
  @if (showClearButton) {
    <button class="clear-btn" (click)="clear.emit()" type="button">
      <span aria-hidden="true">×</span>
    </button>
  }
  
  <button class="search-btn" (click)="onSubmit()" [disabled]="loading">
    @if (loading) {
      <span class="spinner"></span>
    } @else {
      <span>🔍</span>
    }
  </button>
</div>
```

**Component:**
```typescript
@Component({
  selector: 'app-search-bar',
  // ...
})
export class SearchBarComponent {
  @Input() query = '';
  @Input() loading = false;
  @Input() showClearButton = false; // NEW
  
  @Output() search = new EventEmitter<string>();
  @Output() inputChange = new EventEmitter<string>(); // NEW
  @Output() clear = new EventEmitter<void>(); // NEW
  
  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.inputChange.emit(value); // NEW: Emit on every keystroke
  }
  
  onSubmit(): void {
    if (this.query.trim()) {
      this.search.emit(this.query);
    }
  }
}
```

---

### Task 8: Frontend Tests ⏳
**Files:**
- `llm-angular/src/app/services/input-state-machine.service.spec.ts`
- `llm-angular/src/app/services/recent-searches.service.spec.ts`
- `llm-angular/src/app/features/unified-search/components/grouped-results/grouped-results.component.spec.ts`

**Test Coverage:**

**InputStateMachine:**
- State transitions (EMPTY → TYPING → SEARCHING → RESULTS)
- Clear button visibility
- Recent searches visibility
- Query persistence

**RecentSearchesService:**
- Add search
- Deduplication
- Max 5 searches
- Clear all
- sessionStorage persistence

**GroupedResultsComponent:**
- Renders groups correctly
- Shows exact count badges
- Shows distance labels
- Emits click events
- Shows empty state

---

## UI/UX Specifications

### Grouped Results Layout

**Desktop (>768px):**
```
┌─────────────────────────────────────┐
│ [Exact Results - 5]                 │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │ 🍕  │ │ 🍕  │ │ 🍕  │ │ 🍕  │    │
│ └─────┘ └─────┘ └─────┘ └─────┘    │
├─────────────────────────────────────┤
│ [Nearby - 3] 5 דקות הליכה            │
│ ┌─────┐ ┌─────┐ ┌─────┐             │
│ │ 🍕  │ │ 🍕  │ │ 🍕  │             │
│ └─────┘ └─────┘ └─────┘             │
└─────────────────────────────────────┘
```

**Mobile (<768px):**
```
┌───────────────────┐
│ [Exact - 5]       │
│ ┌───────────────┐ │
│ │ 🍕 Restaurant │ │
│ └───────────────┘ │
│ ┌───────────────┐ │
│ │ 🍕 Restaurant │ │
│ └───────────────┘ │
├───────────────────┤
│ [Nearby - 3]      │
│ 5 דקות הליכה      │
│ ┌───────────────┐ │
│ │ 🍕 Restaurant │ │
│ └───────────────┘ │
└───────────────────┘
```

### Color Scheme

**Exact Group:**
- Header: Primary color (#3B82F6)
- Background: Light blue (#EFF6FF)
- Border: Blue (#BFDBFE)

**Nearby Group:**
- Header: Gray (#6B7280)
- Background: Light gray (#F9FAFB)
- Border: Gray (#E5E7EB)

---

## Success Criteria

Phase B complete when:

- [ ] InputStateMachine implemented and tested
- [ ] RecentSearchesService implemented and tested
- [ ] GroupedResultsComponent renders groups correctly
- [ ] SearchStore exposes groups computed signals
- [ ] SearchFacade integrates input state and recent searches
- [ ] SearchPageComponent uses GroupedResultsComponent
- [ ] SearchBarComponent emits input changes
- [ ] All frontend tests passing
- [ ] Responsive design works on mobile and desktop
- [ ] Accessibility: keyboard navigation, ARIA labels

---

## Timeline

| Task | Estimated | Status |
|------|-----------|--------|
| 1. InputStateMachine | 30 min | ⏳ Pending |
| 2. RecentSearchesService | 20 min | ⏳ Pending |
| 3. GroupedResultsComponent | 45 min | ⏳ Pending |
| 4. SearchStore Updates | 15 min | ⏳ Pending |
| 5. SearchFacade Updates | 20 min | ⏳ Pending |
| 6. SearchPageComponent Updates | 30 min | ⏳ Pending |
| 7. SearchBarComponent Updates | 15 min | ⏳ Pending |
| 8. Frontend Tests | 45 min | ⏳ Pending |
| **Total** | **~3 hours** | ⏳ In Progress |

---

**Ready to start implementation!** 🚀

