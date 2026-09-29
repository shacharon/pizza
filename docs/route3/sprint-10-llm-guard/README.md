# Sprint 10 — LLM guard

Guards on the search models. These stories may edit only the files named in each story. Do not rewrite Gate2, Intent, or Google.

There is no SQL in this API. Do not add a database.

| # | Story |
|---|--------|
| 1 | [STORY_01_cap_model_strings.md](./STORY_01_cap_model_strings.md) |
| 2 | [STORY_02_search_text_is_data.md](./STORY_02_search_text_is_data.md) |
| 3 | [STORY_03_token_budget.md](./STORY_03_token_budget.md) |
| 4 | [STORY_04_redis_certificate.md](./STORY_04_redis_certificate.md) |
| 5 | [STORY_05_assistant_plain_text.md](./STORY_05_assistant_plain_text.md) |

Run in order. Story 2 sits on the 25-word cut that is already in `truncateWordsForLlm`.

```text
--g2e-agent -1 sprint 10 story 1
```
