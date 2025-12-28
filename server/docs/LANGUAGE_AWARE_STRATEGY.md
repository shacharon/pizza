# Language-Aware Search Strategy

## 🎯 Problem

Even with `region` set correctly, using **English queries** for non-English searches gave different results than Google Maps.

### Example: French Query in France

**Google Maps Search:** "restaurants italiens Champs-Élysées Paris"
- Query: "restaurants italiens" (French)
- Language: fr
- Region: fr
- **Results:** L'Italien, Ziti, Café Di Roma (authentic French results)

**Our System (Before Fix):**
- Query: "italian restaurant" (English translation)
- Language: en
- Region: fr ✅
- **Results:** Different restaurants (international/English-indexed)

**Why?** French restaurants in France are better indexed under **French terms** in Google's database.

---

## ✅ Solution: Language-Aware Strategy

**Use the original query language when it matches the region** for more authentic local results.

### Strategy Rules

| Request Language | Region | Google Language | Query Used |
|------------------|--------|-----------------|------------|
| French (fr) | France (fr) | **fr** | Original French query |
| Hebrew (he) | Israel (il) | **he** | Original Hebrew query |
| English (en) | Any | en | English canonical |
| Russian (ru) | France (fr) | en | English canonical |
| French (fr) | Israel (il) | en | English canonical |

**Key Principle:** Language-to-region matching gives local results. Mismatches use English for consistency.

---

## 🔧 Implementation

### File: `intent.service.ts`

After region is extracted from geocoding:

```typescript
// Language-Aware Strategy: Use original language when it matches region
if (intent.location?.region && requestLanguage !== 'en') {
  const region = intent.location.region;
  let useOriginalLanguage = false;
  
  // French query in France → use French
  if (requestLanguage === 'fr' && region === 'fr') {
    useOriginalLanguage = true;
    intent.languageContext.googleLanguage = 'fr';
    logger.info({ requestLanguage, region, strategy: 'use_original_language' }, 
      'Using French language for French query in France');
  }
  // Hebrew query in Israel → use Hebrew
  else if (requestLanguage === 'he' && region === 'il') {
    useOriginalLanguage = true;
    intent.languageContext.googleLanguage = 'he';
    logger.info({ requestLanguage, region, strategy: 'use_original_language' }, 
      'Using Hebrew language for Hebrew query in Israel');
  }
  
  // Flag for orchestrator to use original query
  if (useOriginalLanguage) {
    (intent as any).useOriginalLanguage = true;
  }
}
```

### File: `search.orchestrator.ts`

Query composition logic:

```typescript
const useOriginalLanguage = (intent as any).useOriginalLanguage;

if (useOriginalLanguage && intent.originalQuery) {
  // Use original query for language-matched searches
  queryForGoogle = intent.originalQuery;
  console.log(`[SearchOrchestrator] 🌍 Using original language query: "${queryForGoogle}"`);
} else if (intent.canonical?.category) {
  // Use English canonical for cross-language consistency
  queryForGoogle = intent.canonical.category;
  console.log(`[SearchOrchestrator] 🔎 Using canonical category: "${queryForGoogle}"`);
}
```

---

## 📊 Before vs After

### French Query: "Restaurants italiens sur les Champs-Élysées à Paris"

#### Before Language-Aware Strategy

```json
{
  "msg": "Google Places API parameters",
  "query": "italian restaurant",  // ❌ English
  "language": "en",               // ❌ English
  "region": "fr",
  "useOriginalLanguage": false
}
```

**Results:** International restaurants, different from Google Maps

---

#### After Language-Aware Strategy

```json
{
  "msg": "Using French language for French query in France",
  "requestLanguage": "fr",
  "region": "fr",
  "strategy": "use_original_language"
}

{
  "msg": "Google Places API parameters",
  "query": "Restaurants italiens sur les Champs-Élysées à Paris",  // ✅ French
  "language": "fr",                                                // ✅ French
  "region": "fr",
  "useOriginalLanguage": true
}
```

**Results:** Authentic French restaurants, **matching Google Maps!** 🎯

---

## 🌍 Language Support

### Currently Implemented

| Language | Region Match | Status |
|----------|--------------|--------|
| French | France (fr) | ✅ Implemented |
| Hebrew | Israel (il) | ✅ Implemented |

### Easy to Add

Want to add more languages? Just add another condition:

```typescript
// Spanish query in Spain → use Spanish
else if (requestLanguage === 'es' && region === 'es') {
  useOriginalLanguage = true;
  intent.languageContext.googleLanguage = 'es';
  logger.info('Using Spanish language for Spanish query in Spain');
}
```

---

## 📝 Logging

### New Structured Logs

**1. Language-aware decision:**
```json
{
  "level": "info",
  "msg": "Using French language for French query in France",
  "requestLanguage": "fr",
  "region": "fr",
  "strategy": "use_original_language"
}
```

**2. Query selection:**
```
[SearchOrchestrator] 🌍 Using original language query: "Restaurants italiens sur les Champs-Élysées à Paris"
```

**3. API parameters (updated):**
```json
{
  "msg": "Google Places API parameters",
  "query": "Restaurants italiens...",
  "language": "fr",
  "region": "fr",
  "useOriginalLanguage": true  // NEW FLAG
}
```

---

## ✅ Benefits

1. **Matches Google Maps:** French searches in France return the same results as Google Maps
2. **Authentic Local Results:** Uses local language for better indexing
3. **Cross-language Consistency:** Mismatched languages still use English canonical
4. **Flexible:** Easy to add more language-region pairs

---

## 🧪 Testing

### Test Cases

| Query | Expected Language | Expected Query | Expected Results |
|-------|------------------|----------------|------------------|
| "Restaurants italiens Champs-Élysées Paris" | fr | Original French | French restaurants (matches Google Maps) |
| "Italian restaurants Champs-Élysées Paris" | en | "italian restaurant" | International results |
| "פיצה בתל אביב" | he | Original Hebrew | Israeli pizzerias |
| "Итальянские рестораны в Париже" (Russian in Paris) | en | "italian restaurant" | English fallback |

---

## 🎯 Future Enhancements

1. **Add more language-region pairs:**
   - Spanish in Spain/Latin America
   - Italian in Italy
   - German in Germany/Austria
   - Portuguese in Brazil/Portugal

2. **Multi-region support:**
   - Spanish: Spain (es) OR Mexico (mx) OR Argentina (ar)
   - French: France (fr) OR Canada (ca)

3. **User preference:**
   - Let users choose: "Always use English" or "Use local language"

---

**Implemented:** December 28, 2025  
**Status:** ✅ Complete — Matching Google Maps Results!

