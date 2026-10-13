# Route3 Cursor hooks (R3-006C-2)

Cursor 3.23 project hooks that implement the approved R3-006C policy table.
`.cursor/hooks.json` registers three hooks. All of them use `failClosed: true`:
a crash, a timeout or invalid output blocks the action.

| Event | Script | Runs on | Decisions |
|---|---|---|---|
| `beforeShellExecution` | `route3-shell-guard.mjs` | every shell command | allow / ask / deny |
| `beforeMCPExecution` | `route3-mcp-guard.mjs` | every MCP tool (the only MCP hook) | allow / deny |
| `preToolUse` (`^(Write\|Delete)$`) | `route3-edit-guard.mjs` | Write and Delete tool calls | allow / deny |

Tests: `node --test ".cursor/hooks/*.test.mjs"`. They use fake hook payloads
only, including the UTF-8 byte order mark that Cursor on Windows puts before
the JSON. No Git, gh, MCP, AWS or Docker command runs. While the hooks are
off, the config test reads `.cursor/hooks.off.json`.

## Changing these files

The edit guard denies Write and Delete on `.cursor/hooks.json`,
`.cursor/hooks/**`, `.claude/settings*.json`, `.claude/hooks/**` and `.git/**`.
To change a hook, the owner turns hooks off in Cursor Settings → Hooks (or
edits the files outside Cursor), in a Story that owns that change.

## Enforced

- **Shell, for commands that start with git, gh, aws, docker or origin**,
  including commands behind env prefixes, `timeout`/`nice`/`nohup`/`command`/`&`,
  quoting, case changes and full paths (`git.exe`, `C:\...\git.cmd`):
  - git reads, `fetch` and `add` are allowed.
  - `git commit`, `switch`, `checkout`, `branch <new>` and `worktree add/remove` ask.
  - `git push <remote> <feature-branch>` asks. A push without an explicit
    refspec, to `main`/`master`/`HEAD`, or with force, `+`, delete, mirror,
    tags, all or any other flag is denied.
  - merge, pull, rebase, reset, cherry-pick, revert, am, stash (except list),
    tag, branch delete, clean, gc, prune, update-ref, filter-branch, restore,
    config writes and remote changes are denied, as are unknown subcommands.
  - git options and environment variables that run a program (`-c`,
    `--config-env`, `--exec-path`, `--git-dir`, `--work-tree`, `--ext-diff`,
    `--upload-pack`, `GIT_*`, `PAGER`, `EDITOR` …) are denied.
  - `gh pr view/list/diff/checks/status`, `gh auth status`, GET-only `gh api`
    and `gh pr create` are allowed. `gh pr merge <N> --match-head-commit <SHA>`
    asks. Any other merge, `--admin`, `gh api` writes and other `gh` commands
    are denied.
  - aws deploys (`ecs update-service/register-task-definition`, `s3
    sync/cp/rm`, `cloudfront create-invalidation`, `amplify start-job`,
    `ecr put-*`) and `docker push` ask. aws `describe-/list-/get-`, `logs`
    reads, `sts get-caller-identity`, `docker build/images/ps` are allowed.
    Everything else is denied.
  - `origin auth status` is allowed; other origin CLI commands are denied.
  - `bash -c`, `cmd /c`, `pwsh -c`, `node -e`, `python -c`, `npx`, `xargs`,
    `wsl` … are denied when the command names git, gh, aws, docker or origin.
    `eval`, `iex`, `Invoke-Expression`, `Start-Process` are always denied.
    Command substitution, backticks and variable program names next to those
    words are denied.
  - Compound commands take the strictest decision of their parts.
- **MCP**: Origin reads and `create_pull_request`; the GitKraken read-only
  list; Atlassian `get*`/`search*`. Everything else, every other server
  (including `cursor-ide-browser`) and any payload without a server name is
  denied. Origin `merge_pull_request` is always denied.
- **Write/Delete tools** on the protected paths above are denied.
- **GitHub `block-auto`** (server side, unchanged): no direct push, force
  push or deletion of `main`; changes reach `main` only through a PR.

## Instruction-only or not covered

- **Developer versus parent.** Cursor hook data carries no subagent identity,
  so the same rules apply to every session. "Developer must not commit, push
  or open PRs" stays an instruction. Commit and push only ask, and
  `gh pr create` / Origin `create_pull_request` are allowed for everyone.
- **Ask is a pause, not an approval check.** The merge and deploy prompts do
  not verify that the owner approved this PR or deploy. Whoever clicks
  "allow" decides.
- **Shell writes** (`>`, `Set-Content`, `Remove-Item`, `cp`) to protected
  files are not checked. Only the Write and Delete tools are.
- **Code that hides the command**: scripts on disk, `npm run`, an encoded or
  generated string in `node -e`/`python -c` without the words git, gh, aws,
  docker or origin, a bash `$var` program name, and GUI actions (Source
  Control panel, terminal typed by the user) are not seen by these rules.
- **Governance files** (`CLAUDE.md`, `.claude/rules/**`, `.cursor/rules/**`,
  `.claude/agents/**`, `.cursor/agents/**`, `docs/route3/**`) are editable
  by design.
- **Pushing a tag by name** (`git push origin v1`) asks like a branch push,
  because a name alone does not tell a tag from a branch.

## Not verified yet (R3-006C-3)

- Whether these hooks fire inside Cursor subagents.
- Whether `beforeMCPExecution` covers every MCP server, including Origin and
  the GitKraken extension, and the exact `mcp_server_name` values.
- Which `tool_input` field carries the Write/Delete path. The edit guard
  checks every path-like field and denies when none is found.
- Whether `failClosed` applies to `preToolUse`.
- Whether Origin `create_pull_request` targets origin.cursor.com only.

## Deviations and owner decisions

- **No matcher on `beforeShellExecution`.** The design listed a matcher. The
  guard runs on every command instead, because a regex on the raw command
  can miss `G^it`, `g"i"t` or full paths. Commands without git, gh, aws,
  docker or origin are allowed, so the result matches the table.
- **Deploys from Cursor need `docker login` and `aws ecs wait`.** The table
  denies both ("other docker", "other aws"), so the deploy skill cannot run
  end to end from a Cursor agent. Owner decision.
- **`aws ... get-*` is allowed by the table**, which includes reading secrets
  (`secretsmanager get-secret-value`, `ssm get-parameter --with-decryption`).
  Owner decision.
- Cursor also imports `.claude/settings*.json` hooks while third-party hook
  import is on. That is existing behaviour and unchanged here.
