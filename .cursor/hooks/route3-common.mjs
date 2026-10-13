// Shared helpers for the Route3 Cursor hooks (R3-006C-2).
//
// Every hook prints one Cursor permission response on stdout. A deny also
// exits 2, which Cursor treats as a block. Anything that throws is turned
// into a deny; a crash before that point is blocked by failClosed in
// .cursor/hooks.json.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const allow = () => ({ permission: 'allow' });
export const ask = (reason) => ({ permission: 'ask', reason });
export const deny = (reason) => ({ permission: 'deny', reason });

const RANK = { allow: 0, ask: 1, deny: 2 };

// Returns the strictest result. Ask reasons are joined so the prompt names
// every part of a compound command that needs approval.
export function strictest(results) {
  let worst = allow();
  const askReasons = [];
  for (const result of results) {
    if (result.permission === 'ask') askReasons.push(result.reason);
    if (RANK[result.permission] > RANK[worst.permission]) worst = result;
  }
  if (worst.permission === 'ask') return ask([...new Set(askReasons)].join(' '));
  return worst;
}

// Lower-cases, uses "/" and drops what Windows ignores at the end of a path
// segment (trailing dots and spaces, ":stream" suffixes).
export function pathSegments(path) {
  return String(path)
    .replace(/^file:\/+/i, '')
    .replace(/\\/g, '/')
    .toLowerCase()
    .split('/')
    .map((part, index) => {
      const withoutStream = index === 0 && /^[a-z]:$/.test(part) ? part : part.replace(/:.*$/, '');
      return withoutStream.replace(/[. ]+$/, (tail) => (withoutStream === tail ? tail : ''));
    })
    .filter(Boolean);
}

// .git/**, .cursor/hooks.json, .cursor/hooks/**, .claude/settings.json,
// .claude/settings.local.json and .claude/hooks/**, at any depth.
export function isProtectedPath(path) {
  const parts = pathSegments(path);
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    if (part === '.git') return true;
    if (part === '.cursor' && (next === 'hooks.json' || next === 'hooks')) return true;
    if (part === '.claude' && (next === 'settings.json' || next === 'settings.local.json' || next === 'hooks')) return true;
  }
  return false;
}

export function toCursorResponse(result, hookName) {
  const response = { permission: result.permission };
  if (result.permission !== 'allow') {
    response.user_message = `Route3 ${hookName}: ${result.reason}`;
    response.agent_message =
      result.permission === 'deny'
        ? `Route3 ${hookName} blocked this call: ${result.reason} Do not retry it another way.`
        : `Route3 ${hookName} is waiting for the user: ${result.reason}`;
  }
  return response;
}

// Cursor on Windows sends the payload with a UTF-8 byte order mark.
export function parsePayload(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/, ''));
}

// Reads the payload, applies decide() and writes the response.
export function runHook(decide, hookName) {
  let result;
  try {
    result = decide(parsePayload(readFileSync(0, 'utf8')));
    if (!result || !Object.hasOwn(RANK, result.permission)) result = deny('the guard returned no decision.');
  } catch (error) {
    result = deny(`guard error (${error.message}).`);
  }
  process.stdout.write(JSON.stringify(toCursorResponse(result, hookName)));
  process.exit(result.permission === 'deny' ? 2 : 0);
}

export function isMain(importMetaUrl) {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}
