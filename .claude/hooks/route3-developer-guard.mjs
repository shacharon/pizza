#!/usr/bin/env node
// Route3 Developer guard (R3-006C-1).
//
// PreToolUse hook registered only in the frontmatter of
// .claude/agents/route3-developer.md, so it runs only inside that subagent.
// It reads the hook payload from stdin and blocks (exit 2) Git mutations,
// GitHub writes, deployments and edits to protected files. Anything it
// cannot read or parse safely is blocked. Allowed calls exit 0 with no
// output, so the normal permission flow continues.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit']);

// Tools that may only appear in a command when it is parsed with certainty.
const SENSITIVE_WORD =
  /\b(git|gh|aws|docker|origin|kubectl|helm|terraform|amplify|cdk|serverless|sls|eb|vercel|netlify|firebase|flyctl)\b/i;

const DEPLOY_PROGRAMS = new Set([
  'aws', 'origin', 'kubectl', 'helm', 'terraform', 'amplify', 'cdk',
  'serverless', 'sls', 'eb', 'vercel', 'netlify', 'firebase', 'flyctl',
]);

// Programs that run another command or arbitrary code.
const EXEC_PROGRAMS = new Set([
  'bash', 'sh', 'zsh', 'dash', 'fish', 'pwsh', 'powershell', 'cmd', 'wsl',
  'eval', 'iex', 'invoke-expression', 'start-process', 'invoke-command',
  'xargs', 'node', 'python', 'python3', 'py', 'perl', 'ruby', 'npx', 'source', '.',
  'find', 'watch', 'setsid', 'flock',
]);

// Environment variables that make Git (or its pager/editor) run a program.
const EXEC_ENV_NAME = /^(GIT_[A-Z0-9_]*|PAGER|EDITOR|VISUAL|LESSOPEN|LESSCLOSE|SSH_ASKPASS)$/i;
const EXEC_ENV_SET = /(^|[\s;&|(])(export\s+|set\s+|\$env:)?(GIT_[A-Z0-9_]*|PAGER|EDITOR|VISUAL|LESSOPEN|LESSCLOSE|SSH_ASKPASS)\s*=/i;

const GIT_READ_ONLY = new Set([
  'status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'ls-tree',
  'ls-remote', 'blame', 'annotate', 'describe', 'merge-base', 'cat-file',
  'grep', 'shortlog', 'show-ref', 'rev-list', 'for-each-ref', 'name-rev',
  'version', 'help', 'var', 'check-ignore', 'check-attr', 'count-objects',
  'diff-tree', 'diff-files', 'diff-index', 'whatchanged', 'range-diff',
  'cherry', 'show-branch', 'verify-commit', 'verify-tag',
]);

// -c, --config-env, --exec-path, --git-dir and --work-tree are denied: they can
// make a read-only command run a program (core.fsmonitor, core.sshCommand,
// core.pager, ...) or point Git at a repository with such configuration.
const GIT_GLOBAL_WITH_VALUE = new Set(['-C', '--namespace']);
const GIT_GLOBAL_DENIED = new Set(['-c', '--config-env', '--exec-path', '--git-dir', '--work-tree']);
// Options of read-only subcommands that run an external program.
const GIT_EXEC_OPTION = /^(--ext-diff|--upload-pack|--open-files-in-pager|-O)(=|$)|^-O./;
const GIT_GLOBAL_FLAGS = new Set([
  '-p', '-P', '--paginate', '--no-pager', '--bare', '--no-replace-objects',
  '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs',
  '--icase-pathspecs', '--no-optional-locks',
]);
const GIT_BRANCH_READ_FLAGS = new Set([
  '-a', '--all', '-r', '--remotes', '-v', '-vv', '--verbose', '--list', '-l',
  '--show-current', '--no-color', '--color',
]);

const GH_READ_ONLY = {
  pr: new Set(['view', 'list', 'diff', 'checks', 'status']),
  issue: new Set(['view', 'list', 'status']),
  repo: new Set(['view', 'list']),
  run: new Set(['view', 'list']),
  workflow: new Set(['view', 'list']),
  release: new Set(['view', 'list']),
  ruleset: new Set(['list', 'view', 'check']),
  auth: new Set(['status']),
  search: null, // every search subcommand is read-only
};
const GH_API_BODY_FLAGS = /^(-f|-F|--field|--raw-field|--input)(=|$)|^-[fF]./;

const allow = () => ({ decision: 'allow' });
const deny = (reason) => ({ decision: 'deny', reason });

// ---------- paths ----------

function normalizePath(path) {
  return String(path).replace(/\\/g, '/').toLowerCase();
}

export function isProtectedPath(path) {
  const parts = normalizePath(path).split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    if (part === '.git' || part === '.gitconfig') return true;
    if (part === '.config' && next === 'git') return true;
    if (part === '.claude' && (next === 'settings.json' || next === 'settings.local.json' || next === 'hooks')) return true;
    if (part === '.cursor' && (next === 'hooks.json' || next === 'hooks')) return true;
  }
  return false;
}

// ---------- shell parsing ----------

// Splits a command line into segments of tokens. Quotes are removed.
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
      // "&&" and "||" are single separators.
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
  return base.replace(/\.(exe|cmd|bat|ps1)$/, '');
}

function isAssignment(token) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

const DURATION = /^\d+(\.\d+)?[smhd]?$/;
const INTEGER = /^[+-]?\d+$/;
const BUFFER_MODE = /^(L|0|\d+[KMG]?)$/;
const noOptions = (args) => (args[0]?.startsWith('-') ? -1 : 0);

// Wrapper commands that run their arguments as a command. Each parser gets the
// arguments after the wrapper name and returns the index where the wrapped
// command starts, or -1 when the syntax is not recognized as safe.
// "command -v/-V" only prints a path, so it returns args.length (no command).
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
  stdbuf(args) {
    let i = 0;
    while (i < args.length && args[i].startsWith('-')) {
      const arg = args[i];
      if (/^-[ioe]$/.test(arg) && BUFFER_MODE.test(args[i + 1] ?? '')) i += 2;
      else if (/^-[ioe]./.test(arg) && BUFFER_MODE.test(arg.slice(2))) i += 1;
      else if (/^--(input|output|error)=/.test(arg) && BUFFER_MODE.test(arg.split('=')[1])) i += 1;
      else return -1;
    }
    return i;
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
  // Only VAR=value assignments; any option (-u, -i, -S, --, ...) is denied.
  env(args) {
    let i = 0;
    while (i < args.length && isAssignment(args[i])) i += 1;
    return noOptions(args.slice(i)) < 0 ? -1 : i;
  },
  // sudo can change the user, environment and command lookup: never allowed.
  sudo: () => -1,
};

// Removes leading environment assignments and recognized wrapper syntax.
// Returns { rest, assigned } or { error } when a wrapper cannot be verified.
function stripPrefixes(tokens) {
  let rest = tokens.slice();
  const assigned = [];
  for (;;) {
    while (rest.length && isAssignment(rest[0])) assigned.push(rest.shift().split('=')[0]);
    if (!rest.length) return { rest, assigned };
    const name = programName(rest[0]);
    if (!Object.hasOwn(WRAPPERS, name)) return { rest, assigned };
    const args = rest.slice(1);
    const start = WRAPPERS[name](args);
    if (start < 0) return { error: `${name} options cannot be verified as safe` };
    if (name === 'env') assigned.push(...args.slice(0, start).map((a) => a.split('=')[0]));
    rest = args.slice(start);
  }
}

// Allows only unambiguous read forms of "git config"; anything else is denied.
const GIT_CONFIG_READ_FLAGS = new Set([
  '--local', '--global', '--system', '--worktree', '--show-origin',
  '--show-scope', '--name-only', '-z', '--null', '--includes', '--no-includes',
]);
// action → [min, max] positional arguments
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
    if (arg.startsWith('-') || isAction) return deny(`git config ${arg} is not allowed for the Developer`);
    positional.push(arg);
  }
  if (action === null) return deny('git config without one explicit read action is not allowed');
  const [min, max] = GIT_CONFIG_READ_ACTIONS[action];
  if (positional.length < min || positional.length > max) return deny('git config arguments do not match a read-only form');
  return allow();
}

function gitDecision(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    const arg = args[i];
    const [flag, inlineValue] = arg.split('=', 2);
    if (GIT_GLOBAL_DENIED.has(flag) || /^-c./.test(arg)) return deny(`git ${flag} is not allowed for the Developer`);
    if (GIT_GLOBAL_WITH_VALUE.has(flag)) {
      i += inlineValue === undefined ? 2 : 1;
      continue;
    }
    if (GIT_GLOBAL_FLAGS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg === '--version' || arg === '--help' || arg === '-h') return allow();
    return deny(`unknown git option ${arg}`);
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) return allow();
  const execOption = rest.find((a) => GIT_EXEC_OPTION.test(a));
  if (execOption) return deny(`git option ${execOption} runs an external program`);
  if (GIT_READ_ONLY.has(sub)) return allow();
  switch (sub) {
    case 'branch':
      if (rest.every((a) => GIT_BRANCH_READ_FLAGS.has(a) || a.startsWith('--sort=') || a.startsWith('--format='))) return allow();
      break;
    case 'remote':
      if (rest.length === 0 || ['-v', '--verbose', 'get-url', 'show'].includes(rest[0])) return allow();
      break;
    case 'stash':
      if (['list', 'show'].includes(rest[0])) return allow();
      break;
    case 'worktree':
      if (rest[0] === 'list') return allow();
      break;
    case 'tag':
      if (rest.length === 0 || rest[0] === '-l' || rest[0] === '--list') return allow();
      break;
    case 'config':
      return gitConfigDecision(rest);
    case 'reflog':
      if (rest.length === 0 || rest[0] === 'show') return allow();
      break;
    default:
      break;
  }
  return deny(`git ${sub} is not allowed for the Developer`);
}

function ghApiDecision(args) {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-X' || arg === '--method') {
      if ((args[i + 1] ?? '').toUpperCase() !== 'GET') return deny('gh api write methods are not allowed');
      i += 1;
      continue;
    }
    const inline = arg.match(/^(?:-X|--method=)(.+)$/);
    if (inline && inline[1].toUpperCase() !== 'GET') return deny('gh api write methods are not allowed');
    if (GH_API_BODY_FLAGS.test(arg)) return deny('gh api request bodies are not allowed');
  }
  return allow();
}

function ghDecision(args) {
  const [group, action] = args;
  if (group === undefined || group === '--version' || group === '--help') return allow();
  if (group === 'api') return ghApiDecision(args.slice(1));
  if (Object.hasOwn(GH_READ_ONLY, group)) {
    const actions = GH_READ_ONLY[group];
    if (actions === null || actions.has(action)) return allow();
  }
  return deny(`gh ${group}${action ? ` ${action}` : ''} is not allowed for the Developer`);
}

function dockerDecision(args) {
  if (args.includes('push') || args.includes('login') || args.some((a) => a === '--push' || a.startsWith('--push='))) {
    return deny('docker push/login is not allowed for the Developer');
  }
  return allow();
}

function segmentDecision(tokens) {
  const segmentText = tokens.join(' ');
  for (const token of tokens) {
    for (const piece of token.replace(/^\d*[<>]+/, '').split(/[=,]/)) {
      if (piece && isProtectedPath(piece)) return deny(`command touches protected path ${piece}`);
    }
  }
  const stripped = stripPrefixes(tokens);
  if (stripped.error) return deny(stripped.error);
  const { rest, assigned } = stripped;
  if (!rest.length) return allow();
  if (/[$%*?]/.test(rest[0])) return deny(`program name ${rest[0]} cannot be resolved safely`);
  const program = programName(rest[0]);
  const args = rest.slice(1);

  if (program === 'git') {
    const execEnv = assigned.find((name) => EXEC_ENV_NAME.test(name));
    if (execEnv) return deny(`git with ${execEnv} set is not allowed for the Developer`);
    return gitDecision(args);
  }
  if (program === 'gh') return ghDecision(args);
  if (program === 'docker') return dockerDecision(args);
  if (DEPLOY_PROGRAMS.has(program)) return deny(`${program} is not allowed for the Developer`);
  if (['npm', 'pnpm', 'yarn'].includes(program)) {
    if (args.includes('publish')) return deny(`${program} publish is not allowed for the Developer`);
    if (['exec', 'dlx', 'x'].includes(args[0]) && SENSITIVE_WORD.test(segmentText)) {
      return deny(`${program} ${args[0]} with git/gh/deploy tools is not allowed`);
    }
    return allow();
  }
  if (EXEC_PROGRAMS.has(program) && SENSITIVE_WORD.test(args.join(' '))) {
    return deny(`${program} wrapping git/gh/deploy tools is not allowed`);
  }
  return allow();
}

export function decideCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') return deny('missing command');
  const dynamic = /\$\(|`|<\(|>\(/.test(command);
  if (dynamic && SENSITIVE_WORD.test(command)) {
    return deny('command substitution around git/gh/deploy tools is not allowed');
  }
  if (/\bgit\b/i.test(command) && EXEC_ENV_SET.test(command)) {
    return deny('setting Git, pager or editor variables around git is not allowed');
  }
  const segments = splitCommand(command);
  if (segments === null) {
    return SENSITIVE_WORD.test(command) ? deny('command could not be parsed safely') : allow();
  }
  for (const tokens of segments) {
    const result = segmentDecision(tokens);
    if (result.decision === 'deny') return result;
  }
  return allow();
}

export function decide(payload) {
  if (!payload || typeof payload !== 'object') return deny('malformed hook payload');
  const { tool_name: tool, tool_input: input } = payload;
  if (typeof tool !== 'string' || !input || typeof input !== 'object') return deny('malformed hook payload');

  if (SHELL_TOOLS.has(tool)) return decideCommand(input.command);

  if (EDIT_TOOLS.has(tool)) {
    const target = input.file_path ?? input.notebook_path;
    if (typeof target !== 'string' || target === '') return deny('missing file path');
    const absolute = resolve(typeof payload.cwd === 'string' ? payload.cwd : process.cwd(), target);
    if (isProtectedPath(target) || isProtectedPath(absolute)) return deny(`editing ${target} is not allowed for the Developer`);
    return allow();
  }

  return deny(`unexpected tool ${tool}`);
}

function main() {
  let result;
  try {
    result = decide(JSON.parse(readFileSync(0, 'utf8')));
  } catch (error) {
    result = deny(`guard error: ${error.message}`);
  }
  if (result.decision === 'deny') {
    process.stderr.write(`Route3 Developer guard blocked this call: ${result.reason}\n`);
    process.exit(2);
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
