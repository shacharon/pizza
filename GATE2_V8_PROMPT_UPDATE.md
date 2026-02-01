# Gate2 v8 Prompt Update Summary

## Changes Made

### Version Update
- **Version**: `gate2_v7` → `gate2_v8`
- **Updated File**: `server/src/services/search/route2/stages/gate2.stage.ts`

### Key Improvements

1. **Clearer Workflow Documentation**
   - Added explicit statement: "You MUST return assistantLanguage + stop in the SAME JSON response"
   - Emphasized: "ONE LLM call = ONE complete JSON output"
   - Numbered workflow steps for clarity

2. **Enhanced Food Signal Rules**
   - Restructured with clear OUTPUT sections for each signal type
   - Added explicit JSON structure examples for each case
   - Added note: Gate2 does NOT handle location detection (MISSING_LOCATION is for Intent stage)

3. **Strengthened Stop Text Generation Rules**
   - Added emphasis: "Generate message + question IN THE SAME JSON response"
   - Clarified: "This is NOT a two-step process"
   - Added rule: "Match the detected assistantLanguage exactly"

4. **Expanded Examples**
   - Added 8 comprehensive examples (was 5)
   - Added numbered examples with descriptive titles
   - Includes: Hebrew, Arabic, English, Russian queries
   - Covers all three signal types (YES, UNCERTAIN, NO)

5. **Stricter Output Rules**
   - Added: "Return COMPLETE JSON in ONE response (assistantLanguage + stop together)"
   - Added: "assistantLanguage detection is REQUIRED (never skip this field)"
   - Clarified: "stop field ALWAYS present (null when YES, object when NO/UNCERTAIN)"

## Updated Prompt Rules Encoded

✅ **Always output JSON matching schema (assistantLanguage + stop)**
- Explicitly stated in CRITICAL section at top
- Reinforced in WORKFLOW section
- Emphasized in STRICT OUTPUT RULES

✅ **assistantLanguage must be detected from userQuery**
- Full detection rules with script matching
- Confidence guidelines (0.9-1.0 for clear, 0.1-0.4 for uncertain)
- "NEVER infer from region or food type"

✅ **If foodSignal=YES → stop=null**
- Documented in FOOD SIGNAL RULES: "OUTPUT: stop = null (NO BLOCKING, search continues)"
- Examples 1-3 demonstrate this

✅ **If foodSignal=NO → stop with GATE_FAIL**
- Full structure documented with type, reason, suggestedAction
- Templates provided for all 6 languages
- Examples 6-8 demonstrate this

✅ **If foodSignal=UNCERTAIN → stop with CLARIFY**
- Full structure documented
- Templates provided for all 6 languages
- Examples 4-5 demonstrate this

✅ **Do NOT output English unless assistantLanguage=en**
- Stated 3 times in prompt:
  1. "✓ NEVER output English unless assistantLanguage='en'" (line 179)
  2. "✓ NEVER output English text unless assistantLanguage='en'" (line 199)
  3. "✓ message/question text MUST match assistantLanguage (NEVER English unless assistantLanguage='en')" (line 285)

✅ **Keep message <= 2 sentences, question exactly 1 question**
- "✓ message: ≤2 sentences explaining issue in assistantLanguage"
- "✓ question: Exactly 1 question in assistantLanguage"
- "✓ message: Maximum 2 sentences"
- "✓ question: Exactly 1 question"

## Example Outputs

### 1. Arabic Short Query (Food - Continue Search)

**Input Query**: `"طعام"`

**Expected Output**:
```json
{
  "foodSignal": "YES",
  "confidence": 0.9,
  "assistantLanguage": "ar",
  "assistantLanguageConfidence": 0.9,
  "stop": null
}
```

**Explanation**: 
- Detects Arabic script → assistantLanguage="ar"
- "طعام" (food) is clear food intent → foodSignal="YES"
- No blocking → stop=null
- Search continues to Intent stage

---

### 2. Hebrew Food Query (Continue Search)

**Input Query**: `"מסעדות מסביבי"`

**Expected Output**:
```json
{
  "foodSignal": "YES",
  "confidence": 0.95,
  "assistantLanguage": "he",
  "assistantLanguageConfidence": 0.95,
  "stop": null
}
```

**Explanation**:
- Detects Hebrew script → assistantLanguage="he"
- "מסעדות מסביבי" (restaurants near me) is clear food + proximity → foodSignal="YES"
- No blocking → stop=null
- Search continues to Intent stage

---

### 3. Ambiguous Non-Food Query (Block with Clarification)

**Input Query**: `"מה יש"` (Hebrew: "what's there")

**Expected Output**:
```json
{
  "foodSignal": "UNCERTAIN",
  "confidence": 0.5,
  "assistantLanguage": "he",
  "assistantLanguageConfidence": 0.8,
  "stop": {
    "type": "CLARIFY",
    "reason": "UNCERTAIN_DOMAIN",
    "blocksSearch": true,
    "suggestedAction": "ASK_FOOD",
    "message": "אני לא בטוח מה אתה מחפש.",
    "question": "איזה סוג אוכל אתה רוצה?"
  }
}
```

**Explanation**:
- Detects Hebrew script → assistantLanguage="he"
- "מה יש" is generic/ambiguous → foodSignal="UNCERTAIN"
- Generates stop object with Hebrew text matching assistantLanguage
- message: "I'm not sure what you're looking for." (in Hebrew)
- question: "What type of food do you want?" (in Hebrew)
- blocksSearch=true → Pipeline stops at Gate2, returns early

---

### 4. Arabic Ambiguous Query (Block with Clarification)

**Input Query**: `"ماذا هناك"` (Arabic: "what's there")

**Expected Output**:
```json
{
  "foodSignal": "UNCERTAIN",
  "confidence": 0.5,
  "assistantLanguage": "ar",
  "assistantLanguageConfidence": 0.85,
  "stop": {
    "type": "CLARIFY",
    "reason": "UNCERTAIN_DOMAIN",
    "blocksSearch": true,
    "suggestedAction": "ASK_FOOD",
    "message": "لست متأكداً مما تبحث عنه.",
    "question": "ما نوع الطعام الذي تريده؟"
  }
}
```

**Explanation**:
- Detects Arabic script → assistantLanguage="ar"
- Generic query → foodSignal="UNCERTAIN"
- Stop text generated in Arabic (NOT English)
- message: "I'm not sure what you're looking for." (in Arabic)
- question: "What type of food do you want?" (in Arabic)

---

### 5. English Non-Food Query (Block with Gate Fail)

**Input Query**: `"weather"`

**Expected Output**:
```json
{
  "foodSignal": "NO",
  "confidence": 0.95,
  "assistantLanguage": "en",
  "assistantLanguageConfidence": 0.9,
  "stop": {
    "type": "GATE_FAIL",
    "reason": "NO_FOOD",
    "blocksSearch": true,
    "suggestedAction": "ASK_DOMAIN",
    "message": "This doesn't look like a food search.",
    "question": "Are you looking for restaurants or something else?"
  }
}
```

**Explanation**:
- Detects English words → assistantLanguage="en"
- "weather" is NOT food-related → foodSignal="NO"
- Stop text in English (because assistantLanguage="en")
- suggestedAction="ASK_DOMAIN" (not ASK_FOOD, since query is clearly non-food)

---

### 6. Arabic Non-Food Query (Block with Gate Fail)

**Input Query**: `"أخبار"` (Arabic: "news")

**Expected Output**:
```json
{
  "foodSignal": "NO",
  "confidence": 0.9,
  "assistantLanguage": "ar",
  "assistantLanguageConfidence": 0.85,
  "stop": {
    "type": "GATE_FAIL",
    "reason": "NO_FOOD",
    "blocksSearch": true,
    "suggestedAction": "ASK_DOMAIN",
    "message": "هذا لا يبدو كبحث عن طعام.",
    "question": "هل تبحث عن مطاعم أم شيء آخر؟"
  }
}
```

**Explanation**:
- Detects Arabic script → assistantLanguage="ar"
- "أخبار" (news) is NOT food → foodSignal="NO"
- Stop text in Arabic matching assistantLanguage
- message: "This doesn't look like a food search." (in Arabic)
- question: "Are you looking for restaurants or something else?" (in Arabic)

---

## Downstream Changes (Next Step)

The prompt now generates complete responses, but orchestrator validation remains:

### Current State ✅
- Gate2 LLM returns `assistantLanguage` + `stop` in same response
- Schema enforces both fields are required
- Orchestrator already uses `gate.stop` directly (no fallback generation)

### Future Enforcement 🔧
- Remove any remaining fallback assistant text generation hooks
- Ensure all paths use Gate2 LLM text exclusively
- Already largely enforced per `GATE2_ENFORCEMENT.md`

---

## Testing Validation

Test each scenario:

1. ✅ **Hebrew food query** → Continue (stop=null)
2. ✅ **Arabic short food query** → Continue (stop=null)
3. ✅ **English food query** → Continue (stop=null)
4. ✅ **Hebrew ambiguous** → CLARIFY with Hebrew text
5. ✅ **Arabic ambiguous** → CLARIFY with Arabic text
6. ✅ **English non-food** → GATE_FAIL with English text
7. ✅ **Arabic non-food** → GATE_FAIL with Arabic text
8. ✅ **Russian non-food** → GATE_FAIL with Russian text

### Validation Checklist
- [ ] assistantLanguage always present
- [ ] stop always present (null or object)
- [ ] When blocking: message + question in assistantLanguage
- [ ] NO English text when assistantLanguage ≠ "en"
- [ ] message ≤ 2 sentences
- [ ] question = exactly 1 question
- [ ] JSON validates against schema
- [ ] No 400 errors from strict schema

---

**Status**: ✅ Complete  
**Prompt Version**: gate2_v8  
**Schema Version**: Unchanged (already includes MISSING_LOCATION)  
**Backwards Compatible**: Yes (orchestrator already supports this pattern)
