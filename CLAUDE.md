# Going2Eat — project rules for Claude

Going2Eat (app.going2eat.food) is an **LLM-first, multilingual (he/en/ar/ru) food search**: the user types what they want, a model understands it, Google Places finds places, and the app offers navigate / call / order (Wolt, 10bis, Mishloha).

## Repo map
| Path | What |
|---|---|
| `llm-angular/src/app/` | Angular 19 frontend (the only frontend code) |
| `server/src/` | Node + TypeScript + Express 5 backend |
| `server/src/services/search/route2/` | Current production search pipeline (v1, **legacy**) |
| `server/src/graph/` | New LangGraph.js search engine (v2) — all new search work |
| `documentation/` | Current docs (01 product … 06 tech debt). Trust these over `docs/`, `new-docs/` and root `*.md` files, which are often stale |
| `documentation/features/<slug>/` | Vibe-pipeline artifacts per feature |
| `.claude/agents/`, `.claude/skills/` | Vibe pipeline: product-designer → architect → architecture-reviewer → developer → code-reviewer (`/vibe-pipeline`) |

## Commands
```bash
# backend
cd server && npm run dev                                  # needs .env with JWT_SECRET >= 32 chars
cd server && npx tsc --noEmit -p .                        # typecheck (0 errors today — keep it)
cd server && node --test --import tsx <file.test.ts>      # run specific tests

# frontend
cd llm-angular && npm start                               # :4200 with proxy
cd llm-angular && npx tsc --noEmit -p tsconfig.app.json   # typecheck (0 errors today — keep it)
cd llm-angular && npx jest <spec> --reporters=default     # run specific specs (don't rewrite tracked reports/)
```
The full test suites are largely red today. Run the tests you touch; never make the count of passing tests go down.

## Hard boundaries
1. **Never edit `llm-angular/src/` outside `llm-angular/src/app/`** — it is a stale copy of the backend, scheduled for deletion.
2. **No new features in `route2/`** — bug fixes only when explicitly asked. New search work goes in `server/src/graph/`.
3. **Never commit, push, deploy, or touch AWS** unless the owner explicitly asks in this conversation.
4. **Never write secrets, API keys, real user queries, session ids or coordinates** into code, tests, fixtures, docs or commit messages.
5. **Never install or upgrade packages** unless the task explicitly lists the command.
6. Don't add new `.md` "fix summary" files at the repo root or in source folders. Docs go in `documentation/`.

## Product decisions (owner — design within them)
- LLM-first: every query is understood by a model; no rule-based fast path, no cache of parsed queries, no silent guessing.
- Results before words: AI text never delays results.
- Clarification offers choices and resumes the same search.
- Multilingual + RTL everywhere; mobile first.

## Engineering defaults
- SOLID/OOP with a composition root and constructor injection (`solid-oop` skill).
- TypeScript strict, zod at every boundary, no new `any`, no `console.log` in app code.
- Every external call: timeout + `AbortSignal` + typed error.
- Skills: `solid-oop`, `node-backend`, `angular-frontend`, `ai-agentic`, `langgraph`, `testing`, `security-privacy`, `product-ux`.
