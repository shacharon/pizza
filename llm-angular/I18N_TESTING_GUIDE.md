# i18n Testing Guide

## Overview

This guide covers how to test the i18n system across all 8 supported languages.

## Test Categories

1. **Manual Testing** - Visual verification of translations
2. **Automated Testing** - Unit & integration tests
3. **E2E Testing** - Full user flow testing
4. **RTL Testing** - Layout verification for Hebrew & Arabic

---

## 1. Manual Testing

### Setup

To test different languages, you need to mock the `assistantLanguage` value from the backend.

#### Option A: Browser DevTools Override

```typescript
// In browser console
const searchFacade = document
  .querySelector("app-root")
  ?.__ngContext__?.[8] // Angular context
  ?.get(SearchFacade);

if (searchFacade) {
  searchFacade.assistantLanguage.set("ja"); // Change to desired language
}
```

#### Option B: Backend Mock (Recommended)

Modify the WebSocket mock or backend to send different `assistantLanguage` values:

```typescript
// In mock-websocket.ts or similar
const mockResponse = {
  type: 'search_response',
  assistantLanguage: 'ja', // Change this
  results: [...]
};
```

### Test Matrix

Test each language across all UI components:

| Language | Code | Test Status   | Notes              |
| -------- | ---- | ------------- | ------------------ |
| English  | `en` | ⬜ Not tested | Source language    |
| Hebrew   | `he` | ⬜ Not tested | RTL - check layout |
| French   | `fr` | ⬜ Not tested | Check accents      |
| Spanish  | `es` | ⬜ Not tested | Check ñ, accents   |
| Russian  | `ru` | ⬜ Not tested | Check Cyrillic     |
| Arabic   | `ar` | ⬜ Not tested | RTL - check layout |
| Italian  | `it` | ⬜ Not tested | Check accents      |
| Japanese | `ja` | ⬜ Not tested | Check kanji/kana   |

### Components to Test

#### Restaurant Card

- [ ] Open/Closed status label
- [ ] Reviews count label
- [ ] Price level label
- [ ] Cuisine tag (with emoji)
- [ ] Navigate button tooltip
- [ ] Call button tooltip
- [ ] Save button tooltip
- [ ] Aria-labels (use screen reader or inspect HTML)
- [ ] Gluten-free badge text
- [ ] Gluten-free tooltip

**Test Script:**

1. Set language (e.g., `he`)
2. Search for restaurants
3. Verify card shows:
   - Status: "פתוח עכשיו" (not "Open now")
   - Reviews: "123 ביקורות" (not "123 reviews")
   - Cuisine: "🍣 סושי" (not "🍣 Sushi")
   - Tooltips in Hebrew when hovering
4. Inspect HTML: verify aria-labels are translated

#### Search Bar

- [ ] Placeholder text
- [ ] Aria-label on input
- [ ] Loading aria-label
- [ ] Clear button aria-label

#### Assistant Components

- [ ] "Quick Picks" heading
- [ ] "Refine" heading
- [ ] Clear messages aria-label
- [ ] Chip action labels

#### Error States

- [ ] Error title
- [ ] Error retry button
- [ ] No results message
- [ ] WebSocket status messages

#### Actions (Toast Messages)

- [ ] "Opened Google Maps"
- [ ] "Failed to open maps"
- [ ] "Shared successfully"
- [ ] "Saved to favorites"

### RTL Testing (Hebrew & Arabic)

When testing `he` or `ar`, verify:

#### Layout

- [ ] Text flows right-to-left
- [ ] Icons/buttons flip horizontally
- [ ] Margins/padding flip
- [ ] Scroll direction is reversed

#### Visual Inspection

```
LTR (English):
┌──────────────────────┐
│ 📍 Navigate  📞 Call │  ← Left to right
└──────────────────────┘

RTL (Hebrew):
┌──────────────────────┐
│ Call 📞  Navigate 📍 │  ← Right to left
└──────────────────────┘
```

#### Check CSS

Ensure `dir="rtl"` is applied to root element:

```html
<!-- English -->
<html dir="ltr">
  <!-- Hebrew/Arabic -->
  <html dir="rtl"></html>
</html>
```

### Expected Translations Sample

#### Card.openNow

- 🇺🇸 English: "Open now"
- 🇮🇱 Hebrew: "פתוח עכשיו"
- 🇫🇷 French: "Ouvert maintenant"
- 🇪🇸 Spanish: "Abierto ahora"
- 🇷🇺 Russian: "Открыто сейчас"
- 🇸🇦 Arabic: "مفتوح الآن"
- 🇮🇹 Italian: "Aperto ora"
- 🇯🇵 Japanese: "営業中"

#### Cuisine: Sushi

- 🇺🇸 English: "🍣 Sushi"
- 🇮🇱 Hebrew: "🍣 סושי"
- 🇫🇷 French: "🍣 Sushi"
- 🇪🇸 Spanish: "🍣 Sushi"
- 🇷🇺 Russian: "🍣 Суши"
- 🇸🇦 Arabic: "🍣 سوشي"
- 🇮🇹 Italian: "🍣 Sushi"
- 🇯🇵 Japanese: "🍣 寿司"

---

## 2. Automated Testing

### Unit Tests

#### Test I18nService

```typescript
import { TestBed } from "@angular/core/testing";
import { I18nService } from "./i18n.service";
import { SearchFacade } from "../facades/search.facade";

describe("I18nService", () => {
  let service: I18nService;
  let searchFacade: jasmine.SpyObj<SearchFacade>;

  beforeEach(() => {
    // Mock SearchFacade
    const spy = jasmine.createSpyObj("SearchFacade", [], {
      assistantLanguage: jasmine.createSpy().and.returnValue("en"),
    });

    TestBed.configureTestingModule({
      providers: [I18nService, { provide: SearchFacade, useValue: spy }],
    });

    service = TestBed.inject(I18nService);
    searchFacade = TestBed.inject(SearchFacade) as jasmine.SpyObj<SearchFacade>;
  });

  it("should create", () => {
    expect(service).toBeTruthy();
  });

  it("should return English as default language", () => {
    expect(service.currentLang()).toBe("en");
  });

  it("should detect Hebrew as RTL", () => {
    // Mock assistantLanguage to return 'he'
    Object.defineProperty(searchFacade, "assistantLanguage", {
      value: jasmine.createSpy().and.returnValue("he"),
    });

    expect(service.isRTL()).toBe(true);
  });

  it("should detect English as LTR", () => {
    expect(service.isRTL()).toBe(false);
  });

  it("should translate UI strings correctly", () => {
    expect(service.tUi("card.openNow")).toBe("Open now");
  });

  it("should translate to Hebrew when language is he", () => {
    Object.defineProperty(searchFacade, "assistantLanguage", {
      value: jasmine.createSpy().and.returnValue("he"),
    });

    expect(service.tUi("card.openNow")).toBe("פתוח עכשיו");
  });

  it("should interpolate variables", () => {
    const result = service.tUi("action.shareText", {
      name: "Test Restaurant",
      address: "123 Main St",
    });

    expect(result).toBe("Check out Test Restaurant at 123 Main St");
  });

  it("should return cuisine label with emoji", () => {
    const result = service.getCuisine(["sushi", "japanese"]);
    expect(result).toBe("🍣 Sushi");
  });

  it("should return signal label", () => {
    const result = service.getSignal("OPEN_NOW");
    expect(result).toBe("Open now");
  });

  it("should fallback to English for unsupported language", () => {
    Object.defineProperty(searchFacade, "assistantLanguage", {
      value: jasmine.createSpy().and.returnValue("unsupported"),
    });

    expect(service.currentLang()).toBe("en");
  });
});
```

#### Test Translation Functions

```typescript
import { t, normalizeLang, isRTL } from "./search-narration.i18n";
import { tUi } from "./ui-strings.i18n";
import { getCuisineLabel } from "./cuisine-labels.i18n";

describe("Translation Functions", () => {
  describe("normalizeLang", () => {
    it("should normalize Hebrew", () => {
      expect(normalizeLang("he")).toBe("he");
      expect(normalizeLang("HE")).toBe("he");
      expect(normalizeLang("he-IL")).toBe("he");
      expect(normalizeLang("iw")).toBe("he"); // Old code
    });

    it("should normalize Japanese", () => {
      expect(normalizeLang("ja")).toBe("ja");
      expect(normalizeLang("JA")).toBe("ja");
      expect(normalizeLang("ja-JP")).toBe("ja");
    });

    it("should fallback to English", () => {
      expect(normalizeLang("unknown")).toBe("other");
      expect(normalizeLang("")).toBe("en");
      expect(normalizeLang(undefined)).toBe("en");
    });
  });

  describe("isRTL", () => {
    it("should detect Hebrew as RTL", () => {
      expect(isRTL("he")).toBe(true);
    });

    it("should detect Arabic as RTL", () => {
      expect(isRTL("ar")).toBe(true);
    });

    it("should detect other languages as LTR", () => {
      expect(isRTL("en")).toBe(false);
      expect(isRTL("fr")).toBe(false);
      expect(isRTL("ja")).toBe(false);
    });
  });

  describe("t (search narration)", () => {
    it("should translate to English", () => {
      expect(t("en", "hero.title")).toBe("Search food the way you think");
    });

    it("should translate to Hebrew", () => {
      expect(t("he", "hero.title")).toBe("חפשו אוכל כמו שאתם חושבים");
    });

    it("should translate to Japanese", () => {
      expect(t("ja", "hero.title")).toBe("思いのままに食事を検索");
    });

    it("should fallback to English if translation missing", () => {
      const result = t("other", "hero.title");
      expect(result).toBe("Search food the way you think");
    });
  });

  describe("tUi (UI strings)", () => {
    it("should translate to English", () => {
      expect(tUi("en", "card.openNow")).toBe("Open now");
    });

    it("should translate to Hebrew", () => {
      expect(tUi("he", "card.openNow")).toBe("פתוח עכשיו");
    });

    it("should translate to Japanese", () => {
      expect(tUi("ja", "card.openNow")).toBe("営業中");
    });

    it("should interpolate variables", () => {
      const result = tUi("en", "action.shareText", {
        name: "Pizza Place",
        address: "123 Main St",
      });
      expect(result).toBe("Check out Pizza Place at 123 Main St");
    });
  });

  describe("getCuisineLabel", () => {
    it("should return cuisine with emoji (English)", () => {
      expect(getCuisineLabel(["sushi"], "en")).toBe("🍣 Sushi");
    });

    it("should return cuisine with emoji (Hebrew)", () => {
      expect(getCuisineLabel(["sushi"], "he")).toBe("🍣 סושי");
    });

    it("should return cuisine with emoji (Japanese)", () => {
      expect(getCuisineLabel(["sushi"], "ja")).toBe("🍣 寿司");
    });

    it("should match partial tag", () => {
      expect(getCuisineLabel(["sushi_restaurant"], "en")).toBe("🍣 Sushi");
    });

    it("should fallback to restaurant", () => {
      expect(getCuisineLabel(["unknown"], "en")).toBe("🍽️ Restaurant");
    });
  });
});
```

#### Test Component Integration

```typescript
import { ComponentFixture, TestBed } from "@angular/core/testing";
import { RestaurantCardComponent } from "./restaurant-card.component";
import { I18nService } from "../../../../services/i18n.service";

describe("RestaurantCardComponent i18n", () => {
  let component: RestaurantCardComponent;
  let fixture: ComponentFixture<RestaurantCardComponent>;
  let i18nService: jasmine.SpyObj<I18nService>;

  beforeEach(async () => {
    const spy = jasmine.createSpyObj("I18nService", ["tUi", "getCuisine", "getSignal"]);

    await TestBed.configureTestingModule({
      imports: [RestaurantCardComponent],
      providers: [{ provide: I18nService, useValue: spy }],
    }).compileComponents();

    fixture = TestBed.createComponent(RestaurantCardComponent);
    component = fixture.componentInstance;
    i18nService = TestBed.inject(I18nService) as jasmine.SpyObj<I18nService>;

    // Setup default mocks
    i18nService.tUi.and.returnValue("Mocked translation");
  });

  it("should use i18n for open status label", () => {
    i18nService.tUi.and.returnValue("Open now");

    const label = component.getOpenStatusLabel();

    expect(i18nService.tUi).toHaveBeenCalledWith("card.openNow");
    expect(label).toBe("Open now");
  });

  it("should use i18n for gluten-free tooltip", () => {
    i18nService.tUi.and.returnValue("Based on text signals");

    const tooltip = component.getGlutenFreeTooltip();

    expect(i18nService.tUi).toHaveBeenCalledWith("card.glutenFreeTooltip");
    expect(tooltip).toBe("Based on text signals");
  });

  it("should use i18n for cuisine tag", () => {
    i18nService.getCuisine.and.returnValue("🍣 Sushi");

    // Mock restaurant with tags
    component.restaurant = signal({
      placeId: "test",
      name: "Test Restaurant",
      tags: ["sushi", "japanese"],
    } as any);

    const cuisine = component.getCuisineTag();

    expect(i18nService.getCuisine).toHaveBeenCalledWith(["sushi", "japanese"]);
    expect(cuisine).toBe("🍣 Sushi");
  });
});
```

---

## 3. E2E Testing

### Playwright / Cypress Tests

```typescript
import { test, expect } from '@playwright/test';

test.describe('i18n System', () => {
  test('should display English by default', async ({ page }) => {
    await page.goto('/');

    // Wait for search to complete
    await page.waitForSelector('.restaurant-card');

    // Check that UI is in English
    await expect(page.locator('.card-signal-text').first()).toContainText('Open now');
  });

  test('should switch to Hebrew when assistantLanguage is he', async ({ page }) => {
    // Mock WebSocket to return Hebrew
    await page.route('**/ws', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          type: 'search_response',
          assistantLanguage: 'he',
          results: [...]
        })
      });
    });

    await page.goto('/');
    await page.waitForSelector('.restaurant-card');

    // Check that UI is in Hebrew
    await expect(page.locator('.card-signal-text').first()).toContainText('פתוח עכשיו');
  });

  test('should apply RTL layout for Hebrew', async ({ page }) => {
    // Mock Hebrew response
    await page.route('**/ws', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          type: 'search_response',
          assistantLanguage: 'he',
          results: [...]
        })
      });
    });

    await page.goto('/');
    await page.waitForSelector('html[dir="rtl"]');

    // Verify RTL attribute
    const dir = await page.getAttribute('html', 'dir');
    expect(dir).toBe('rtl');
  });

  test('should translate all languages', async ({ page }) => {
    const languages = [
      { code: 'en', openNow: 'Open now' },
      { code: 'he', openNow: 'פתוח עכשיו' },
      { code: 'fr', openNow: 'Ouvert maintenant' },
      { code: 'es', openNow: 'Abierto ahora' },
      { code: 'ru', openNow: 'Открыто сейчас' },
      { code: 'ar', openNow: 'مفتوح الآن' },
      { code: 'it', openNow: 'Aperto ora' },
      { code: 'ja', openNow: '営業中' }
    ];

    for (const lang of languages) {
      // Mock WebSocket
      await page.route('**/ws', route => {
        route.fulfill({
          status: 200,
          body: JSON.stringify({
            type: 'search_response',
            assistantLanguage: lang.code,
            results: [...]
          })
        });
      });

      await page.reload();
      await page.waitForSelector('.restaurant-card');

      // Check translation
      await expect(page.locator('.card-signal-text').first()).toContainText(lang.openNow);
    }
  });
});
```

---

## 4. Accessibility Testing

### Screen Reader Testing

Test with screen readers to verify aria-labels are translated:

1. **NVDA** (Windows) or **VoiceOver** (Mac)
2. Navigate to restaurant card
3. Tab through buttons
4. Verify announcements are in correct language

Example (Hebrew):

```
Expected: "נווט למסעדה" (Navigate to restaurant)
NOT: "Navigate to restaurant"
```

### Axe DevTools

Use Axe to verify accessibility:

```bash
npm install @axe-core/cli -g
axe https://localhost:4200 --locale he
```

---

## Test Coverage Goals

- [ ] **Unit Tests**: 90%+ coverage for i18n modules
- [ ] **Integration Tests**: All components with i18n
- [ ] **E2E Tests**: All 8 languages tested
- [ ] **RTL Tests**: Hebrew & Arabic layout verified
- [ ] **Accessibility Tests**: Screen reader compatible

---

## Continuous Testing

### Pre-Commit Hook

Add to `.husky/pre-commit`:

```bash
#!/bin/sh
npm run test:i18n
```

### CI/CD Pipeline

Add to GitHub Actions / GitLab CI:

```yaml
- name: Test i18n
  run: npm run test:i18n

- name: E2E i18n tests
  run: npm run e2e:i18n
```

---

## Troubleshooting

### Issue: Translation not appearing

1. Check `assistantLanguage` value in SearchFacade
2. Verify key exists in translation module
3. Check console for warnings

### Issue: RTL layout not applying

1. Verify `isRTL()` returns true for `he`/`ar`
2. Check `<html dir="rtl">` attribute
3. Verify CSS doesn't override RTL

### Issue: Aria-labels in wrong language

1. Check component exposes `i18n` as `readonly` (not `private`)
2. Verify template uses `i18n.tUi()`
3. Inspect HTML to confirm attribute value

---

**Last Updated:** 2026-02-01
