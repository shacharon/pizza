---
name: going2eat-code-review
description: >-
  Code review for Going2Eat Route3. Loaded by --g2e-agent 2.
disable-model-invocation: true
---

# Going2Eat Code Review

Reject if any of these is true:

- Route2 stage files changed without AC
- Graph invents new prompts/schemas
- `ROUTE3_ENABLED` defaults on
- Agent/tools loop instead of named stage nodes
- Flag-off path broken

If the story is marked **UI**, review the Angular diff only. Do not require Route3 flags or Route2 tests.

Approve when:

- Nodes are thin wrappers around existing functions
- Tests cover this story’s slice + Route2 still selected when flag off
- Timeouts/fallbacks still belong to existing stages, not a new LangChain retry policy
