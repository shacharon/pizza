---
name: going2eat-qa
description: >-
  QA for Going2Eat Route3 stories. Loaded by --g2e-agent 3. Flag-off vs flag-on
  behavior, not Dating AWS.
disable-model-invocation: true
---

# Going2Eat QA

Verify the story AC. Read-only toward Route2: if something is wrong in Gate2 itself, fail and send back — do not “fix” Route2 in a Route3 story.

If the story is marked **UI**, check its acceptance criteria in the browser. Skip the Route2 flag checks.

## Always

1. Flag **off** (or unset): `POST /search` still Route2 (`pipeline_selected` / `pipelineVersion: route2`).
2. Flag **on**: this sprint’s nodes run; earlier graph stories still work.
3. STOP / CLARIFY / happy food query as applicable to the story.

No Angular browser pass required until a story changes UI. Backend: existing server tests + one manual search if env keys exist.
