Love it. Here’s how I’d add **language** + **country** support end-to-end while keeping the “full LLM experience” and DB as source-of-truth.

# 1) Contract & DTOs (single source of locale truth)

Extend every request with explicit locale fields; never “guess only”.

```ts
// shared/api/locale.ts
export type Language = "he" | "en" | "ar" | "ru" | "fr";
export type CountryISO2 = "IL" | "US" | "GB" | "FR" | "DE" | "AE";
export type CurrencyISO = "ILS" | "USD" | "EUR" | "GBP" | "AED";

export interface LocaleCtx {
  language: Language; // UI language
  country: CountryISO2; // compliance, geo rules, open hours, features
  currency: CurrencyISO; // display currency
  tz?: string; // e.g., "Asia/Jerusalem"
}

export interface FoodQueryDTO {
  raw?: string;
  city?: string;
  type?: "pizza" | "sushi" | "burger" | "other";
  maxPrice?: number; // in currency
  dietary?: ("kosher" | "halal" | "vegan" | "vegetarian" | "gluten_free")[];
  openNow?: boolean;
  limit?: number;
  page?: number;
  locale: LocaleCtx; // ← required everywhere
}
```

**LLM prompt rule:** “Always respond in `locale.language`. When calling tools, pass `dto.locale` unchanged.”

# 2) Angular (UX/i18n/RTL)

- **i18n library:** start with `ngx-translate` (fast) or Angular built-in i18n (compile-time).
- **Language switcher** in header; persist in localStorage.
- **RTL/LTR:** toggle `dir="rtl"` for `he`/`ar` at the `<html>` root; ensure layout supports both.
- **Formatting:** use native `Intl` pipes for date/number/currency based on `locale`.
- **A11y:** dynamic `lang` attribute on `<html>`.
- **Content slots:** the chat shows LLM text; cards/CTAs use translation keys.

```ts
// app bootstrap
const browserLang = (navigator.language?.split("-")[0] as Language) ?? "he";
const locale: LocaleCtx = {
  language: browserLang,
  country: "IL",
  currency: "ILS",
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
};
```

# 3) Backend (locale resolution & policy)

- **Resolution order:** explicit (query/body) → user profile → `Accept-Language` → GeoIP fallback.
- **Middleware:** normalize to **canonical** enums (`he`, `IL`, `ILS`) and attach to `req.locale`.
- **LLM orchestration:** system message enforces reply language; all tools receive `locale`.
- **Policy by country:** feature flags (e.g., display “kosher” in IL by default; “halal” in AE).
- **Currency:** convert _display_ only (keep DB prices in native currency; render via FX rate cache).

# 4) Data & DB schema (multilingual safely)

- **Restaurants** table stays canonical.
- **Translations table** for text fields (name/desc/menu items) per language:

  ```
  restaurant_translations(restaurant_id, lang, name, description, slug)
  menu_item_translations(menu_item_id, lang, name, description)
  ```

- **Attributes normalization:** keep **canonical tags** in English (e.g., `kosher`, `family_friendly`). Map synonyms per language at ingest/search time.
- **Search index per language:** Meilisearch/Typesense analyzers per `lang`, or separate indexes (`restaurants_he`, `restaurants_en`).
- **Collation:** ensure DB/text index collation supports the language for correct sorting.

# 5) LLM NLU for multilingual inputs

- **Detect & normalize:** first step is `detectLanguage(raw)` (or rely on `locale.language`), then:

  - normalize city/food type with **alias dictionaries** per language,
  - transliteration handling (“אשקלון” ↔ “Ashkelon”).

- **Slot filling:** the LLM maps messy text → `FoodQueryDTO` using the **same** schema for all languages; only **text surfaces** change.
- **Re-rank:** when user gives semantic asks (“cozy for a date”), LLM re-ranks **top-K DB results**; the ranking rubric can be language-aware (use translated descriptions if available).

# 6) Pricing, units, and time

- **Currency display:** show `Intl.NumberFormat(locale.language, { style:'currency', currency })`.
- **FX rates:** cache refreshed server-side (e.g., hourly); **do not** store converted prices in DB.
- **Open-now:** use `locale.tz` for business hours (country affects weekend days).
- **Address formats:** render per country (street before/after number, postal codes).

# 7) Content pipeline (menus & reviews)

- **Ingest:** keep originals; translate asynchronously per need (LLM or NMT) and cache translations by checksum.
- **Freshness flags:** show when content is machine-translated, allow “see original”.

# 8) Guardrails & testing

- **Contract tests**: same query across `he`, `en`, `ar` returns **same IDs**, only text differs.
- **i18n coverage**: scanning untranslated keys in CI.
- **RTL visual tests** (Storybook with `dir="rtl"`).
- **Safety:** profanity/PII filters per language before rendering user-generated bits.

# 9) Minimal code—LLM prompt shim

```ts
const system = `
You are a food-ordering assistant. Output in {{lang}}.
If calling tools, always pass through the 'locale' object unchanged.
Never fabricate restaurant data—use tools/DB responses only.
`;

const user = `
{{utterance}}
Locale:
{
 "language":"{{lang}}",
 "country":"{{country}}",
 "currency":"{{currency}}",
 "tz":"{{tz}}"
}
Return JSON matching FoodQueryDTO; ask a short clarifying question if critical fields are missing.
`;
```

# 10) Rollout plan (2 sprints)

**Sprint 1**

- Locale middleware & DTO changes end-to-end.
- Angular i18n plumbing + language switcher + RTL.
- DB translation tables + minimal EN/HE data; currency formatting.

**Sprint 2**

- Language-aware search index + synonym maps.
- LLM slot-filling tuned for HE/EN; re-rank rubric.
- Background translation jobs (menus/descriptions) + cache.

---

## Key takeaways

- Make **locale explicit** everywhere (DTO, tools, cache keys).
- Separate **canonical data** from **localized views** (translation tables).
- LLM handles **understanding & phrasing**; DB remains the **truth**.
- Build **per-language search analyzers** + synonym maps for great UX.

If you want, I’ll draft the actual DB migration (translations tables), Angular i18n scaffolding, and the Node locale middleware so you can paste it straight into the repo.
