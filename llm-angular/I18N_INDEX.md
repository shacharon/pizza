# 🌍 Restaurant Search i18n System

Complete internationalization system supporting **8 languages** with deterministic, type-safe translations.

## 📚 Documentation Index

### Getting Started
1. **[Quick Reference](./I18N_QUICK_REFERENCE.md)** ⚡ - Start here! Quick API reference and examples
2. **[Implementation Summary](./I18N_IMPLEMENTATION_SUMMARY.md)** 📊 - What's built and how it works
3. **[Full Documentation](./I18N_README.md)** 📖 - Complete guide (4,000+ words)

### Technical Details
4. **[Architecture Diagram](./I18N_ARCHITECTURE.md)** 🏗️ - Visual data flow and system design
5. **[Migration Checklist](./I18N_MIGRATION_CHECKLIST.md)** ✅ - Track component migration progress
6. **[Testing Guide](./I18N_TESTING_GUIDE.md)** 🧪 - Manual, automated, and E2E testing

---

## 🎯 Quick Overview

### Supported Languages
- 🇺🇸 **en** - English
- 🇮🇱 **he** - Hebrew (RTL)
- 🇫🇷 **fr** - French
- 🇪🇸 **es** - Spanish
- 🇷🇺 **ru** - Russian
- 🇸🇦 **ar** - Arabic (RTL)
- 🇮🇹 **it** - Italian
- 🇯🇵 **ja** - Japanese

### Key Features
✅ **Deterministic** - No LLM-generated text  
✅ **Type-safe** - All keys are typed enums  
✅ **Reactive** - Automatic updates on language change  
✅ **RTL Support** - Built-in for Hebrew & Arabic  
✅ **Centralized** - Single `I18nService` API  
✅ **Comprehensive** - 130+ translation keys

---

## 🚀 Quick Start (30 seconds)

### 1. Inject Service
```typescript
import { inject } from '@angular/core';
import { I18nService } from './services/i18n.service';

export class MyComponent {
  readonly i18n = inject(I18nService);
}
```

### 2. Use in Template
```html
<span>{{ i18n.tUi('card.openNow') }}</span>
<!-- Displays: "営業中" when language is Japanese -->
```

### 3. Done! 🎉
The language comes from backend via WebSocket (`assistantLanguage` field). UI updates automatically.

---

## 📂 File Structure

```
llm-angular/
├── src/app/
│   ├── i18n/                          ← Translation modules
│   │   ├── search-narration.i18n.ts   (Hero, location, search, errors)
│   │   ├── ui-strings.i18n.ts         (Card, buttons, tooltips)
│   │   └── cuisine-labels.i18n.ts     (Cuisine types with emojis)
│   ├── domain/i18n/
│   │   └── card-signal-labels.i18n.ts (Card badges)
│   ├── services/
│   │   └── i18n.service.ts            ← Centralized API
│   └── assets/i18n/                   ← Generated JSON files
│       ├── en.json
│       ├── he.json
│       └── ... (fr, es, ru, ar, it, ja)
├── generate-i18n-json.ts              ← JSON export script
└── I18N_*.md                          ← Documentation
```

---

## 🔑 Common Usage Patterns

### Translate UI String
```typescript
const label = this.i18n.tUi('card.openNow');
// → "Open now" (en) / "פתוח עכשיו" (he) / "営業中" (ja)
```

### Translate with Variables
```typescript
const text = this.i18n.tUi('action.shareText', {
  name: 'Pizza Place',
  address: '123 Main St'
});
// → "Check out Pizza Place at 123 Main St"
```

### Get Cuisine Label
```typescript
const cuisine = this.i18n.getCuisine(['sushi', 'japanese']);
// → "🍣 Sushi" (en) / "🍣 סושי" (he) / "🍣 寿司" (ja)
```

### Check RTL
```typescript
if (this.i18n.isRTL()) {
  // Apply RTL layout (Hebrew or Arabic)
}
```

---

## 📊 Translation Coverage

| Module | Keys | Status |
|--------|------|--------|
| Search Narration | 50+ | ✅ Complete |
| UI Strings | 55+ | ✅ Complete |
| Cuisine Labels | 22 | ✅ Complete |
| Signal Labels | 8 | ✅ Complete |
| **Total** | **130+** | **✅ All languages** |

---

## 🎨 Example Translations

### "Open now"
| Language | Translation |
|----------|-------------|
| 🇺🇸 English | Open now |
| 🇮🇱 Hebrew | פתוח עכשיו |
| 🇫🇷 French | Ouvert maintenant |
| 🇪🇸 Spanish | Abierto ahora |
| 🇷🇺 Russian | Открыто сейчас |
| 🇸🇦 Arabic | مفتوح الآن |
| 🇮🇹 Italian | Aperto ora |
| 🇯🇵 Japanese | 営業中 |

### Cuisine: "Sushi"
| Language | Translation |
|----------|-------------|
| 🇺🇸 English | 🍣 Sushi |
| 🇮🇱 Hebrew | 🍣 סושי |
| 🇫🇷 French | 🍣 Sushi |
| 🇪🇸 Spanish | 🍣 Sushi |
| 🇷🇺 Russian | 🍣 Суши |
| 🇸🇦 Arabic | 🍣 سوشي |
| 🇮🇹 Italian | 🍣 Sushi |
| 🇯🇵 Japanese | 🍣 寿司 |

---

## 📋 Translation Scope

### ✅ DO Translate
- Buttons, labels, headings
- Tooltips, aria-labels
- Error messages, empty states
- Filters, chips, badges
- Helper texts
- Meta UI (open now, reviews, distance)

### ❌ DON'T Translate
- Restaurant names
- Addresses
- User-generated content
- Assistant messages (backend handles)
- Google provider text

---

## 🛠️ Tools & Scripts

### Generate JSON Files
```bash
cd llm-angular
npx ts-node generate-i18n-json.ts
```
Output: `src/assets/i18n/*.json` (one per language)

### Test All Languages
```bash
npm run test:i18n
npm run e2e:i18n
```

---

## 📖 Read Next

**New to the system?**  
→ Start with [Quick Reference](./I18N_QUICK_REFERENCE.md)

**Want deep dive?**  
→ Read [Full Documentation](./I18N_README.md)

**Migrating components?**  
→ Follow [Migration Checklist](./I18N_MIGRATION_CHECKLIST.md)

**Need to test?**  
→ Use [Testing Guide](./I18N_TESTING_GUIDE.md)

**Understanding architecture?**  
→ View [Architecture Diagrams](./I18N_ARCHITECTURE.md)

---

## 🎓 Learning Path

```
Day 1: Quick Reference → Implementation Summary
       ↓
Day 2: Full Documentation → Architecture
       ↓
Day 3: Migration Checklist → Start migrating components
       ↓
Day 4: Testing Guide → Write tests
       ↓
Day 5: Complete migration → Generate JSON → Deploy! 🚀
```

---

## ✨ System Highlights

### 1. Language Source of Truth
```
Backend WebSocket → assistantLanguage → SearchFacade → I18nService → Components
```
No guessing. Language always comes from backend.

### 2. Type Safety
```typescript
// Autocomplete & compile-time checks
this.i18n.tUi('card.openNow'); // ✅ Valid key
this.i18n.tUi('card.invalid'); // ❌ TypeScript error
```

### 3. Reactive Updates
```typescript
// When assistantLanguage changes from 'en' to 'ja'
// All UI automatically updates to Japanese
// No manual subscriptions needed
```

### 4. RTL Detection
```typescript
// Hebrew & Arabic automatically detected
this.i18n.isRTL() // true for 'he' and 'ar'
```

---

## 🏆 Quality Standards

### Translation Quality
- **Natural** - Not literal Google Translate
- **Modern** - Contemporary language for each locale
- **Consistent** - Same terminology across all strings
- **Concise** - App-style, not formal documentation

### Code Quality
- **100% TypeScript** - Full type safety
- **Zero dependencies** - Pure Angular/TypeScript
- **Signal-based** - Modern reactive patterns
- **Well-documented** - 6,000+ words of docs

---

## 📈 Statistics

- **1,000+ translations** (130 keys × 8 languages)
- **8 languages** fully supported
- **2 RTL languages** (Hebrew, Arabic)
- **22 cuisine types** with emojis
- **4 translation modules** organized by domain
- **1 centralized service** for all i18n
- **6,000+ words** of documentation

---

## 🤝 Contributing

### Adding a New String
1. Add key to type definition (`MsgKey` or `UiKey`)
2. Add translations for all 8 languages
3. Regenerate JSON files
4. Update documentation if needed

### Adding a New Language
1. Add to `Lang` / `UiLang` type
2. Add translations to all modules
3. Update `normalizeLang()` function
4. Add to `isRTL()` if RTL language
5. Regenerate JSON files
6. Update documentation

---

## 📞 Support

**Questions?** Check the documentation:
- [Quick Reference](./I18N_QUICK_REFERENCE.md)
- [FAQ in README](./I18N_README.md#faq)
- [Testing Guide](./I18N_TESTING_GUIDE.md)

**Issues?** Check [Troubleshooting in Testing Guide](./I18N_TESTING_GUIDE.md#troubleshooting)

**Want to contribute?** See [Migration Checklist](./I18N_MIGRATION_CHECKLIST.md)

---

## 🎉 Status: Production Ready

✅ Core infrastructure complete  
✅ All 8 languages implemented  
✅ Type-safe and reactive  
✅ Comprehensive documentation  
🔄 Component migration in progress (see checklist)

---

**Version:** 1.0.0  
**Created:** 2026-02-01  
**Languages:** 8 (en, he, fr, es, ru, ar, it, ja)  
**Keys:** 130+  
**Translations:** 1,000+  

**Ready to use!** 🚀

---

© 2026 Restaurant Search App | Powered by Angular 19 + TypeScript
