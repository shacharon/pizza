#!/usr/bin/env node
// Route3 Cursor shell guard (R3-006C-2): beforeShellExecution.
//
// Runs for every shell command in every Cursor session in this repository.
// Cursor's shell hook data does not say whether the parent or a subagent is
// running, so one policy applies to both. Commands that use git, gh, aws,
// docker or origin get a decision from the approved R3-006C table; every
// other command is allowed. Anything it cannot parse safely is denied.

import { allow, ask, deny, strictest, isMain, runHook } from './route3-common.mjs';

const SENSITIVE_WORD = /\b(git|gh|aws|docker|origin)\b/i;

// Quotes, PowerShell backticks and cmd carets can split a word ("g`it",
// g"i"t, g^it) that the shell joins again before running it.
function mentionsSensitive(text) {
  const s = String(text);
  return [s, s.replace(/[`"'^]/g, ''), s.replace(/[`"'^\\]/g, '')].some((v) => SENSITIVE_WORD.test(v));
}

// Programs that run another command or arbitrary code.
const EXEC_PROGRAMS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'fish', 'pwsh', 'powershell', 'cmd', 'wsl',
  'xargs', 'node', 'python', 'python3', 'py', 'perl', 'ruby', 'npx', 'source', '.',
  'find', 'watch', 'setsid', 'flock', 'call', 'start',
]);
// Programs that evaluate a string or start a hidden process: always denied.
const ALWAYS_DENIED_PROGRAMS = new Set([
  'eval', 'iex', 'invoke-expression', 'invoke-command', 'start-process', 'saps', 'icm',
]);

// Environment variables that make Git (or its pager/editor) run a program.
const EXEC_ENV_NAME = /^(GIT_[A-Z0-9_]*|PAGER|EDITOR|VISUAL|LESSOPEN|LESSCLOSE|SSH_ASKPASS)$/i;
const EXEC_ENV_SET = /(^|[\s;&|(])(export\s+|set\s+|\$env:)?(GIT_[A-Z0-9_]*|PAGER|EDITOR|VISUAL|LESSOPEN|LESSCLOSE|SSH_ASKPASS)\s*=/i;
const ENV_MUTATION = /\benv:|\[\s*(system\.)?environment\s*\]|setenvironmentvariable|\bsetx\b|\bexport\b|\b(declare|typeset)\s+-\w*x|(^|[\s;&|(])set\s+\S+\s*=/i;

const DEFAULT_BRANCHES = new Set(['main', 'master']);

// ---------- tokenizing ----------

// Splits a command line into segments of tokens and removes quotes.
// Returns null when the command cannot be tokenized (e.g. unclosed quote).
export function splitCommand(command) {
  const segments = [];
  let tokens = [];
  let current = '';
  let hasToken = false;
  let quote = null;

  const endToken = () => {
    if (hasToken) tokens.push(current);
    current = '';
    hasToken = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length) segments.push(tokens);
    tokens = [];
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (ch === '\\' && quote === '"' && command[i + 1] === '"') current += command[++i];
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasToken = true;
      continue;
    }
    if (ch === '\\' && /["' ]/.test(command[i + 1] ?? '')) {
      current += command[++i];
      hasToken = true;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '\r' || ch === '|' || ch === '&' || ch === '(' || ch === ')' || ch === '{' || ch === '}') {
      if ((ch === '&' || ch === '|') && command[i + 1] === ch) {
        i++;
        endSegment();
        continue;
      }
      // A lone "&" at the start of a segment is the PowerShell call operator.
      if (ch === '&' && !hasToken && tokens.length === 0) {
        tokens.push('&');
        continue;
      }
      endSegment();
      continue;
    }
    if (/\s/.test(ch)) {
      endToken();
      continue;
    }
    current += ch;
    hasToken = true;
  }
  if (quote) return null;
  endSegment();
  return segments;
}

function programName(token) {
  const base = token.split(/[\\/]/).pop().toLowerCase();
  return base.replace(/\.(exe|cmd|bat|ps1|com)$/, '');
}

function isAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

const DURATION = /^\d+(\.\d+)?[smhd]?$/;
const INTEGER = /^[+-]?\d+$/;
const noOptions = (args) => (args[0]?.startsWith('-') ? -1 : 0);

// Wrappers that run their arguments as a command. Each returns the index of
// the wrapped command, or -1 when its options cannot be verified.
const WRAPPERS = {
  timeout(args) {
    let i = 0;
    while (i < args.length && args[i].startsWith('-')) {
      const arg = args[i];
      if (['--preserve-status', '--foreground', '-v', '--verbose'].includes(arg)) i += 1;
      else if ((arg === '-k' || arg === '-s') && args[i + 1] !== undefined) i += 2;
      else if (/^--(kill-after|signal)=./.test(arg)) i += 1;
      else return -1;
    }
    return DURATION.test(args[i] ?? '') ? i + 1 : -1;
  },
  time: (args) => (args[0] === '-p' ? 1 : noOptions(args)),
  nice(args) {
    if (args[0] === '-n') return INTEGER.test(args[1] ?? '') ? 2 : -1;
    if (/^(--adjustment=[+-]?\d+|-\d+)$/.test(args[0] ?? '')) return 1;
    return noOptions(args);
  },
  command(args) {
    if (args[0] === '-v' || args[0] === '-V') return args.length;
    return args[0] === '-p' ? 1 : noOptions(args);
  },
  nohup: noOptions,
  builtin: noOptions,
  noglob: noOptions,
  exec: noOptions,
  '&': noOptions,
  env(args) {
    let i = 0;
    while (i < args.length && isAssignment(args[i])) i += 1;
    return noOptions(args.slice(i)) < 0 ? -1 : i;
  },
  sudo: () => -1,
};

// PowerShell "$name = <pipeline>" runs the pipeline, so the right-hand side
// is checked as a command. Compound forms ($x += 1) are treated the same.
function stripPowerShellAssignment(tokens) {
  if (/^\$[\w:.]+$/.test(tokens[0] ?? '') && /^[-+*/]?=$/.test(tokens[1] ?? '')) return tokens.slice(2);
  const inline = (tokens[0] ?? '').match(/^\$[\w:.]+[-+*/]?=(.*)$/);
  if (inline) return inline[1] ? [inline[1], ...tokens.slice(1)] : tokens.slice(1);
  return tokens;
}

// Removes leading assignments and recognized wrappers. "called" records a
// call operator (&, exec), which makes a variable program name executable.
function stripPrefixes(tokens) {
  let rest = stripPowerShellAssignment(tokens);
  const assigned = [];
  let called = false;
  for (;;) {
    while (rest.length && isAssignment(rest[0])) assigned.push(rest.shift().split('=')[0]);
    if (!rest.length) return { rest, assigned, called };
    const name = programName(rest[0]);
    if (!Object.hasOwn(WRAPPERS, name)) return { rest, assigned, called };
    const args = rest.slice(1);
    const start = WRAPPERS[name](args);
    if (start < 0) return { error: `${name} options cannot be verified as safe.` };
    if (name === 'env') assigned.push(...args.slice(0, start).map((a) => a.split('=')[0]));
    if (name === '&' || name === 'exec' || name === 'command') called = true;
    rest = args.slice(start);
  }
}

// ---------- git ----------

// -c, --config-env, --exec-path, --git-dir and --work-tree can make a
// read-only command run a program, so they are denied.
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '--namespace']);
const GIT_GLOBAL_DENIED = new Set(['-c', '--config-env', '--exec-path', '--git-dir', '--work-tree']);
const GIT_GLOBAL_FLAGS = new Set([
  '-p', '-P', '--paginate', '--no-pager', '--bare', '--no-replace-objects',
  '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-optional-locks',
]);
const GIT_EXEC_OPTION = /^(--ext-diff|--upload-pack|--receive-pack|--exec|--open-files-in-pager|-O)(=|$)|^-O./;

// Policy table: allow.
const GIT_ALLOWED = new Set([
  'status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'ls-tree', 'blame',
  'describe', 'merge-base', 'cat-file', 'fetch', 'add',
]);
// Policy table: deny.
const GIT_DENIED = new Set([
  'merge', 'pull', 'rebase', 'reset', 'cherry-pick', 'revert', 'am', 'tag',
  'clean', 'gc', 'prune', 'update-ref', 'filter-branch', 'restore',
]);

const GIT_CONFIG_READ_FLAGS = new Set([
  '--local', '--global', '--system', '--worktree', '--show-origin',
  '--show-scope', '--name-only', '-z', '--null', '--includes', '--no-includes',
]);
const GIT_CONFIG_READ_ACTIONS = {
  '--get': [1, 2], '--get-all': [1, 2], '--get-regexp': [1, 2],
  '--list': [0, 0], '-l': [0, 0], get: [1, 1], list: [0, 0],
};

function gitConfigDecision(rest) {
  let action = null;
  const positional = [];
  for (const [index, arg] of rest.entries()) {
    if (GIT_CONFIG_READ_FLAGS.has(arg)) continue;
    const isAction = Object.hasOwn(GIT_CONFIG_READ_ACTIONS, arg) && (arg.startsWith('-') || index === 0);
    if (isAction && action === null) {
      action = arg;
      continue;
    }
    if (arg.startsWith('-') || isAction) return deny(`git config ${arg} is not a read-only form.`);
    if (action === null) return deny('git config writes are not allowed; the read action must come first.');
    positional.push(arg);
  }
  if (action === null) return deny('git config writes are not allowed.');
  const [min, max] = GIT_CONFIG_READ_ACTIONS[action];
  if (positional.length < min || positional.length > max) return deny('git config arguments do not match a read-only form.');
  return allow();
}

// Flags that only list branches. The second set takes a value.
const BRANCH_LIST_FLAGS = new Set([
  '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '--list', '-l',
  '--show-current', '--merged', '--no-merged',
]);
const BRANCH_LIST_VALUE_FLAGS = new Set(['--contains', '--no-contains', '--points-at', '--sort', '--format']);
const BRANCH_NEUTRAL_FLAGS = new Set(['--no-color', '--color']);

function gitBranchDecision(rest) {
  const positional = [];
  let listing = false;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (/^(-d|-D|--delete)$/.test(arg)) return deny('git branch -d/-D is not allowed.');
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const [flag, inline] = arg.split('=', 2);
    if (BRANCH_LIST_VALUE_FLAGS.has(flag)) {
      listing = true;
      if (inline === undefined) i += 1;
      continue;
    }
    if (BRANCH_LIST_FLAGS.has(arg)) {
      listing = true;
      continue;
    }
    if (BRANCH_NEUTRAL_FLAGS.has(arg)) continue;
    return deny(`git branch ${arg} is not allowed.`);
  }
  // With a list flag, remaining words are name patterns or commits.
  if (positional.length === 0 || listing) return allow();
  if (positional.length <= 2) {
    return ask(`Approve creating branch ${positional[0]} only if this is the parent session working on a feature branch.`);
  }
  return deny('git branch with these arguments is not allowed.');
}

// Policy table: push <remote> <explicit non-default branch>, no force,
// delete, mirror, tags or all flags → ask. Anything else → deny.
const PUSH_SAFE_LONG = new Set(['--set-upstream', '--dry-run', '--verbose', '--quiet', '--progress', '--no-verify', '--porcelain', '--atomic', '--no-progress']);
const PUSH_SAFE_SHORT = new Set(['u', 'n', 'v', 'q']);

function pushTarget(refspec) {
  if (refspec.startsWith('+')) return { error: 'force refspecs (+) are not allowed.' };
  if (/[*]/.test(refspec)) return { error: 'wildcard refspecs are not allowed.' };
  const parts = refspec.split(':');
  if (parts.length > 2) return { error: `refspec ${refspec} cannot be verified.` };
  const [src, dst = src] = parts;
  if (parts.length === 2 && src === '') return { error: 'deleting a remote branch is not allowed.' };
  let target = dst.replace(/^refs\/heads\//i, '');
  if (/^refs\//i.test(target)) return { error: `pushing to ${dst} is not allowed.` };
  if (target === '' || /^(head|@)$/i.test(target)) return { error: 'git push needs an explicit feature-branch name.' };
  if (DEFAULT_BRANCHES.has(target.toLowerCase())) return { error: `pushing to ${target} is not allowed; use a pull request.` };
  return { target };
}

function gitPushDecision(rest) {
  const positional = [];
  for (const arg of rest) {
    if (arg === '--') continue;
    if (arg.startsWith('--')) {
      if (PUSH_SAFE_LONG.has(arg)) continue;
      return deny(`git push ${arg.split('=')[0]} is not allowed.`);
    }
    if (arg.startsWith('-') && arg.length > 1) {
      const bad = [...arg.slice(1)].find((c) => !PUSH_SAFE_SHORT.has(c));
      if (bad) return deny(`git push -${bad} is not allowed.`);
      continue;
    }
    positional.push(arg);
  }
  if (positional.length < 2) return deny('git push needs an explicit remote and feature branch.');
  const targets = [];
  for (const refspec of positional.slice(1)) {
    const result = pushTarget(refspec);
    if (result.error) return deny(result.error);
    targets.push(result.target);
  }
  return ask(`Approve pushing ${targets.join(', ')} to ${positional[0]} only if this is the parent session. Cursor cannot tell the Developer subagent apart from the parent.`);
}

function gitDecision(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const arg = args[i];
    const [flag, inlineValue] = arg.split('=', 2);
    if (GIT_GLOBAL_DENIED.has(flag) || /^-c./.test(arg)) return deny(`git ${flag} is not allowed.`);
    if (GIT_GLOBAL_WITH_VALUE.has(flag)) {
      i += inlineValue === undefined ? 2 : 1;
      continue;
    }
    if (GIT_GLOBAL_FLAGS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg === '--version' || arg === '--help' || arg === '-h') return allow();
    return deny(`unknown git option ${arg}.`);
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) return allow();
  const execOption = rest.find((a) => GIT_EXEC_OPTION.test(a));
  if (execOption) return deny(`git option ${execOption.split('=')[0]} runs an external program.`);

  if (GIT_ALLOWED.has(sub)) return allow();
  if (GIT_DENIED.has(sub)) return deny(`git ${sub} is not allowed.`);
  switch (sub) {
    case 'commit':
      return ask('Approve this git commit only if this is the parent session on a feature branch. Cursor cannot tell the Developer subagent apart from the parent.');
    case 'push':
      return gitPushDecision(rest);
    case 'switch':
    case 'checkout':
      return ask(`Approve git ${sub} only if this is the parent session.`);
    case 'branch':
      return gitBranchDecision(rest);
    case 'worktree':
      if (rest[0] === 'list') return allow();
      if (rest[0] === 'add' || rest[0] === 'remove') return ask(`Approve git worktree ${rest[0]} only if this is the parent session.`);
      return deny(`git worktree ${rest[0] ?? ''} is not allowed.`.replace(' .', '.'));
    case 'stash':
      if (rest[0] === 'list') return allow();
      return deny('git stash is not allowed (only stash list).');
    case 'remote':
      if (rest.length === 0 || (rest.length === 1 && (rest[0] === '-v' || rest[0] === '--verbose'))) return allow();
      return deny(`git remote ${rest[0]} is not allowed.`);
    case 'config':
      return gitConfigDecision(rest);
    default:
      return deny(`git ${sub} is not on the Route3 allow list.`);
  }
}

// ---------- gh ----------

const GH_PR_READ = new Set(['view', 'list', 'diff', 'checks', 'status']);
const GH_API_BODY_FLAGS = /^(-f|-F|--field|--raw-field|--input)(=|$)|^-[fF]./;
const GH_MERGE_FLAGS = new Set(['--squash', '-s', '--merge', '-m', '--rebase', '-r', '--delete-branch', '-d', '--auto']);
const GH_MERGE_VALUE_FLAGS = new Set(['--match-head-commit', '--subject', '-t', '--body', '-b', '--repo', '-R']);

function ghApiDecision(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-X' || arg === '--method') {
      if ((args[i + 1] ?? '').toUpperCase() !== 'GET') return deny('gh api calls other than GET are not allowed.');
      i += 1;
      continue;
    }
    const inline = arg.match(/^(?:-X|--method=)(.+)$/);
    if (inline && inline[1].toUpperCase() !== 'GET') return deny('gh api calls other than GET are not allowed.');
    if (GH_API_BODY_FLAGS.test(arg)) return deny('gh api requests with a body are not allowed.');
  }
  return allow();
}

function ghMergeDecision(args) {
  const positional = [];
  let sha = null;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--admin') return deny('gh pr merge --admin is not allowed.');
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const [flag, inline] = arg.split('=', 2);
    if (GH_MERGE_VALUE_FLAGS.has(flag)) {
      const value = inline ?? args[i + 1];
      if (inline === undefined) i += 1;
      if (flag === '--match-head-commit') sha = value;
      continue;
    }
    if (GH_MERGE_FLAGS.has(arg)) continue;
    return deny(`gh pr merge ${flag} is not allowed.`);
  }
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return deny('gh pr merge needs --match-head-commit <SHA>.');
  if (positional.length !== 1 || !/^\d+$/.test(positional[0])) return deny('gh pr merge needs one PR number.');
  return ask(`Owner approval for PR #${positional[0]} at head ${sha} is required. This prompt is only a pause; it does not verify that the owner approved this PR.`);
}

function ghDecision(args) {
  const [group, action] = args;
  if (group === '--version') return allow();
  if (group === 'api') return ghApiDecision(args.slice(1));
  if (group === 'auth' && action === 'status') return allow();
  if (group === 'pr') {
    if (GH_PR_READ.has(action)) return allow();
    if (action === 'create') return allow();
    if (action === 'merge') return ghMergeDecision(args.slice(2));
  }
  return deny(`gh ${group ?? ''}${action ? ` ${action}` : ''} is not allowed.`);
}

// ---------- aws, docker, origin ----------

const AWS_GLOBAL_WITH_VALUE = new Set(['--profile', '--region', '--output', '--query', '--color', '--endpoint-url', '--cli-read-timeout', '--cli-connect-timeout', '--ca-bundle']);
const AWS_GLOBAL_FLAGS = new Set(['--no-cli-pager', '--debug', '--no-paginate', '--no-sign-request', '--cli-auto-prompt', '--no-cli-auto-prompt']);
const AWS_LOGS_READ = /^(describe-|get-|list-|filter-log-events$|tail$|start-query$|stop-query$)/;

function awsDecision(args) {
  const positional = [];
  for (let i = 0; i < args.length && positional.length < 2; i++) {
    const arg = args[i];
    if (!arg.startsWith('-')) {
      positional.push(arg);
      continue;
    }
    const [flag, inline] = arg.split('=', 2);
    if (AWS_GLOBAL_WITH_VALUE.has(flag)) {
      if (inline === undefined) i += 1;
      continue;
    }
    if (AWS_GLOBAL_FLAGS.has(flag)) continue;
    return deny(`aws option ${flag} before the operation cannot be verified.`);
  }
  const [service = '', op = ''] = positional.map((p) => p.toLowerCase());
  const deploy =
    (service === 'ecs' && (op === 'update-service' || op === 'register-task-definition')) ||
    (service === 's3' && ['sync', 'cp', 'rm'].includes(op)) ||
    (service === 'cloudfront' && op === 'create-invalidation') ||
    (service === 'amplify' && op === 'start-job') ||
    (service === 'ecr' && op.startsWith('put-'));
  if (deploy) return ask(`Owner deploy approval is required for aws ${service} ${op}. This prompt is only a pause.`);
  if (service === 'logs') return AWS_LOGS_READ.test(op) ? allow() : deny(`aws logs ${op} is not allowed.`);
  if (service === 'sts' && op === 'get-caller-identity') return allow();
  if (/^(describe-|list-|get-)/.test(op)) return allow();
  return deny(`aws ${service} ${op} is not allowed.`.replace(/\s+\./, '.'));
}

function dockerDecision(args) {
  const [sub, next] = args;
  const pushFlag = args.some((a) => a === '--push' || a.startsWith('--push='));
  if (sub === 'push' || (sub === 'image' && next === 'push') || (sub === 'build' && pushFlag)) {
    return ask('Owner deploy approval is required for docker push. This prompt is only a pause.');
  }
  if (sub === 'build' || sub === 'images' || sub === 'ps') return allow();
  return deny(`docker ${sub ?? ''} is not allowed.`.replace(' .', '.'));
}

function originDecision(args) {
  if (args[0] === 'auth' && args[1] === 'status') return allow();
  return deny(`origin ${args.join(' ')} is not allowed.`.replace(' .', '.'));
}

// ---------- command ----------

function segmentDecision(tokens, commandIsSensitive) {
  const segmentText = tokens.join(' ');
  const stripped = stripPrefixes(tokens);
  if (stripped.error) return mentionsSensitive(segmentText) ? deny(stripped.error) : allow();
  const { rest, assigned, called } = stripped;
  if (!rest.length) return allow();
  // A variable or wildcard program name could resolve to git, gh, aws,
  // docker or origin. A bare PowerShell "$x" only prints a value, so it is
  // denied only when it is called or the command names one of those tools.
  if (/[$%`*?]/.test(rest[0])) {
    if (called || commandIsSensitive || !rest[0].startsWith('$')) {
      return deny(`program name ${rest[0]} cannot be resolved safely.`);
    }
    return allow();
  }
  const program = programName(rest[0]);
  const args = rest.slice(1);

  if (ALWAYS_DENIED_PROGRAMS.has(program)) return deny(`${program} is not allowed.`);
  if (program === 'git') {
    const execEnv = assigned.find((name) => EXEC_ENV_NAME.test(name));
    if (execEnv) return deny(`git with ${execEnv} set is not allowed.`);
    return gitDecision(args);
  }
  if (program === 'gh') return ghDecision(args);
  if (program === 'aws') return awsDecision(args);
  if (program === 'docker') return dockerDecision(args);
  if (program === 'origin') return originDecision(args);
  if (EXEC_PROGRAMS.has(program) && mentionsSensitive(args.join(' '))) {
    return deny(`${program} wrapping git, gh, aws, docker or origin is not allowed.`);
  }
  return allow();
}

export function decideCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') return deny('missing command.');
  const sensitive = mentionsSensitive(command);
  if (sensitive && /\$\(|`|<\(|>\(/.test(command)) {
    return deny('command substitution or backticks around git, gh, aws, docker or origin are not allowed.');
  }
  if (/\bgit\b/i.test(command) && (EXEC_ENV_SET.test(command) || ENV_MUTATION.test(command))) {
    return deny('changing environment variables around git is not allowed.');
  }
  const segments = splitCommand(command);
  if (segments === null) return sensitive ? deny('command could not be parsed safely.') : allow();
  return strictest(segments.map((tokens) => segmentDecision(tokens, sensitive)));
}

export function decide(payload) {
  if (!payload || typeof payload !== 'object') return deny('malformed hook payload.');
  return decideCommand(payload.command);
}

if (isMain(import.meta.url)) runHook(decide, 'shell guard');
