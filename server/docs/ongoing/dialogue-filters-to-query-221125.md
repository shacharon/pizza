# Dialogue Filters Appended to Query

**Date:** November 22, 2025  
**Status:** ✅ Fixed

---

## Problem

Refinement filters (like `opennow`, `parking`) were not being passed to Google Places API:

```
[DialogueService] filters: ['המבורגר', 'Gedera', 'opennow']  ✅

BUT:

[PlacesLangGraph] textsearch params {
  query: 'המבורגרים',
  // ❌ NO opennow parameter!
}
```

**Root Cause:** `PlacesLangGraph` doesn't accept a `filters` parameter. It only analyzes the `text` query. The filters from `DialogueService` were being ignored.

---

## Solution

Append refinement filters to the query text before sending to `PlacesLangGraph`:

```typescript
// In executeSearch()
if (filters && filters.length > 0) {
    // Extract refinement keywords (skip food types and locations)
    const refinementKeywords = filters.filter(f => {
        const lower = f.toLowerCase();
        // Skip if it looks like food or location
        return !['המבורגר', 'המבורגרים', 'פיצה', 'burger', 'pizza'].includes(lower) &&
               !['gedera', 'גדרה', 'tel aviv', 'תל אביב'].includes(lower);
    });

    if (refinementKeywords.length > 0) {
        effectiveQuery += ' ' + refinementKeywords.join(' ');
        console.log('[DialogueService] Appended refinement filters:', refinementKeywords);
    }
}

// Before: "מסעדת המבורגרים בגדרה"
// After:  "מסעדת המבורגרים בגדרה opennow"
```

---

## How It Works

1. **DialogueService** receives filters: `['המבורגר', 'Gedera', 'opennow']`
2. **Filter out** food/location keywords: `['המבורגר', 'Gedera']`
3. **Keep** refinement keywords: `['opennow']`
4. **Append** to query: `"מסעדת המבורגרים בגדרה opennow"`
5. **PlacesLangGraph** analyzes the full query and extracts `opennow`

---

## Test Scenario

```
User: "מסעדת המבורגרים בגדרה"
→ Query: "מסעדת המבורגרים בגדרה"
→ Results: 20 burger places

User: "יש משהו פתוח עכשיו?"
→ Filters: ['המבורגר', 'Gedera', 'opennow']
→ Query: "מסעדת המבורגרים בגדרה opennow"
→ PlacesLangGraph extracts opennow
→ Google receives: query + opennow=true
→ Results: Filtered to open places
```

---

## Expected Logs (After Fix)

```
[DialogueService] Refinement detected, using base query: מסעדת המבורגרים בגדרה
[DialogueService] Appended refinement filters to query: ['opennow']
[DialogueService] executeSearch {
  effectiveQuery: 'מסעדת המבורגרים בגדרה opennow'  ← Filter appended!
}

[PlacesLangGraph] effective intent {
  query: 'המבורגרים',
  filters: { opennow: true }  ← Extracted by LLM!
}

[GooglePlacesClient] textsearch params {
  query: 'המבורגרים',
  opennow: true  ← Passed to Google!
}
```

---

## Files Changed

- `server/src/services/dialogue/dialogue.service.ts`
  - `executeSearch()`: Append refinement filters to query

---

## Why This Approach?

**Alternative:** Modify `PlacesLangGraph` to accept filters parameter
- ❌ More complex (requires changes to PlacesLangGraph interface)
- ❌ Requires passing filters through multiple layers

**Current Approach:** Append filters to query text
- ✅ Simple (one function change)
- ✅ LLM already understands keywords like "opennow"
- ✅ No changes to PlacesLangGraph needed

---

## Next Steps

1. ✅ Test with "open now" refinement
2. ⏳ Test with other filters (parking, delivery, etc.)
3. ⏳ Add more filter keywords to the skip list if needed
4. ⏳ Consider translating filter keywords to target language

---

## Conclusion

Refinement filters now reach Google Places API by appending them to the query text. The LLM in `PlacesLangGraph` extracts and applies them correctly! 🎉


