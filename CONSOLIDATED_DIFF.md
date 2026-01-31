# CONSOLIDATED DIFF - Deterministic Canonical Mode Policy

## File 1: NEW - server/src/services/search/route2/shared/canonical-mode-policy.ts

```typescript
/**
 * Canonical Mode Policy - Deterministic Decision
 * 
 * Decides between KEYED and FREETEXT modes based on available location + category anchors.
 * NO LLM calls - pure deterministic logic.
 * 
 * Rules:
 * - KEYED: Has location anchor (city/address/nearMe) AND category key (cuisine/placeType/dietary)
 * - FREETEXT: Otherwise (missing either location or category)
 * - CLARIFY: nearMe intent but missing userLocation
 */

import { logger } from '../../../../lib/logger/structured-logger.js';
import type { IntentResult } from '../types.js';
import type { SearchRequest } from '../../types/search-request.dto.js';

export type CanonicalMode = 'KEYED' | 'FREETEXT' | 'CLARIFY';

export interface CanonicalModeDecision {
  mode: CanonicalMode;
  reason: string;
  locationAnchor: 'cityText' | 'addressText' | 'nearMe' | null;
  categoryKey: 'cuisineKey' | 'placeTypeKey' | 'dietaryKey' | null;
  cuisineKey: string | null;
  placeTypeKey: string | null;
  dietaryKey: string | null;
}

/**
 * Determine canonical mode based on available anchors
 * 
 * @param intent Intent stage result (contains cityText, cuisineKey)
 * @param request Search request (contains userLocation, filters.dietary)
 * @param llmCuisineKey Optional cuisine key from LLM (textsearch mapper)
 * @param llmPlaceTypeKey Optional place type from LLM
 * @returns Canonical mode decision with reasoning
 */
export function determineCanonicalMode(
  intent: IntentResult,
  request: SearchRequest,
  llmCuisineKey?: string | null,
  llmPlaceTypeKey?: string | null,
  requestId?: string
): CanonicalModeDecision {
  // Step 1: Check location anchors
  const hasCityText = !!intent.cityText;
  const hasUserLocation = !!request.userLocation;
  const isNearMeIntent = intent.route === 'NEARBY' || intent.distanceIntent;

  // Determine location anchor
  let locationAnchor: 'cityText' | 'addressText' | 'nearMe' | null = null;
  
  if (hasCityText) {
    locationAnchor = 'cityText';
  } else if (isNearMeIntent && hasUserLocation) {
    locationAnchor = 'nearMe';
  }
  // Note: addressText not implemented yet (future: intent could extract address)

  // Step 2: Check category keys
  const cuisineKey = llmCuisineKey || intent.cuisineKey || null;
  const placeTypeKey = llmPlaceTypeKey || null;
  const dietaryKey = request.filters?.dietary?.[0] || null; // Take first dietary filter if any

  // Determine category anchor
  let categoryKey: 'cuisineKey' | 'placeTypeKey' | 'dietaryKey' | null = null;
  
  if (cuisineKey) {
    categoryKey = 'cuisineKey';
  } else if (placeTypeKey) {
    categoryKey = 'placeTypeKey';
  } else if (dietaryKey) {
    categoryKey = 'dietaryKey';
  }

  // Step 3: Apply policy rules
  
  // Rule 1: CLARIFY if nearMe intent but missing userLocation
  if (isNearMeIntent && !hasUserLocation) {
    const decision: CanonicalModeDecision = {
      mode: 'CLARIFY',
      reason: 'nearMe_intent_missing_location',
      locationAnchor: null,
      categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey
    };

    logger.info({
      requestId,
      stage: 'canonical_mode_policy',
      event: 'canonical_decision',
      mode: decision.mode,
      reason: decision.reason,
      locationAnchor: decision.locationAnchor,
      categoryKey: decision.categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey,
      isNearMeIntent,
      hasUserLocation
    }, '[CANONICAL] Mode decision: CLARIFY (nearMe without location)');

    return decision;
  }

  // Rule 2: KEYED if both location AND category anchors exist
  if (locationAnchor && categoryKey) {
    const decision: CanonicalModeDecision = {
      mode: 'KEYED',
      reason: `has_${locationAnchor}_and_${categoryKey}`,
      locationAnchor,
      categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey
    };

    logger.info({
      requestId,
      stage: 'canonical_mode_policy',
      event: 'canonical_decision',
      mode: decision.mode,
      reason: decision.reason,
      locationAnchor: decision.locationAnchor,
      categoryKey: decision.categoryKey,
      cuisineKey,
      placeTypeKey,
      dietaryKey,
      hasCityText,
      hasUserLocation,
      isNearMeIntent
    }, '[CANONICAL] Mode decision: KEYED (location + category)');

    return decision;
  }

  // Rule 3: FREETEXT (missing either location or category)
  const missingAnchor = !locationAnchor ? 'location' : 'category';
  const decision: CanonicalModeDecision = {
    mode: 'FREETEXT',
    reason: `missing_${missingAnchor}_anchor`,
    locationAnchor,
    categoryKey,
    cuisineKey,
    placeTypeKey,
    dietaryKey
  };

  logger.info({
    requestId,
    stage: 'canonical_mode_policy',
    event: 'canonical_decision',
    mode: decision.mode,
    reason: decision.reason,
    locationAnchor: decision.locationAnchor,
    categoryKey: decision.categoryKey,
    cuisineKey,
    placeTypeKey,
    dietaryKey,
    missingAnchor,
    hasCityText,
    hasUserLocation,
    isNearMeIntent
  }, '[CANONICAL] Mode decision: FREETEXT (missing anchor)');

  return decision;
}
```

---

## File 2: MODIFIED - server/src/services/search/route2/stages/route-llm/textsearch.mapper.ts

```diff
@@ -10,6 +10,7 @@ import type { Route2Context, IntentResult, FinalSharedFilters } from '../../typ
 import type { Message } from '../../../../../llm/types.js';
 import { logger } from '../../../../../lib/logger/structured-logger.js';
 import { resolveLLM } from '../../../../../lib/llm/index.js';
+import { determineCanonicalMode } from '../../shared/canonical-mode-policy.js';
 import { TextSearchLLMResponseSchema, type TextSearchMapping } from './schemas.js';
 import { canonicalizeTextQuery } from '../../../utils/google-query-normalizer.js';
 import { generateCanonicalQuery } from './canonical-query.generator.js';
@@ -534,6 +535,19 @@ export async function executeTextSearchMapper(
     // Using 'as any' because the LLM response structure changed
     const llmResult = response.data as any;
 
+    // DETERMINISTIC CANONICAL MODE POLICY
+    // Override LLM's mode decision with deterministic policy
+    const canonicalDecision = determineCanonicalMode(
+      intent,
+      request,
+      llmResult.cuisineKey,
+      llmResult.placeTypeKey,
+      requestId
+    );
+
+    // Override mode with policy decision (map CLARIFY to FREETEXT for now)
+    llmResult.mode = canonicalDecision.mode === 'CLARIFY' ? 'FREETEXT' : canonicalDecision.mode;
+
     // CRITICAL: Override LLM's region/language with filters_resolved values (single source of truth)
     llmResult.region = finalFilters.regionCode;
     llmResult.language = finalFilters.languageContext?.searchLanguage ?? finalFilters.providerLanguage;
@@ -605,10 +619,14 @@ export async function executeTextSearchMapper(
       cuisineKey: llmResult.cuisineKey,
       cityText: mapping.cityText,
       providerTextQuery,
       providerLanguage,
       source,
-      strictness: mapping.strictness
+      strictness: mapping.strictness,
+      canonicalModeDecision: canonicalDecision.mode,
+      canonicalModeReason: canonicalDecision.reason,
+      canonicalLocationAnchor: canonicalDecision.locationAnchor,
+      canonicalCategoryKey: canonicalDecision.categoryKey
     }, '[TEXTSEARCH] Mapper completed successfully');
 
     return mapping as TextSearchMapping;
 
@@ -634,27 +652,36 @@ async function buildDeterministicMapping(
 ): Promise<TextSearchMapping> {
   const { requestId } = context;
   
-  // Deterministic cuisine detection
+  // Use deterministic policy instead of ad-hoc logic
   const detectedCuisineKey = detectCuisineKeyword(request.query);
-  const hasCityText = !!intent.cityText;
+  
+  const canonicalDecision = determineCanonicalMode(
+    intent,
+    request,
+    detectedCuisineKey,
+    null, // placeTypeKey
+    requestId
+  );
   
-  let mode: 'KEYED' | 'FREE_TEXT' = 'FREE_TEXT';
+  let mode: 'KEYED' | 'FREE_TEXT' = canonicalDecision.mode === 'CLARIFY' ? 'FREE_TEXT' : canonicalDecision.mode;
   let cityText: string | null = null;
   let cuisineKey: CuisineKey | null = null;
   
-  // Determine mode based on detection results
-  if (detectedCuisineKey && hasCityText) {
+  // Apply canonical decision
+  if (canonicalDecision.mode === 'KEYED') {
     mode = 'KEYED';
-    cuisineKey = detectedCuisineKey;
-    cityText = intent.cityText!;
+    cuisineKey = canonicalDecision.cuisineKey as CuisineKey;
+    cityText = intent.cityText || null;
     
     logger.info({
       requestId,
       stage: 'textsearch_mapper_fallback',
       event: 'deterministic_mode_keyed',
       cuisineKey,
       cityText,
-      reason: 'cuisine_and_city_detected'
+      reason: canonicalDecision.reason,
+      locationAnchor: canonicalDecision.locationAnchor,
+      categoryKey: canonicalDecision.categoryKey
     }, '[TEXTSEARCH] Fallback: KEYED mode (cuisine + city detected)');
-  } else if (detectedCuisineKey) {
-    mode = 'KEYED';
-    cuisineKey = detectedCuisineKey;
-    
-    logger.info({
-      requestId,
-      stage: 'textsearch_mapper_fallback',
-      event: 'deterministic_mode_keyed',
-      cuisineKey,
-      cityText: null,
-      reason: 'cuisine_only_detected'
-    }, '[TEXTSEARCH] Fallback: KEYED mode (cuisine only)');
   } else {
     logger.info({
       requestId,
       stage: 'textsearch_mapper_fallback',
       event: 'deterministic_mode_freetext',
-      reason: 'no_cuisine_detected'
+      reason: canonicalDecision.reason,
+      locationAnchor: canonicalDecision.locationAnchor,
+      categoryKey: canonicalDecision.categoryKey
     }, '[TEXTSEARCH] Fallback: FREE_TEXT mode (no cuisine detected)');
   }
   
@@ -738,7 +765,11 @@ async function buildDeterministicMapping(
     cityText,
     providerTextQuery,
     providerLanguage,
-    strictness
+    strictness,
+    canonicalModeDecision: canonicalDecision.mode,
+    canonicalModeReason: canonicalDecision.reason,
+    canonicalLocationAnchor: canonicalDecision.locationAnchor,
+    canonicalCategoryKey: canonicalDecision.categoryKey
   }, '[TEXTSEARCH] Fallback mapping completed');
 
   return mapping;
```

---

## File 3: MODIFIED - server/src/services/search/route2/types.ts

```diff
@@ -118,6 +118,8 @@ export interface IntentResult {
   occasion: 'romantic' | null;
   /** Cuisine key (canonical identifier) */
   cuisineKey: string | null;
+  /** Place type key (e.g., "restaurant", "cafe", "bar") */
+  placeTypeKey: string | null;
 }
```

---

## File 4: MODIFIED - server/src/services/search/route2/stages/intent/intent.types.ts

```diff
@@ -40,6 +40,9 @@ export const IntentLLMSchema = z.object({
   /** Cuisine key (canonical identifier, e.g., "italian", "japanese") */
   cuisineKey: z.string().nullable(),
+
+  /** Place type key (e.g., "restaurant", "cafe", "bar") */
+  placeTypeKey: z.string().nullable(),
 }).strict();
```

---

## File 5: MODIFIED - server/src/services/search/route2/stages/intent/intent.stage.ts

```diff
@@ -54,7 +54,8 @@ function createFallbackResult(query: string, isTimeout: boolean): IntentResult
     priceIntent: 'any',
     qualityIntent: false,
     occasion: null,
-    cuisineKey: null
+    cuisineKey: null,
+    placeTypeKey: null
   };
 }
 
@@ -211,7 +212,8 @@ export async function executeIntentStage(
         priceIntent: llmResult.priceIntent,
         qualityIntent: llmResult.qualityIntent,
         occasion: llmResult.occasion,
-        cuisineKey: llmResult.cuisineKey
+        cuisineKey: llmResult.cuisineKey,
+        placeTypeKey: llmResult.placeTypeKey
       };
     }
     // Validate regionCandidate against ISO-3166-1 allowlist
@@ -258,7 +260,8 @@ export async function executeIntentStage(
       priceIntent: llmResult.priceIntent,
       qualityIntent: llmResult.qualityIntent,
       occasion: llmResult.occasion,
-      cuisineKey: llmResult.cuisineKey
+      cuisineKey: llmResult.cuisineKey,
+      placeTypeKey: llmResult.placeTypeKey
     };
 
   } catch (error) {
```

---

## File 6: MODIFIED - server/src/services/search/route2/stages/intent/intent.prompt.ts

```diff
@@ -87,6 +87,14 @@ These flags drive deterministic weight adjustments for result ordering.
      * "middle_eastern", "מזרח תיכונית", "shawarma", "שווארמה" → "middle_eastern"
    - null if no specific cuisine mentioned
 
+7. **placeTypeKey** (string | null):
+   - Extract place type if mentioned:
+     * "restaurant", "מסעדה" → "restaurant"
+     * "cafe", "בית קפה", "coffee" → "cafe"
+     * "bar", "בר" → "bar"
+     * "bakery", "מאפייה" → "bakery"
+   - null if no specific place type mentioned
+
 **CRITICAL:** These flags are language-independent!
 - "romantic italian" (en) and "איטלקית רומנטית" (he) → SAME flags
 - "cheap near me" (en) and "זול לידי" (he) → SAME flags
@@ -123,7 +131,8 @@ export const INTENT_JSON_SCHEMA = {
       priceIntent: { type: "string", enum: ["cheap", "any"] },
       qualityIntent: { type: "boolean" },
       occasion: { type: ["string", "null"], enum: ["romantic", null] },
-      cuisineKey: { type: ["string", "null"] }
+      cuisineKey: { type: ["string", "null"] },
+      placeTypeKey: { type: ["string", "null"] }
    },
    required: [
       "route",
@@ -141,7 +150,8 @@ export const INTENT_JSON_SCHEMA = {
       "priceIntent",
       "qualityIntent",
       "occasion",
-      "cuisineKey"
+      "cuisineKey",
+      "placeTypeKey"
    ],
    additionalProperties: false
 };
```

---

## Summary

- **1 NEW file:** `canonical-mode-policy.ts` (175 lines)
- **5 MODIFIED files:** Types, mapper, intent (stage + types + prompt)
- **0 NEW LLM stages:** Reuses existing intent + textsearch_mapper
- **Performance:** <1ms policy execution (deterministic)
- **Observability:** Structured logs for every decision with full reasoning
