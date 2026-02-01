# Gate2 Response Examples (v7)

## Example 1: Arabic Short Query (Food)

**Input Query:** `"طعام"`

**Expected Output:**

```json
{
  "foodSignal": "YES",
  "confidence": 0.9,
  "assistantLanguage": "ar",
  "assistantLanguageConfidence": 0.9,
  "stop": null
}
```

**Explanation:**

- `foodSignal = YES`: "طعام" means "food" in Arabic
- `assistantLanguage = ar`: Arabic script detected
- `stop = null`: Food query, no blocking needed

---

## Example 2: Hebrew Food Query

**Input Query:** `"מסעדות מסביבי"`

**Expected Output:**

```json
{
  "foodSignal": "YES",
  "confidence": 0.95,
  "assistantLanguage": "he",
  "assistantLanguageConfidence": 0.95,
  "stop": null
}
```

**Explanation:**

- `foodSignal = YES`: "restaurants near me" in Hebrew
- `assistantLanguage = he`: Hebrew script detected
- `stop = null`: Food query, no blocking needed

---

## Example 3: Ambiguous Hebrew Query (UNCERTAIN)

**Input Query:** `"מה יש"`

**Expected Output:**

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

**Explanation:**

- `foodSignal = UNCERTAIN`: "what is there" - too vague
- `assistantLanguage = he`: Hebrew script detected
- `stop` object: Blocks search, asks for clarification in Hebrew
- Message: "I'm not sure what you're looking for."
- Question: "What type of food do you want?"

---

## Example 4: Arabic Ambiguous Query (UNCERTAIN)

**Input Query:** `"ماذا هناك"`

**Expected Output:**

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

**Explanation:**

- `foodSignal = UNCERTAIN`: "what is there" in Arabic - too vague
- `assistantLanguage = ar`: Arabic script detected
- Message in Arabic: "I'm not sure what you're looking for."
- Question in Arabic: "What type of food do you want?"

---

## Example 5: Non-Food Query (English)

**Input Query:** `"weather today"`

**Expected Output:**

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

**Explanation:**

- `foodSignal = NO`: Weather is not food-related
- `assistantLanguage = en`: English words detected
- `stop` object: Blocks search, explains this is food search only
- Message explains the issue
- Question asks for clarification

---

## Example 6: Non-Food Query (Arabic)

**Input Query:** `"أخبار"`

**Expected Output:**

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

**Explanation:**

- `foodSignal = NO`: "news" in Arabic - not food-related
- `assistantLanguage = ar`: Arabic script detected
- Message in Arabic: "This doesn't look like a food search."
- Question in Arabic: "Are you looking for restaurants or something else?"

---

## Example 7: Russian Ambiguous Query

**Input Query:** `"что есть"`

**Expected Output:**

```json
{
  "foodSignal": "UNCERTAIN",
  "confidence": 0.5,
  "assistantLanguage": "ru",
  "assistantLanguageConfidence": 0.8,
  "stop": {
    "type": "CLARIFY",
    "reason": "UNCERTAIN_DOMAIN",
    "blocksSearch": true,
    "suggestedAction": "ASK_FOOD",
    "message": "Я не уверен, что вы ищете.",
    "question": "Какую еду вы хотите?"
  }
}
```

**Explanation:**

- `foodSignal = UNCERTAIN`: "what is there" in Russian - ambiguous
- `assistantLanguage = ru`: Cyrillic script detected
- Message in Russian: "I'm not sure what you're looking for."
- Question in Russian: "What type of food do you want?"

---

## Example 8: Mixed Language Query (Rare)

**Input Query:** `"pizza בתל אביב"`

**Expected Output:**

```json
{
  "foodSignal": "YES",
  "confidence": 0.9,
  "assistantLanguage": "he",
  "assistantLanguageConfidence": 0.7,
  "stop": null
}
```

**Explanation:**

- `foodSignal = YES`: Pizza is food, location is in Hebrew
- `assistantLanguage = he`: Hebrew script dominates (despite "pizza" being Latin)
- `assistantLanguageConfidence = 0.7`: Lower confidence due to mixed script
- `stop = null`: Food query, no blocking

---

## Key Validation Rules

1. **Language Consistency:**

   - `message` and `question` MUST be in the detected `assistantLanguage`
   - NEVER output English unless `assistantLanguage = "en"`

2. **Text Length:**

   - `message`: ≤ 2 sentences
   - `question`: Exactly 1 question

3. **Stop Field Logic:**

   - `foodSignal = YES` → `stop = null` (always)
   - `foodSignal = UNCERTAIN` → `stop.type = "CLARIFY"`, `reason = "UNCERTAIN_DOMAIN"`, `suggestedAction = "ASK_FOOD"`
   - `foodSignal = NO` → `stop.type = "GATE_FAIL"`, `reason = "NO_FOOD"`, `suggestedAction = "ASK_DOMAIN"`

4. **Required Fields:**
   - All fields in schema are REQUIRED
   - `stop` is REQUIRED (but can be `null`)
   - `blocksSearch` is always `true` when stop is not null

---

## Testing Checklist

- [ ] Arabic short food query → YES, stop=null
- [ ] Hebrew food query → YES, stop=null
- [ ] Hebrew ambiguous query → UNCERTAIN with Hebrew stop text
- [ ] Arabic ambiguous query → UNCERTAIN with Arabic stop text
- [ ] English non-food → NO with English stop text
- [ ] Arabic non-food → NO with Arabic stop text
- [ ] Russian ambiguous → UNCERTAIN with Russian stop text
- [ ] Mixed language → Detect primary language correctly
