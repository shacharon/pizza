#!/usr/bin/env node
// Route3 Cursor edit guard (R3-006C-2): preToolUse, matcher ^(Write|Delete)$.
//
// Cursor does not enforce "ask" on preToolUse, so this hook returns only
// allow or deny. It denies Write and Delete on .git/**, .cursor/hooks.json,
// .cursor/hooks/**, .claude/settings.json, .claude/settings.local.json and
// .claude/hooks/**. Changes made through the shell (>, Set-Content,
// Remove-Item) do not reach this hook.

import { isAbsolute, resolve } from 'node:path';
import { allow, deny, isMain, isProtectedPath, runHook } from './route3-common.mjs';

const EDIT_TOOLS = new Set(['write', 'delete']);

// Cursor 3.23 does not document which tool_input field holds the path, so
// every path-like field is checked.
const PATH_KEYS = new Set([
  'path', 'paths', 'file', 'files', 'filepath', 'filename', 'target', 'targetfile',
  'targetpath', 'uri', 'notebookpath', 'oldpath', 'newpath', 'source', 'destination',
  'dest', 'relativeworkspacepath',
]);

function pathValues(input) {
  const found = [];
  const add = (value) => {
    if (typeof value === 'string' && value.trim() !== '') found.push(value);
    else if (Array.isArray(value)) value.forEach(add);
  };
  for (const [key, value] of Object.entries(input)) {
    if (PATH_KEYS.has(key.toLowerCase().replace(/[_-]/g, ''))) add(value);
  }
  if (found.length) return found;
  // Unknown field names: fall back to short single-line strings that look
  // like a path. File contents are skipped.
  for (const value of Object.values(input)) {
    if (typeof value === 'string' && value.length < 1024 && !/[\r\n]/.test(value) && /[\\/.]/.test(value)) found.push(value);
  }
  return found;
}

export function decide(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return deny('malformed hook payload.');
  if (typeof payload.tool_name !== 'string' || payload.tool_name === '') return deny('hook payload without a tool name.');
  const tool = payload.tool_name.toLowerCase();
  if (!EDIT_TOOLS.has(tool)) return allow();

  let input = payload.tool_input;
  if (typeof input === 'string') input = JSON.parse(input);
  if (!input || typeof input !== 'object') return deny(`${payload.tool_name} call without tool input.`);

  const targets = pathValues(input);
  if (!targets.length) return deny(`cannot find the target path of this ${payload.tool_name} call.`);

  const base = typeof payload.cwd === 'string' && payload.cwd
    ? payload.cwd
    : Array.isArray(payload.workspace_roots) && typeof payload.workspace_roots[0] === 'string'
      ? payload.workspace_roots[0]
      : process.cwd();
  for (const target of targets) {
    const cleaned = target.replace(/^file:\/+/i, '');
    const absolute = isAbsolute(cleaned) ? cleaned : resolve(base, cleaned);
    if (isProtectedPath(target) || isProtectedPath(absolute)) {
      return deny(`${payload.tool_name} on ${target} is not allowed. Hook, settings and .git files change only in their own enforcement Story, with the owner turning the hook off.`);
    }
  }
  return allow();
}

if (isMain(import.meta.url)) runHook(decide, 'edit guard');
