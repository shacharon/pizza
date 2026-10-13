#!/usr/bin/env node
// Route3 Cursor MCP guard (R3-006C-2): beforeMCPExecution, the only MCP hook.
//
// Allows the read-only tools of the approved R3-006C table and Origin
// create_pull_request. Every other tool, every unknown server and every
// payload without a server name is denied.

import { allow, deny, isMain, runHook } from './route3-common.mjs';

const GITKRAKEN_ALLOWED = new Set([
  'git_status', 'git_log_or_diff', 'git_blame', 'git_graph', 'repository_get_file_content',
  'pull_request_assigned_to_me', 'issues_get_detail', 'issues_assigned_to_me',
]);

const SERVERS = [
  {
    name: 'Origin',
    matches: (server) => /(^|[^a-z0-9])origin$/.test(server),
    allows: (tool) =>
      tool === 'create_pull_request' ||
      tool === 'grep_contents' ||
      tool === 'compare_commits' ||
      /^(get|list)_/.test(tool) ||
      /_read$/.test(tool),
  },
  {
    name: 'GitKraken',
    matches: (server) => /gitkraken|gitlens/.test(server),
    allows: (tool) => GITKRAKEN_ALLOWED.has(tool) || /^pull_request_get_/.test(tool),
  },
  {
    name: 'Atlassian',
    matches: (server) => /atlassian/.test(server),
    // mcp-atlassian prefixes tools with jira_ or confluence_.
    allows: (tool) => /^((jira|confluence)_)?(get|search)/.test(tool),
  },
];

// Cursor may send the bare tool name or one with a server prefix.
function baseToolName(toolName) {
  return toolName.toLowerCase().split(/:|__/).pop();
}

export function decide(payload) {
  if (!payload || typeof payload !== 'object') return deny('malformed hook payload.');
  const { mcp_server_name: serverName, tool_name: toolName } = payload;
  if (typeof serverName !== 'string' || serverName.trim() === '') return deny('MCP call without a server name.');
  if (typeof toolName !== 'string' || toolName.trim() === '') return deny('MCP call without a tool name.');

  const server = serverName.trim().toLowerCase();
  const tool = baseToolName(toolName.trim());
  const known = SERVERS.find((entry) => entry.matches(server));
  if (!known) return deny(`MCP server ${serverName} is not on the Route3 allow list.`);
  if (known.allows(tool)) return allow();
  return deny(`${known.name} MCP tool ${tool} is not allowed (only listed read-only tools${known.name === 'Origin' ? ' and create_pull_request' : ''}).`);
}

if (isMain(import.meta.url)) runHook(decide, 'MCP guard');
