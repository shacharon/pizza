# i18n Migration Checklist

This document tracks the migration of hardcoded UI strings to the i18n system.

## Status: 🟡 In Progress

## Core Infrastructure ✅

- [x] Create `ui-strings.i18n.ts` with all 8 languages
- [x] Create `cuisine-labels.i18n.ts` with all 8 languages
- [x] Create `card-signal-labels.i18n.ts` with all 8 languages
- [x] Extend `search-narration.i18n.ts` to add Italian & Japanese
- [x] Create `I18nService` for centralized i18n access
- [x] Create `generate-i18n-json.ts` script for JSON export
- [x] Create comprehensive documentation (`I18N_README.md`)

## Components to Migrate

### High Priority

#### Restaurant Card Component

- [x] Add `I18nService` injection
- [x] Update `getOpenStatusLabel()` to use i18n
- [x] Update `getOpenStatusText()` to use i18n
- [x] Update `glutenFreeBadge` computed to use i18n
- [x] Update `getGlutenFreeTooltip()` to use i18n
- [x] Update `getCuisineTag()` to use i18n
- [x] Update location fallback to use i18n
- [ ] Update template aria-labels
- [ ] Update template button tooltips

#### Search Bar Component

- [ ] Add `I18nService` injection
- [ ] Replace hardcoded `aria-label="Search for restaurants"`
- [ ] Replace hardcoded `aria-label="Loading"`
- [ ] Replace hardcoded `aria-label="Clear search"`
- [ ] Replace placeholder text

#### Reason Label Component

- [ ] Add `I18nService` injection
- [ ] Replace hardcoded `'Best match'`
- [ ] Replace hardcoded `'Open now'`
- [ ] Replace hardcoded `'Closest option'`

#### Assistant Components

##### Assistant Desktop Panel

- [ ] Replace hardcoded `'Quick Picks'`
- [ ] Replace hardcoded `'Refine'`

##### Assistant Bottom Sheet

- [ ] Replace hardcoded `'Quick Picks'` default title

##### Assistant Panel

- [ ] Replace hardcoded `aria-label="Clear messages"`

##### Assistant Strip

- [ ] Replace hardcoded `'Primary action: ' + primaryChip!.label`
- [ ] Replace hardcoded `'Action: ' + chip.label`

##### Assistant Line

- [ ] Replace hardcoded `aria-label="Clear"`

### Medium Priority

#### Action Executors

##### Navigation Executor

- [ ] Replace `'Opened Google Maps'`
- [ ] Replace `'Failed to open maps'`
- [ ] Replace `'Opened phone dialer'`
- [ ] Replace `'No phone number'`
- [ ] Replace `'Phone number not available'`
- [ ] Replace `'Failed to open dialer'`
- [ ] Replace `'Opened website'`
- [ ] Replace `'Opened search results'`
- [ ] Replace `'Failed to open website'`

##### Social Executor

- [ ] Replace `'Check out ${restaurant.name} at ${restaurant.address}'`
- [ ] Replace `'Shared successfully'`
- [ ] Replace `'Copied to clipboard'`
- [ ] Replace `'Failed to share'`
- [ ] Replace `'Saved to favorites'`
- [ ] Replace `'Failed to save favorite'`

### Low Priority

#### Search Page Component

- [ ] Update `'Open Now Priority'` (line 847 - debug mapping)

#### Index HTML

- [ ] Consider i18n for `<title>LlmAngular</title>`

## Templates to Update

### Restaurant Card Template

File: `restaurant-card.component.html`

- [ ] Line 3: `'View details for ' + restaurant().name`
- [ ] Line 11: `restaurant().name + ' restaurant photo'`
- [ ] Line 14: `'Placeholder image for ' + restaurant().name`
- [ ] Line 37: `'Rating: ' + restaurant().rating`
- [ ] Line 40: `ביקורות` → use i18n
- [ ] Line 46: `'Price level: ' + restaurant().priceLevel`
- [ ] Navigate button tooltips
- [ ] Call button tooltips
- [ ] Save button tooltips

### Search Bar Template

File: `search-bar.component.html`

- [ ] `aria-label="Search for restaurants"`
- [ ] `aria-label="Loading"`
- [ ] `aria-label="Clear search"`

### Assistant Templates

Files: Various assistant component templates

- [ ] All hardcoded English text
- [ ] All aria-labels

## Signal Labels Migration

The old `signal-labels.ts` file had only Hebrew and English. The new system supports all 8 languages.

### Migration Steps:

1. [x] Create new `card-signal-labels.i18n.ts` with all 8 languages
2. [ ] Update imports from `signal-labels.ts` to `card-signal-labels.i18n.ts`
3. [ ] Replace `getSignalLabel()` calls with `I18nService.getSignal()`
4. [ ] Delete old `signal-labels.ts` file (after confirming no usage)

## Testing Checklist

### Manual Testing

- [ ] Test English (en)
- [ ] Test Hebrew (he) - verify RTL
- [ ] Test French (fr)
- [ ] Test Spanish (es)
- [ ] Test Russian (ru)
- [ ] Test Arabic (ar) - verify RTL
- [ ] Test Italian (it)
- [ ] Test Japanese (ja)

### Test Scenarios

- [ ] Backend sends `assistantLanguage = 'he'` → UI switches to Hebrew
- [ ] Backend sends `assistantLanguage = 'ja'` → UI switches to Japanese
- [ ] Backend sends unsupported language → fallback to English
- [ ] RTL layout works for Hebrew and Arabic
- [ ] All button labels translate
- [ ] All tooltips translate
- [ ] All aria-labels translate
- [ ] Cuisine tags translate
- [ ] Signal badges translate
- [ ] Error messages translate
- [ ] Action executor toasts translate

### Automated Testing

- [ ] Write unit tests for `I18nService`
- [ ] Write unit tests for translation functions
- [ ] Write integration tests for component i18n usage
- [ ] Add E2E tests for language switching

## JSON Export

After all migrations are complete:

```bash
cd llm-angular
npx ts-node generate-i18n-json.ts
```

Verify outputs in `src/assets/i18n/`:

- [ ] `en.json` generated
- [ ] `he.json` generated
- [ ] `fr.json` generated
- [ ] `es.json` generated
- [ ] `ru.json` generated
- [ ] `ar.json` generated
- [ ] `it.json` generated
- [ ] `ja.json` generated

## Documentation

- [x] Create `I18N_README.md`
- [x] Create migration checklist (this file)
- [ ] Update component README files with i18n usage
- [ ] Add inline code comments for i18n patterns

## Known Issues

### Hardcoded Hebrew in Restaurant Card

The template has a hardcoded `ביקורות` (reviews) on line 40. This should be replaced with:

```html
<span class="rating-reviews"> · {{ formatReviewCount(restaurant().userRatingsTotal!) }} {{ i18n.tUi('card.reviews') }}</span>
```

### Cuisine Map

The old `getCuisineTag()` had a massive hardcoded map. This is now replaced with `cuisine-labels.i18n.ts` which is centralized and supports all 8 languages.

### Signal Labels File Location

There are two `signal-labels.ts` files:

1. `domain/i18n/signal-labels.ts` (old, only he/en)
2. `domain/i18n/card-signal-labels.i18n.ts` (new, all 8 languages)

The new one should be used. The old one can be deleted after migration.

## Next Steps

1. **Complete Restaurant Card template migration** (aria-labels, tooltips)
2. **Migrate Search Bar component** (all strings)
3. **Migrate Reason Label component** (all strings)
4. **Migrate Assistant components** (all strings)
5. **Migrate Action Executors** (all toast messages)
6. **Test all 8 languages manually**
7. **Generate JSON files**
8. **Write automated tests**
9. **Delete old signal-labels.ts**
10. **Update all component documentation**

## Completion Criteria

- [ ] All components use `I18nService`
- [ ] No hardcoded English/Hebrew strings in components
- [ ] All 8 languages tested manually
- [ ] Automated tests pass
- [ ] JSON files generated
- [ ] Documentation complete
- [ ] Old files cleaned up

---

**Last Updated:** 2026-02-01  
**Status:** Core infrastructure complete, component migration in progress
