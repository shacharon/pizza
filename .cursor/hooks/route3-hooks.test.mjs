// Offline tests for the Route3 Cursor hooks (R3-006C-2).
// Run: node --test ".cursor/hooks/*.test.mjs"
// Only fake hook payloads are used. No Git, gh, MCP, AWS or Docker command runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decideCommand } from './route3-shell-guard.mjs';
import { decide as decideMcp } from './route3-mcp-guard.mjs';
import { decide as decideEdit } from './route3-edit-guard.mjs';
import { isProtectedPath, parsePayload, strictest, allow, ask, deny } from './route3-common.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

function expectShell(permission, commands) {
  for (const command of commands) {
    assert.equal(decideCommand(command).permission, permission, `${command} → expected ${permission}, got ${JSON.stringify(decideCommand(command))}`);
  }
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const withBom = (text) => Buffer.concat([BOM, Buffer.from(text, 'utf8')]);

function runScript(script, stdin) {
  return spawnSync(process.execPath, [join(here, script)], { input: stdin, encoding: 'utf8' });
}

// ---------- hooks.json ----------

// The owner disables the hooks by renaming hooks.json to hooks.off.json.
const configPath = ['hooks.json', 'hooks.off.json']
  .map((name) => join(repoRoot, '.cursor', name))
  .find((path) => existsSync(path));

test('hooks.json registers exactly the three Route3 hooks, all fail-closed', () => {
  assert.ok(configPath, 'found .cursor/hooks.json or .cursor/hooks.off.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  assert.equal(config.version, 1);
  assert.deepEqual(Object.keys(config.hooks).sort(), ['beforeMCPExecution', 'beforeShellExecution', 'preToolUse']);
  for (const [event, entries] of Object.entries(config.hooks)) {
    assert.equal(entries.length, 1, `${event} has one entry`);
    assert.equal(entries[0].failClosed, true, `${event} is failClosed`);
    assert.ok(entries[0].timeout > 0, `${event} has a timeout`);
  }
  assert.match(config.hooks.beforeShellExecution[0].command, /route3-shell-guard\.mjs$/);
  assert.match(config.hooks.beforeMCPExecution[0].command, /route3-mcp-guard\.mjs$/);
  assert.match(config.hooks.preToolUse[0].command, /route3-edit-guard\.mjs$/);
  assert.equal(config.hooks.beforeShellExecution[0].matcher, undefined, 'shell guard runs on every command');
  assert.equal(config.hooks.beforeMCPExecution[0].matcher, undefined, 'MCP guard runs on every tool');
  const editMatcher = new RegExp(config.hooks.preToolUse[0].matcher);
  for (const tool of ['Write', 'Delete']) assert.ok(editMatcher.test(tool), `matcher covers ${tool}`);
  for (const tool of ['Shell', 'Read', 'MCP:git_Delete_branch', 'MCP:Write_page', 'Task']) assert.ok(!editMatcher.test(tool), `matcher skips ${tool}`);
  // No MCP:.* preToolUse duplicate of the MCP hook.
  assert.ok(!/MCP/.test(config.hooks.preToolUse[0].matcher));
});

// ---------- shell: policy table ----------

test('shell: non-sensitive commands are allowed', () => {
  expectShell('allow', [
    'npm test', 'node --test .cursor/hooks/', 'Get-ChildItem -Force', 'rg -n foo src',
    '$f = "C:\\tmp\\x.txt"; Get-Content $f', '$s = Get-Content a.json -Raw | ConvertFrom-Json',
    'node -e "console.log(1)"', 'echo digit',
  ]);
});

test('shell: git read-only rows are allowed', () => {
  expectShell('allow', [
    'git status', 'git status --short', 'git diff', 'git diff --stat a b', 'git log --oneline -5',
    'git show HEAD:file.md', 'git rev-parse HEAD', 'git ls-files', 'git ls-tree -r --name-only HEAD',
    'git blame x.ts', 'git describe --tags', 'git merge-base --is-ancestor a b', 'git cat-file -t abc',
    'git fetch origin', 'git fetch origin feature/x', 'git remote -v', 'git remote',
    'git config --get user.name', 'git config --get-regexp ^alias\\.', 'git config --list',
    'git branch', 'git branch -a', 'git branch --show-current', 'git branch -r --contains abc123',
    'git branch --list "feat*"', 'git worktree list', 'git stash list', 'git add file.ts', 'git add -A',
    'git -C ../repo status', 'git --no-pager log', 'git.exe status', '& git status',
    "& 'C:\\Program Files\\Git\\bin\\git.exe' status", 'git --version',
  ]);
});

test('shell: git commit, branch switch, new branch and worktree add/remove ask', () => {
  expectShell('ask', [
    'git commit -m "feat: x"', 'git commit --allow-empty -m x', 'git -C ../repo commit -m x',
    'git switch feature/x', 'git switch -c feature/x', 'git checkout feature/x', 'git checkout -b feature/x',
    'git branch feature/new', 'git branch feature/new cc53313',
    'git worktree add ../wt -b feature/x', 'git worktree remove ../wt',
  ]);
});

test('shell: git push to an explicit feature branch asks', () => {
  expectShell('ask', [
    'git push origin feature/route3-r3-006c-2', 'git push -u origin feature/x', 'git push --set-upstream origin feature/x',
    'git push origin HEAD:feature/x', 'git push origin HEAD:refs/heads/feature/x', 'git push origin feature/x --dry-run',
    'git push -uv origin feature/x', 'git push origin feature/a feature/b',
  ]);
});

test('shell: push without refspec, to main/HEAD, force, delete, mirror, tags or all is denied', () => {
  expectShell('deny', [
    'git push', 'git push origin', 'git push origin main', 'git push origin HEAD:main', 'git push origin HEAD:refs/heads/main',
    'git push origin Main', 'git push origin master', 'git push origin HEAD', 'git push origin @', 'git push origin feature/x:main',
    'git push --force origin feature/x', 'git push -f origin feature/x', 'git push -uf origin feature/x',
    'git push --force-with-lease origin feature/x', 'git push --force-if-includes origin feature/x', 'git push origin +feature/x',
    'git push --delete origin feature/x', 'git push -d origin feature/x', 'git push origin :feature/x',
    'git push --mirror origin', 'git push --tags origin', 'git push origin --tags', 'git push --all origin',
    'git push origin refs/tags/v1', 'git push origin "feature/*"', 'git push --repo=origin feature/x',
    'git push --receive-pack=evil origin feature/x', 'git push --prune origin feature/x', 'git push origin feature/x --follow-tags',
  ]);
});

test('shell: dangerous git mutations are denied', () => {
  expectShell('deny', [
    'git merge feature/x', 'git pull', 'git pull origin main', 'git rebase main', 'git reset --hard', 'git reset HEAD~1',
    'git cherry-pick abc', 'git revert abc', 'git am patch', 'git tag v1', 'git tag -l', 'git branch -d x', 'git branch -D x',
    'git branch --delete x', 'git branch -m old new', 'git branch -f x', 'git branch --set-upstream-to=origin/x',
    'git clean -fd', 'git gc', 'git prune', 'git update-ref refs/heads/main abc', 'git filter-branch', 'git restore .',
    'git stash', 'git stash pop', 'git stash drop', 'git worktree prune', 'git worktree move a b',
    'git config user.name x', 'git config --global core.editor vim', 'git config user.name evil --get', 'git config user.name --get',
    'git config --replace-all user.name evil --get', 'git remote add evil url', 'git remote set-url origin url',
    'git remote remove origin', 'git remote get-url origin', 'git switchx', 'git ls-remote origin', 'git notes add',
  ]);
});

test('shell: git options and environment that run programs are denied', () => {
  expectShell('deny', [
    'git -c core.fsmonitor=calc.exe status', 'git -ccore.pager=calc log', 'git --config-env=core.pager=X log',
    'git --exec-path=. status', 'git --git-dir=../x/.git status', 'git --work-tree=.. status',
    'git diff --ext-diff', 'git fetch --upload-pack=calc origin', 'git grep -Ocalc x',
    'GIT_EXTERNAL_DIFF=calc git diff', 'env GIT_PAGER=calc git log', 'PAGER=calc git log',
    '$env:GIT_PAGER="calc"; git log', 'Set-Item Env:GIT_EXTERNAL_DIFF calc.exe; git diff',
    "[Environment]::SetEnvironmentVariable('GIT_PAGER','calc','Process'); git log", 'export GIT_PAGER=calc; git log',
    'setx GIT_PAGER calc && git log', 'git --unknown-option status',
  ]);
});

test('shell: gh read-only rows and PR creation are allowed', () => {
  expectShell('allow', [
    'gh pr view 12', 'gh pr view 12 --json headRefOid', 'gh pr list', 'gh pr diff 12', 'gh pr checks 12', 'gh pr status',
    'gh auth status', 'gh api repos/o/r/rulesets', 'gh api repos/o/r -X GET', 'gh api --method GET repos/o/r', 'gh --version',
    'gh pr create --base main --head feature/x --title t --body b', 'gh pr create --fill',
  ]);
});

test('shell: gh pr merge with --match-head-commit asks; without it, or other gh writes, is denied', () => {
  expectShell('ask', [
    'gh pr merge 12 --match-head-commit cc53313805d16f63cc71e33a725c685900d8355f',
    'gh pr merge 12 --squash --match-head-commit=cc53313', 'gh pr merge --match-head-commit cc53313 12 --delete-branch',
  ]);
  expectShell('deny', [
    'gh pr merge 12', 'gh pr merge 12 --squash', 'gh pr merge 12 --match-head-commit', 'gh pr merge 12 --match-head-commit nothex!',
    'gh pr merge feature/x --match-head-commit cc53313', 'gh pr merge 12 --admin --match-head-commit cc53313',
    'gh pr merge 12 13 --match-head-commit cc53313', 'gh api -X PUT repos/o/r/pulls/12/merge', 'gh api repos/o/r/pulls/12/merge -f sha=abc',
    'gh api --method=PUT repos/o/r/pulls/12/merge', 'gh api repos/o/r/rulesets --input x.json', 'gh api -XPATCH repos/o/r',
    'gh pr edit 12', 'gh pr close 12', 'gh pr reopen 12', 'gh pr review 12 --approve', 'gh pr checkout 12', 'gh pr comment 12 -b x',
    'gh repo delete o/r', 'gh ruleset list', 'gh secret set X', 'gh release create v1', 'gh workflow run x', 'gh issue create',
    'gh -R o/r pr merge 12 --match-head-commit cc53313', 'gh',
  ]);
});

test('shell: aws deploys and docker push ask; aws and docker reads are allowed; the rest is denied', () => {
  expectShell('ask', [
    'aws ecs update-service --cluster c --service s --force-new-deployment', 'aws ecs register-task-definition --cli-input-json file://t.json',
    'aws s3 sync dist s3://b', 'aws s3 cp a s3://b/a', 'aws s3 rm s3://b/a', 'aws cloudfront create-invalidation --distribution-id X --paths "/*"',
    'aws amplify start-job --app-id a --branch-name main --job-type RELEASE', 'aws ecr put-image --repository-name r',
    'aws --profile pizza --region eu-north-1 ecs update-service --cluster c --service s',
    'docker push repo/img:tag', 'docker image push repo/img:tag', 'docker build --push -t x .',
  ]);
  expectShell('allow', [
    'aws sts get-caller-identity --profile pizza', 'aws logs filter-log-events --log-group-name /ecs/x', 'aws logs tail /ecs/x',
    'aws logs describe-log-groups', 'aws ecs describe-services --cluster c --services s', 'aws amplify list-jobs --app-id a --branch-name main',
    'aws --no-cli-pager ecs list-clusters',
    'docker build -f Dockerfile -t repo/img:tag .', 'docker images', 'docker ps',
  ]);
  expectShell('deny', [
    'aws ecs delete-service --cluster c --service s', 'aws s3 ls', 'aws s3 mv a s3://b',
    'aws logs delete-log-group --log-group-name x', 'aws iam create-user --user-name x', 'aws --weird-flag ecs list-clusters',
    'docker rm x', 'docker run x', 'docker buildx build --push .', 'docker --context x push img',
  ]);
});

// ---------- B2: AWS reads are an explicit allow list ----------

test('B2: secret-bearing AWS operations are denied or need approval', () => {
  expectShell('deny', [
    'aws secretsmanager get-secret-value --secret-id prod/db', 'aws --profile pizza secretsmanager get-secret-value --secret-id x',
    'aws secretsmanager list-secrets', 'aws secretsmanager describe-secret --secret-id x', 'aws secretsmanager batch-get-secret-value --secret-id-list x',
    'aws ssm get-parameter --name /app/key --with-decryption', 'aws ssm get-parameters --names a b --with-decryption',
    'aws ssm get-parameters-by-path --path /app --with-decryption --recursive', 'aws ssm get-parameter --name /app/key',
    'aws sts get-session-token', 'aws sts assume-role --role-arn x --role-session-name y', 'aws sts get-federation-token --name x',
    'aws kms decrypt --ciphertext-blob x', 'aws iam list-access-keys', 'aws iam get-user', 'aws ec2 describe-instances',
    'aws lambda get-function --function-name x', 'aws s3api get-object --bucket b --key k out', 'aws rds describe-db-instances',
    'aws configure get aws_secret_access_key', 'aws configure export-credentials', 'aws ecs wait tasks-stopped --cluster c',
    'aws ecs wait', 'aws ecs', 'aws',
  ]);
  expectShell('ask', [
    'aws ecr get-login-password --region eu-north-1 --profile pizza',
    'aws ecs describe-task-definition --task-definition food-backend:12 --query taskDefinition --output json',
  ]);
});

test('B2: CloudWatch, ECS, Amplify and other status reads stay allowed', () => {
  expectShell('allow', [
    'aws sts get-caller-identity --profile pizza --region eu-north-1',
    'aws logs filter-log-events --log-group-name /ecs/food-backend --start-time 1', 'aws logs tail /ecs/food-backend --since 1h',
    'aws logs get-log-events --log-group-name g --log-stream-name s', 'aws logs describe-log-streams --log-group-name /ecs/food-backend',
    'aws logs start-query --log-group-name g --start-time 1 --end-time 2 --query-string "fields @message"',
    'aws logs get-query-results --query-id q', 'aws ecs describe-services --cluster c --services s --profile pizza',
    'aws ecs describe-tasks --cluster c --tasks t', 'aws ecs list-tasks --cluster c', 'aws ecs list-task-definitions --family-prefix food',
    'aws amplify list-jobs --app-id a --branch-name main', 'aws amplify get-job --app-id a --branch-name main --job-id 3',
    'aws amplify get-app --app-id a', 'aws ecr describe-images --repository-name food-backend', 'aws ecr list-images --repository-name r',
    'aws cloudfront get-invalidation --distribution-id D --id I', 'aws cloudwatch get-metric-statistics --namespace AWS/ECS',
    'aws elbv2 describe-target-health --target-group-arn x', 'aws ECS describe-services --cluster c --services s',
  ]);
});

// ---------- B3: the deploy workflow ----------

test('B3: every step of the deploy skill runs, with approval on credentials and mutations', () => {
  const registry = '123456789012.dkr.ecr.eu-north-1.amazonaws.com';
  const steps = [
    ['allow', 'aws sts get-caller-identity --profile pizza --region eu-north-1'],
    ['ask', `aws ecr get-login-password --region eu-north-1 --profile pizza | docker login --username AWS --password-stdin ${registry}`],
    ['allow', `docker build -f server/Dockerfile -t ${registry}/food-backend:abc123 -t ${registry}/food-backend:latest .`],
    ['allow', `docker tag ${registry}/food-backend:abc123 ${registry}/food-backend:latest`],
    ['ask', `docker push ${registry}/food-backend:abc123`],
    ['ask', `docker push ${registry}/food-backend:latest`],
    ['ask', 'aws ecs describe-task-definition --task-definition food-backend:12 --region eu-north-1 --profile pizza --query taskDefinition --output json | Out-File -Encoding utf8 $env:USERPROFILE\\task-def-raw.json'],
    ['ask', 'aws ecs register-task-definition --cli-input-json "file://$env:USERPROFILE/task-def-new.json" --region eu-north-1 --profile pizza'],
    ['ask', 'aws ecs update-service --cluster food-cluster --service food-backend-service --task-definition food-backend:13 --force-new-deployment --region eu-north-1 --profile pizza'],
    ['allow', 'aws ecs wait services-stable --cluster food-cluster --services food-backend-service --region eu-north-1 --profile pizza'],
    ['allow', 'aws ecs describe-services --cluster food-cluster --services food-backend-service --region eu-north-1 --profile pizza'],
    ['allow', 'aws amplify list-jobs --app-id d1abc --branch-name main --region eu-north-1 --profile pizza'],
    ['ask', 'aws s3 sync dist/ s3://bucket --delete'],
    ['ask', 'aws cloudfront create-invalidation --distribution-id D --paths "/*"'],
  ];
  for (const [permission, command] of steps) expectShell(permission, [command]);

  const login = decideCommand(steps[1][1]);
  assert.match(login.reason, /get-login-password/);
  assert.match(login.reason, /docker login/);
});

test('B3: docker login only with --password-stdin; docker tag is allowed', () => {
  expectShell('ask', ['docker login --username AWS --password-stdin r.example', 'docker login -u AWS --password-stdin r.example']);
  expectShell('deny', [
    'docker login -u AWS -p secret r.example', 'docker login --password secret r.example', 'docker login --password=secret r.example',
    'docker login -psecret r.example', 'docker login r.example', 'docker logout r.example',
  ]);
  expectShell('allow', ['docker tag a:1 b:1', 'docker image tag a:1 b:1']);
});

test('shell: origin CLI allows only auth status', () => {
  expectShell('allow', ['origin auth status']);
  expectShell('deny', ['origin repo create x', 'origin push', 'origin']);
});

// ---------- shell: bypass forms ----------

test('shell: wrappers and code runners around git, gh, aws, docker or origin are denied', () => {
  expectShell('deny', [
    'bash -c "git push origin feature/x"', 'sh -c "git status"', 'pwsh -c "git commit -m x"', 'powershell -Command "gh pr merge 1"',
    'cmd /c git push origin main', 'cmd.exe /c "docker push x"', 'node -e "require(\'child_process\').execSync(\'git push\')"',
    'python -c "import os; os.system(\'git push\')"', 'npx gh pr merge 1', 'xargs git push < list.txt', 'wsl git push',
    'bash -c "g\\"i\\"t push"', "bash -c 'g\"i\"t push'", 'cmd /c g^it push origin main',
    'eval "git push"', 'iex "git push"', 'Invoke-Expression "git push"', 'Start-Process git -ArgumentList push',
    'Invoke-Expression "echo hi"', 'Start-Process notepad',
    'sudo git push origin feature/x', 'sudo -u root git commit', 'env -u PATH git commit', 'timeout --weird 5 git push',
  ]);
});

test('shell: compound commands take the strictest decision', () => {
  expectShell('deny', [
    'git status && git push origin main', 'git status; git merge x', 'npm test || git reset --hard',
    'git add . ; git commit -m x ; git push origin main', 'git status | git push --force origin x',
    'git commit -m x\ngit push origin main', '(git push origin main)', '{ git rebase main; }',
  ]);
  expectShell('ask', [
    'git add -A; git commit -m "x"; git push origin feature/x', 'npm test && git commit -m x',
  ]);
  const prompt = decideCommand('git commit -m x && git push origin feature/x');
  assert.equal(prompt.permission, 'ask');
  assert.match(prompt.reason, /commit/);
  assert.match(prompt.reason, /pushing feature\/x/);
});

test('shell: substitution, variables, prefixes, quoting and case variants cannot hide commands', () => {
  expectShell('deny', [
    'echo $(git push origin main)', 'echo `git push`', 'x=$(gh pr merge 1)', 'Write-Output "$(git push origin main)"',
    'g`it push origin main', '& $git push', '$g = "git"; & $g push origin main', 'exec $cmd push',
    '%GIT% push origin main', 'GIT.EXE push origin main', 'Git push origin main', 'GIT PUSH ORIGIN MAIN',
    '"git" push origin main', "'git' push origin main", 'C:\\Git\\cmd\\git.cmd push origin main', 'git.com push origin main',
    'FOO=1 git push origin main', 'env FOO=1 git push origin main', 'nice -n 5 git push origin main', 'nohup git push origin main',
    'timeout 5 git push origin main', 'command git push origin main', '$out = git push origin main', '$out=git push origin main',
    'git "push" origin main', 'git push origin "main"', 'git push origin  main  ', 'git push "origin" "HEAD:main"',
    'git push origin main" unclosed',
  ]);
  expectShell('allow', ['$x', '$s.hooks', 'echo hello', 'Write-Output (1 + 2)']);
});

// ---------- B1: computed program names ----------

test('B1: Claude review bypasses of d26a733 are denied', () => {
  expectShell('deny', [
    "& ('gi'+'t') push -f origin x",
    '&("gi"+"t") push -f origin x',
    ". ('gi'+'t') push -f origin x",
    "& ([char]103+'it') push -f origin x",
    '& (Get-Command gi*) push -f origin x',
    "& ('g'+'h') pr merge 5 --admin",
    "& ('a'+'ws') s3 rm s3://b --recursive",
    '$(printf g; printf h) pr merge 5 --admin',
  ]);
});

test('B1: other computed, variable and substituted program names are denied', () => {
  expectShell('deny', [
    "&('g'+'h') pr merge 5", ".('g'+'h') pr merge 5", "& ( 'g' + 'h' ) pr merge 5", "npm test; & ('g'+'h') pr merge 5",
    "npm test && & ('g'+'h') pr merge 5", "Write-Output x | & ('g'+'h') pr merge 5", "& { & ('g'+'h') pr merge 5 }",
    '& (gcm gi*) push', '& (Get-Command -Name gh) pr merge 5', 'Get-Command gh | ForEach-Object { & $_ pr merge 5 }',
    '& [char]103 pr', '$c = [char]103 + "h"; & $c pr merge 5', '& "$([char]103)h" pr merge 5', '& @("gh")[0] pr merge 5',
    '& $env:X pr merge 5', '. $p pr merge 5', "& 'g'+'h' pr merge 5", '& "g"+"h" pr merge 5',
    '(Get-Command gh).Invoke("pr","merge","5")', '$ExecutionContext.InvokeCommand.InvokeScript("x")',
    '[scriptblock]::Create("x").Invoke()', '[System.Diagnostics.Process]::Start("x", "pr merge 5")', '[Diagnostics.Process]::Start("x")',
    '$(echo gh) pr merge 5', '@(echo gh) pr merge 5', '(echo gh) pr merge 5', '$(printf gi; printf t) push -f origin x',
    '`printf gh` pr merge 5', '"$(printf g)h" pr merge 5', '$g pr merge 5', '$x push -f origin x', '${g} pr merge 5',
    '%X% pr merge 5', '%X%', 'g* pr merge 5', 'g?t push', 'npm test; $(printf g; printf h) pr merge 5',
    'g$(echo h) pr merge 5', 'g@(echo h) pr merge 5', '$g --admin pr merge 5',
  ]);
});

test('B1: PowerShell start and CMD call are always denied, including nested wrappers', () => {
  expectShell('deny', [
    'start notepad', 'Start calc', 'START /b x', 'start.exe x', 'start /wait git push origin feature/x',
    'call script.bat', 'CALL foo.bat', 'call :label', 'call.exe setup.bat', '& start notepad',
    "& ('st'+'art') x", "& ('ca'+'ll') setup.bat",
    'cmd /c "start x"', 'cmd /c start x', 'cmd.exe /c "call foo.bat"', 'cmd /c "cmd /c start x"',
    'powershell -c "start x"', 'powershell -Command "call x"', 'pwsh -c "Start calc"',
    'bash -c "start x"', 'node -e "start(\'x\')"', 'cmd /c "st^art x"', 'cmd /c "s\\"t\\"art x"',
    'cmd /c "Start-Process notepad"', 'pwsh -c "iex \'echo hi\'"',
  ]);
  expectShell('allow', [
    'echo hello', 'echo started', 'cmd /c echo hello', 'Start-Sleep 1', 'npm test',
    'Write-Output callback',
  ]);
});

test('B1: ordinary PowerShell values, groups and literal calls stay allowed', () => {
  expectShell('allow', [
    '$x', '$s.hooks', '"test-exit=$LASTEXITCODE"', '(Get-Content a.json -Raw | ConvertFrom-Json).hooks',
    '(Get-Content a.txt).Length', 'Write-Output (1 + 2)', 'Join-Path (Get-Location) x', 'if (Test-Path x) { Remove-Item x }',
    'foreach ($f in Get-ChildItem) { $f.Name }', '1..3 | ForEach-Object { $_ * 2 }',
    "& 'C:\\Program Files\\nodejs\\node.exe' --version", '& node --version', '. .\\scripts\\env.ps1',
    'Get-Command node', '$f = Get-Item x; $f.Name', 'if ($LASTEXITCODE -ne 0) { exit 1 }',
    'if ((Test-Path a) -and (Test-Path b)) { 1 }', '$x -eq 1', '(Get-Item x).Length -gt 5',
  ]);
  expectShell('ask', ["& 'C:\\Program Files\\Git\\cmd\\git.exe' commit -m x"]);
});

test('shell: malformed or missing commands are denied', () => {
  for (const command of [undefined, null, '', '   ', 42, {}]) {
    assert.equal(decideCommand(command).permission, 'deny');
  }
});

// ---------- MCP ----------

const mcp = (server, tool) => decideMcp({ mcp_server_name: server, tool_name: tool, tool_input: '{}' }).permission;

test('MCP: Origin allows reads and create_pull_request only', () => {
  for (const tool of ['get_repository', 'list_repositories', 'list_namespaces', 'get_file_contents', 'get_git_tree', 'grep_contents',
    'list_branches', 'list_commits', 'commit_read', 'compare_commits', 'list_pull_requests', 'pull_request_read', 'checks_read',
    'create_pull_request']) {
    assert.equal(mcp('cursor-origin', tool), 'allow', tool);
  }
  for (const tool of ['merge_pull_request', 'update_pull_request', 'update_pull_request_base', 'create_repository', 'sync_mirror',
    'create_pull_request_review', 'update_pull_request_review', 'dismiss_pull_request_review', 'create_pull_request_comment',
    'create_pull_request_inline_comment', 'reply_pull_request_review_thread', 'update_pull_request_review_thread',
    'update_pull_request_comment', 'update_pull_request_labels', 'create_label', 'request_pull_request_reviewers',
    'remove_pull_request_reviewers', 'unknown_tool']) {
    assert.equal(mcp('cursor-origin', tool), 'deny', tool);
  }
  assert.equal(mcp('origin', 'merge_pull_request'), 'deny');
  assert.equal(mcp('cursor-origin', 'MCP:merge_pull_request'), 'deny');
  assert.equal(mcp('cursor-origin', 'mcp__cursor-origin__merge_pull_request'), 'deny');
  assert.equal(mcp('cursor-origin', 'MERGE_PULL_REQUEST'), 'deny');
});

test('MCP: GitKraken allows only its read-only list', () => {
  const server = 'user-eamodio.gitlens-extension-GitKraken';
  for (const tool of ['git_status', 'git_log_or_diff', 'git_blame', 'git_graph', 'repository_get_file_content',
    'pull_request_get_detail', 'pull_request_get_comments', 'pull_request_assigned_to_me', 'issues_get_detail', 'issues_assigned_to_me']) {
    assert.equal(mcp(server, tool), 'allow', tool);
    assert.equal(mcp('GitKraken', tool), 'allow', `GitKraken ${tool}`);
  }
  for (const tool of ['git_add_or_commit', 'git_commit', 'git_push', 'git_branch', 'git_checkout', 'git_stash', 'git_worktree',
    'pull_request_create', 'pull_request_create_review', 'issues_add_comment', 'gitkraken_workspace_list', 'git_fetch']) {
    assert.equal(mcp(server, tool), 'deny', tool);
  }
});

test('MCP: Atlassian allows get* and search* only', () => {
  for (const tool of ['jira_get_issue', 'jira_search', 'confluence_get_page', 'confluence_search', 'getIssue', 'search']) {
    assert.equal(mcp('mcp-atlassian', tool), 'allow', tool);
    assert.equal(mcp('user-mcp-atlassian', tool), 'allow', tool);
  }
  for (const tool of ['jira_create_issue', 'jira_update_issue', 'confluence_create_page', 'jira_add_comment', 'mcp_auth', 'jira_transition_issue']) {
    assert.equal(mcp('mcp-atlassian', tool), 'deny', tool);
  }
});

test('MCP: unknown servers and malformed payloads are denied', () => {
  for (const server of ['cursor-ide-browser', 'linear', 'github', 'originx', 'my-origin-proxy-x', 'evilorigin']) {
    assert.equal(mcp(server, 'get_repository'), 'deny', server);
  }
  assert.equal(decideMcp({ tool_name: 'get_repository' }).permission, 'deny');
  assert.equal(decideMcp({ mcp_server_name: '', tool_name: 'get_repository' }).permission, 'deny');
  assert.equal(decideMcp({ mcp_server_name: 'cursor-origin' }).permission, 'deny');
  assert.equal(decideMcp(null).permission, 'deny');
  assert.equal(decideMcp('x').permission, 'deny');
});

// ---------- edit guard ----------

const edit = (tool, input, extra = {}) => decideEdit({ tool_name: tool, tool_input: input, cwd: 'C:\\dev\\piza\\angular-piza', ...extra }).permission;

test('edit guard: protected paths are denied for Write and Delete', () => {
  const protectedPaths = [
    '.git/config', '.git/hooks/pre-commit', 'sub/.git/HEAD', '.cursor/hooks.json', '.cursor/hooks/route3-shell-guard.mjs',
    '.claude/settings.json', '.claude/settings.local.json', '.claude/hooks/route3-developer-guard.mjs',
    'C:\\dev\\piza\\angular-piza\\.cursor\\hooks.json', 'C:/dev/piza/angular-piza/.CURSOR/HOOKS.JSON', '.cursor/hooks.json.',
    '.cursor/hooks.json ', '.cursor/hooks.json:evil', '.git./config', 'file:///C:/dev/piza/angular-piza/.cursor/hooks.json',
    'docs/../.cursor/hooks.json', '.\\.claude\\settings.local.json',
  ];
  for (const path of protectedPaths) {
    for (const tool of ['Write', 'Delete']) {
      assert.equal(edit(tool, { path }), 'deny', `${tool} ${path}`);
      assert.equal(edit(tool, { file_path: path }), 'deny', `${tool} file_path ${path}`);
      assert.equal(edit(tool, { target_file: path }), 'deny', `${tool} target_file ${path}`);
    }
  }
  assert.equal(edit('Write', { paths: ['src/a.ts', '.cursor/hooks/x.mjs'] }), 'deny');
  assert.equal(edit('Write', JSON.stringify({ path: '.claude/hooks/x.mjs' })), 'deny');
  assert.equal(edit('Write', { someNewField: '.cursor/hooks.json', contents: 'x' }), 'deny');
  assert.equal(decideEdit({ tool_name: 'Write', tool_input: { path: 'x.json' }, cwd: 'C:\\repo\\.cursor\\hooks' }).permission, 'deny');
});

test('edit guard: governance and ordinary files stay editable', () => {
  for (const path of ['src/app.ts', 'CLAUDE.md', '.claude/rules/route3.md', '.cursor/rules/route3-session.mdc',
    '.claude/agents/route3-developer.md', '.cursor/agents/route3-developer.md', 'docs/route3/shared/PRODUCT.md',
    '.gitignore', '.github/workflows/ci.yml', '.cursor/hooks-notes.md', '.claude/settings.example.json', 'hooks.json']) {
    assert.equal(edit('Write', { path, contents: 'mentions .cursor/hooks.json and .git/config in text' }), 'allow', path);
    assert.equal(edit('Delete', { path }), 'allow', `Delete ${path}`);
  }
});

test('edit guard: other tools pass; missing paths and bad payloads are denied', () => {
  assert.equal(edit('Read', { path: '.cursor/hooks.json' }), 'allow');
  assert.equal(edit('Shell', { command: 'x' }), 'allow');
  assert.equal(edit('Write', {}), 'deny');
  assert.equal(edit('Write', { contents: 'no path here' }), 'deny');
  assert.equal(edit('Delete', null), 'deny');
  assert.equal(decideEdit(null).permission, 'deny');
  assert.equal(decideEdit([]).permission, 'deny');
  assert.equal(decideEdit({ tool_input: { path: 'src/a.ts' } }).permission, 'deny');
  assert.throws(() => decideEdit({ tool_name: 'Write', tool_input: '{not json' }));
});

test('common: protected-path matcher and strictest()', () => {
  assert.ok(isProtectedPath('.git'));
  assert.ok(!isProtectedPath('.gitattributes'));
  assert.ok(!isProtectedPath('.cursor/agents/x.md'));
  assert.equal(strictest([allow(), ask('a'), allow()]).permission, 'ask');
  assert.equal(strictest([ask('a'), deny('d')]).permission, 'deny');
  assert.equal(strictest([]).permission, 'allow');
});

// ---------- end to end: scripts on stdin ----------

test('scripts: Cursor response format, exit codes and fail-closed on bad input', () => {
  const pushMain = runScript('route3-shell-guard.mjs', JSON.stringify({ command: 'git push origin main', cwd: '.' }));
  assert.equal(pushMain.status, 2);
  const denied = JSON.parse(pushMain.stdout);
  assert.equal(denied.permission, 'deny');
  assert.match(denied.user_message, /Route3 shell guard/);
  assert.match(denied.agent_message, /blocked/);

  const commit = runScript('route3-shell-guard.mjs', JSON.stringify({ command: 'git commit -m x' }));
  assert.equal(commit.status, 0);
  assert.equal(JSON.parse(commit.stdout).permission, 'ask');

  const status = runScript('route3-shell-guard.mjs', JSON.stringify({ command: 'git status' }));
  assert.equal(status.status, 0);
  assert.deepEqual(JSON.parse(status.stdout), { permission: 'allow' });

  const merge = runScript('route3-mcp-guard.mjs', JSON.stringify({ mcp_server_name: 'cursor-origin', tool_name: 'merge_pull_request', tool_input: '{}' }));
  assert.equal(merge.status, 2);
  assert.equal(JSON.parse(merge.stdout).permission, 'deny');

  const createPr = runScript('route3-mcp-guard.mjs', JSON.stringify({ mcp_server_name: 'cursor-origin', tool_name: 'create_pull_request', tool_input: '{}' }));
  assert.equal(createPr.status, 0);
  assert.equal(JSON.parse(createPr.stdout).permission, 'allow');

  const hookEdit = runScript('route3-edit-guard.mjs', JSON.stringify({ tool_name: 'Write', tool_input: { path: '.cursor/hooks.json' } }));
  assert.equal(hookEdit.status, 2);
  assert.equal(JSON.parse(hookEdit.stdout).permission, 'deny');

  for (const script of ['route3-shell-guard.mjs', 'route3-mcp-guard.mjs', 'route3-edit-guard.mjs']) {
    for (const input of ['', '{not json', 'null', '[]', '"text"']) {
      const result = runScript(script, input);
      assert.equal(result.status, 2, `${script} with ${JSON.stringify(input)}`);
      assert.equal(JSON.parse(result.stdout).permission, 'deny');
    }
  }
});

// Cursor on Windows prefixes the hook payload with a UTF-8 BOM. Each case runs
// as plain JSON and as BOM JSON and must give the same decision.
const PAYLOAD_CASES = [
  ['route3-shell-guard.mjs', { command: 'git status', cwd: '.' }, 'allow', 0],
  ['route3-shell-guard.mjs', { command: 'npm test' }, 'allow', 0],
  ['route3-shell-guard.mjs', { command: 'git commit -m x' }, 'ask', 0],
  ['route3-shell-guard.mjs', { command: 'git push origin feature/x' }, 'ask', 0],
  ['route3-shell-guard.mjs', { command: 'git push origin main' }, 'deny', 2],
  ['route3-mcp-guard.mjs', { mcp_server_name: 'cursor-origin', tool_name: 'get_repository', tool_input: '{}' }, 'allow', 0],
  ['route3-mcp-guard.mjs', { mcp_server_name: 'cursor-origin', tool_name: 'create_pull_request', tool_input: '{}' }, 'allow', 0],
  ['route3-mcp-guard.mjs', { mcp_server_name: 'cursor-origin', tool_name: 'merge_pull_request', tool_input: '{}' }, 'deny', 2],
  ['route3-mcp-guard.mjs', { mcp_server_name: 'cursor-ide-browser', tool_name: 'browser_navigate', tool_input: '{}' }, 'deny', 2],
  ['route3-edit-guard.mjs', { tool_name: 'Write', tool_input: { path: 'src/app.ts' } }, 'allow', 0],
  ['route3-edit-guard.mjs', { tool_name: 'Write', tool_input: { path: '.cursor/hooks/route3-common.mjs' } }, 'deny', 2],
  ['route3-edit-guard.mjs', { tool_name: 'Delete', tool_input: { path: '.cursor/hooks.json' } }, 'deny', 2],
];

test('scripts: BOM-prefixed JSON gets the same decision as plain JSON', () => {
  for (const [script, payload, permission, status] of PAYLOAD_CASES) {
    const body = JSON.stringify({ conversation_id: 'test', cursor_version: '3.23.23', workspace_roots: [repoRoot], ...payload });
    for (const [label, input] of [['plain', body], ['BOM', withBom(body)]]) {
      const result = runScript(script, input);
      assert.equal(result.status, status, `${script} ${label} ${JSON.stringify(payload)}: ${result.stdout}`);
      assert.equal(JSON.parse(result.stdout).permission, permission, `${script} ${label} ${JSON.stringify(payload)}`);
    }
  }
});

test('scripts: malformed input stays denied with or without a BOM', () => {
  // Each allowed body would pass if it parsed; a second BOM or a trailing BOM must still deny.
  const allowedBodies = {
    'route3-shell-guard.mjs': '{"command":"git status"}',
    'route3-mcp-guard.mjs': '{"mcp_server_name":"cursor-origin","tool_name":"get_repository"}',
    'route3-edit-guard.mjs': '{"tool_name":"Write","tool_input":{"path":"src/app.ts"}}',
  };
  for (const [script, body] of Object.entries(allowedBodies)) {
    const inputs = [withBom(''), withBom('{not json'), withBom('null'), withBom('[]'), Buffer.concat([BOM, withBom(body)]), Buffer.from(`${body}\uFEFF`, 'utf8')];
    for (const input of inputs) {
      const result = runScript(script, input);
      assert.equal(result.status, 2, `${script} with ${JSON.stringify(input.toString('utf8'))}`);
      assert.equal(JSON.parse(result.stdout).permission, 'deny');
    }
  }
});

test('common: parsePayload strips one leading BOM only', () => {
  assert.deepEqual(parsePayload('\uFEFF{"a":1}'), { a: 1 });
  assert.deepEqual(parsePayload('{"a":1}'), { a: 1 });
  assert.throws(() => parsePayload('\uFEFF\uFEFF{"a":1}'));
  assert.throws(() => parsePayload('\uFEFF'));
});
