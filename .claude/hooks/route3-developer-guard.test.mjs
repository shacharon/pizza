// Offline tests for the Route3 Developer guard and the Claude permission
// settings (R3-006C-1). Run with:
//   node --test .claude/hooks/route3-developer-guard.test.mjs
// No test runs Git, GitHub, AWS or Docker. The guard only receives command
// text; process tests spawn the guard itself with a JSON payload on stdin.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decide, decideCommand, isProtectedPath, splitCommand } from './route3-developer-guard.mjs';

const HOOKS_DIR = dirname(fileURLToPath(import.meta.url));
const GUARD = join(HOOKS_DIR, 'route3-developer-guard.mjs');
const SETTINGS = join(HOOKS_DIR, '..', 'settings.json');
const DEVELOPER_AGENT = join(HOOKS_DIR, '..', 'agents', 'route3-developer.md');

const bash = (command) => decide({ tool_name: 'Bash', tool_input: { command } });
const edit = (tool, file_path, cwd = 'C:/dev/repo') => decide({ tool_name: tool, tool_input: { file_path }, cwd });

function expectAll(cases, decision, run = bash) {
  for (const input of cases) {
    const result = run(input);
    assert.equal(result.decision, decision, `${JSON.stringify(input)} → ${JSON.stringify(result)}`);
  }
}

test('allows read-only Git, tests and local tooling', () => {
  expectAll([
    'git status',
    'git status --short',
    'git -C server log --oneline -5',
    'git --no-pager diff HEAD~1',
    'git diff --stat 5b3735e HEAD',
    'git rev-parse HEAD',
    'git ls-files server/src',
    'git show HEAD:package.json',
    'git branch',
    'git branch --show-current',
    'git branch -a -v',
    'git remote -v',
    'git stash list',
    'git worktree list',
    'git config --get user.name',
    'git tag --list',
    'git --version',
    'npm test',
    'cd server && npm test',
    'npm run build',
    'npx vitest run',
    'npx tsc --noEmit',
    'node --test tests/a.test.mjs',
    'NODE_ENV=test npm test',
    'timeout 60 npm test',
    'npm test 2>&1 | tail -20',
    'ls -la server/src',
    'cat .gitignore',
    'gh pr view 12',
    'gh pr list --state open',
    'gh pr checks 12',
    'gh api repos/shacharon/pizza',
    'gh api -X GET repos/shacharon/pizza/pulls',
    'gh api --method=GET repos/shacharon/pizza/pulls',
    'gh auth status',
    'gh search prs route3',
    'docker build -t local/test .',
    'docker ps',
  ], 'allow');
});

test('denies Git mutations', () => {
  expectAll([
    'git commit -m "x"',
    'git commit --allow-empty -m x',
    'git push origin feature/route3-r3-006c-1',
    'git push',
    'git push --force origin x',
    'git merge main',
    'git rebase main',
    'git reset --hard HEAD~1',
    'git reset HEAD file',
    'git add .',
    'git checkout -b x',
    'git checkout -- src/a.ts',
    'git switch main',
    'git restore src/a.ts',
    'git stash',
    'git stash pop',
    'git fetch origin',
    'git pull',
    'git tag v1',
    'git branch new-branch',
    'git branch -D old',
    'git worktree add ../x',
    'git cherry-pick abc',
    'git revert abc',
    'git am patch',
    'git apply patch.diff',
    'git clean -fd',
    'git config user.name x',
    'git remote add evil https://x',
    'git remote set-url origin https://x',
    'git update-ref refs/heads/main abc',
    'git gc',
    'git notes add -m x',
    'git -c alias.st=!sh status',
    'git --unknown-option status',
  ], 'deny');
});

test('denies GitHub writes, including PR creation and merge', () => {
  expectAll([
    'gh pr create --base main --head feature/x',
    'gh pr merge 12 --squash',
    'gh pr merge 12 --match-head-commit abc',
    'gh pr comment 12 -b x',
    'gh pr edit 12 --title x',
    'gh pr close 12',
    'gh pr review 12 --approve',
    'gh pr checkout 12',
    'gh api -X POST repos/a/b/pulls',
    'gh api -XPATCH repos/a/b/pulls/1',
    'gh api --method PUT repos/a/b/pulls/1/merge',
    'gh api --method=DELETE repos/a/b/rulesets/1',
    'gh api repos/a/b/issues -f title=x',
    'gh api graphql -F query=@q.graphql',
    'gh api repos/a/b/rulesets --input ruleset.json',
    'gh api repos/a/b/issues --raw-field body=x',
    'gh repo create x',
    'gh release create v1',
    'gh workflow run deploy.yml',
    'gh ruleset create',
    'gh secret set X',
  ], 'deny');
});

test('denies deployments and deploy tooling', () => {
  expectAll([
    'aws ecs update-service --cluster c --service s --force-new-deployment',
    'aws --profile pizza ecs register-task-definition --cli-input-json file://t.json',
    'aws s3 sync dist s3://bucket',
    'aws cloudfront create-invalidation --distribution-id X --paths /*',
    'aws amplify start-job --app-id x --branch-name main --job-type RELEASE',
    'aws sts get-caller-identity',
    'docker push 1.dkr.ecr.eu-north-1.amazonaws.com/food-backend:latest',
    'docker image push x',
    'docker buildx build --push -t x .',
    'docker login',
    'kubectl apply -f x.yaml',
    'terraform apply',
    'cdk deploy',
    'npm publish',
    'origin auth login',
  ], 'deny');
});

test('denies wrapped, prefixed and disguised forms', () => {
  expectAll([
    'GIT_DIR=x git commit -m x',
    'FOO=1 BAR=2 git push',
    'env A=b git commit -m x',
    'timeout 30 git push',
    'nohup git push &',
    'exec git push',
    'sudo git push',
    'time git commit -m x',
    '/usr/bin/git push',
    '"C:\\Program Files\\Git\\bin\\git.exe" push',
    '"git" push',
    "'git' 'push' origin x",
    'GIT push',
    'git.exe commit -m x',
    'git -C . push origin x',
    'git -c push.default=current push',
    'git --no-pager commit -m x',
    'git --git-dir=.x commit -m x',
    'npm test && git push',
    'npm test; git commit -m x',
    'npm test || git push',
    'npm test | git commit -F -',
    'npm test\ngit push',
    '(git push)',
    '{ git push; }',
    'bash -c "git push"',
    "sh -c 'git commit -m x'",
    'pwsh -c "git push"',
    'powershell -Command "git push origin x"',
    'cmd /c git push',
    'node -e "require(\'child_process\').execSync(\'git push\')"',
    'python -c "import os; os.system(\'git push\')"',
    'eval git push',
    'echo $(git push)',
    'echo `git push`',
    'xargs git push',
    'npm exec -- git push',
    'npx -y gh pr create',
    '& git push',
    'G=git; $G push',
    'git commit -m "unclosed',
    'Invoke-Expression "git push"',
  ], 'deny');
});

test('denies shell access to protected paths', () => {
  expectAll([
    'echo {} > .claude/settings.json',
    'echo {} >.claude/settings.local.json',
    'rm -rf .git',
    'cat .git/config',
    'cp x.mjs .claude/hooks/route3-developer-guard.mjs',
    'cp hooks.json .cursor/hooks.json',
    'Set-Content .cursor/hooks/guard.mjs x',
    'node scripts/x.js --out=.git/hooks/pre-push',
  ], 'deny');
});

test('denies edits to protected settings, hooks and Git internals', () => {
  const run = ([tool, path, cwd]) => edit(tool, path, cwd);
  expectAll([
    ['Edit', '.claude/settings.json'],
    ['Write', '.claude/settings.local.json'],
    ['Write', '.claude/hooks/route3-developer-guard.mjs'],
    ['Edit', '.cursor/hooks.json'],
    ['Write', '.cursor/hooks/route3-shell.mjs'],
    ['Edit', '.git/config'],
    ['Write', 'C:\\dev\\piza\\angular-piza\\.git\\hooks\\pre-push'],
    ['Edit', 'src/../.git/HEAD'],
    ['Edit', 'settings.json', 'C:/dev/repo/.claude'],
    ['Write', '.CLAUDE/Settings.JSON'],
    ['NotebookEdit', undefined],
  ], 'deny', run);
  assert.equal(
    decide({ tool_name: 'NotebookEdit', tool_input: { notebook_path: '.git/x.ipynb' } }).decision,
    'deny',
  );
});

test('allows edits to application, test and governance files', () => {
  const run = ([tool, path]) => edit(tool, path);
  expectAll([
    ['Edit', 'server/src/services/search/route3/graph.ts'],
    ['Write', 'server/src/services/search/route3/graph.test.ts'],
    ['Edit', '.gitignore'],
    ['Edit', '.claude/agents/route3-developer.md'],
    ['Edit', '.claude/rules/route3.md'],
    ['Edit', 'docs/route3/shared/PRODUCT.md'],
  ], 'allow', run);
});

test('denies malformed or unexpected payloads', () => {
  for (const payload of [null, undefined, 'x', 42, {}, { tool_name: 'Bash' }, { tool_input: { command: 'ls' } }]) {
    assert.equal(decide(payload).decision, 'deny', JSON.stringify(payload));
  }
  assert.equal(decide({ tool_name: 'Bash', tool_input: {} }).decision, 'deny');
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: '   ' } }).decision, 'deny');
  assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 42 } }).decision, 'deny');
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: 'a' } }).decision, 'deny');
  assert.equal(decide({ tool_name: 'Edit', tool_input: { file_path: '' } }).decision, 'deny');
  assert.equal(decide({ tool_name: 'PowerShell', tool_input: { command: 'git push' } }).decision, 'deny');
});

test('helpers', () => {
  assert.deepEqual(splitCommand('a "b c" && d'), [['a', 'b c'], ['d']]);
  assert.equal(splitCommand('a "b'), null);
  assert.equal(isProtectedPath('a/.gitignore'), false);
  assert.equal(isProtectedPath('a/.git'), true);
  assert.equal(isProtectedPath('C:\\x\\.claude\\hooks'), true);
  assert.equal(isProtectedPath('.claude/agents/x.md'), false);
  assert.equal(decideCommand('npm test').decision, 'allow');
});

// ---------- process level ----------

function runGuard(stdin) {
  return spawnSync(process.execPath, [GUARD], { input: stdin, encoding: 'utf8', timeout: 10_000 });
}

test('process: allowed call exits 0 with no output', () => {
  const result = runGuard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }));
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});

test('process: denied call exits 2 with a reason on stderr', () => {
  const result = runGuard(JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git push origin x' } }));
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Route3 Developer guard blocked this call: git push/);
});

test('process: invalid JSON, empty stdin and non-object payloads exit 2', () => {
  for (const stdin of ['{not json', '', 'null', '[]']) {
    const result = runGuard(stdin);
    assert.equal(result.status, 2, `stdin ${JSON.stringify(stdin)}`);
    assert.match(result.stderr, /Route3 Developer guard blocked this call/);
  }
});

// ---------- configuration ----------

test('settings.json: permissions only, no hooks, bypass mode disabled', () => {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  assert.equal(settings.hooks, undefined, 'settings-level hooks would also run in Cursor');
  assert.deepEqual(Object.keys(settings).filter((k) => k !== '$schema'), ['permissions']);
  const { deny, ask, allow } = settings.permissions;
  assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
  for (const rule of ['Bash(git merge *)', 'Bash(git rebase *)', 'Bash(git reset --hard*)', 'Bash(git push *--force*)', 'Bash(git push * main)', 'Bash(gh api *rulesets* *)']) {
    assert.ok(deny.includes(rule), `deny ${rule}`);
  }
  for (const rule of ['Bash(gh pr merge *)', 'Bash(aws *ecs update-service*)', 'Bash(docker push *)']) {
    assert.ok(ask.includes(rule), `ask ${rule}`);
  }
  assert.deepEqual(allow, ['Bash(gh pr create *)', 'PowerShell(gh pr create *)']);
  for (const list of [deny, ask, allow]) {
    const bashRules = list.filter((r) => r.startsWith('Bash(')).map((r) => r.slice(5));
    const psRules = list.filter((r) => r.startsWith('PowerShell(')).map((r) => r.slice(11));
    assert.deepEqual(psRules, bashRules, 'every Bash rule has a PowerShell twin');
  }
  for (const rule of [...deny, ...ask, ...allow]) {
    assert.ok(!/git (commit|push origin feature)/.test(rule), `parent commit/push must stay possible: ${rule}`);
  }
});

test('developer agent: guard hook with onFailure block, tools unchanged', () => {
  const text = readFileSync(DEVELOPER_AGENT, 'utf8');
  const frontmatter = text.split(/^---$/m)[1];
  assert.match(frontmatter, /^tools: Read, Grep, Glob, Edit, Write, Bash$/m);
  assert.match(frontmatter, /^ {2}PreToolUse:$/m);
  assert.match(frontmatter, /matcher: "Bash\|PowerShell\|Edit\|Write\|NotebookEdit"/);
  assert.match(frontmatter, /args: \["\$\{CLAUDE_PROJECT_DIR\}\/\.claude\/hooks\/route3-developer-guard\.mjs"\]/);
  assert.match(frontmatter, /onFailure: block/);
});
