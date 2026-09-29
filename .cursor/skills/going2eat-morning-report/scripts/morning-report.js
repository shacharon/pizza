#!/usr/bin/env node
/**
 * Going2Eat morning report from CloudWatch /ecs/food-backend.
 * AWS profile pizza, region eu-north-1. Not Dating.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PROFILE = 'pizza';
const REGION = 'eu-north-1';
const LOG_GROUP = '/ecs/food-backend';
const TZ = 'Asia/Jerusalem';
const WINDOW_DAYS = 7;

function awsJson(args) {
  const file = path.join(os.tmpdir(), `g2e-aws-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  const argLine = args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ');
  try {
    execFileSync('cmd.exe', ['/d', '/c', `chcp 65001 >nul & aws ${argLine} > ${file}`], {
      encoding: 'utf8',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
    });
    const out = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(out || '{}');
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function startQuery(queryString, startTime, endTime) {
  const file = path.join(os.tmpdir(), `g2e-cw-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({
      logGroupNames: [LOG_GROUP],
      startTime,
      endTime,
      queryString,
    })
  );
  try {
    const res = awsJson([
      'logs',
      'start-query',
      '--cli-input-json',
      `file://${file}`,
      '--profile',
      PROFILE,
      '--region',
      REGION,
    ]);
    return res.queryId;
  } finally {
    try {
      fs.unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function waitResults(queryId) {
  for (let i = 0; i < 40; i++) {
    const res = awsJson([
      'logs',
      'get-query-results',
      '--query-id',
      queryId,
      '--profile',
      PROFILE,
      '--region',
      REGION,
    ]);
    if (res.status === 'Complete' || res.status === 'Failed' || res.status === 'Cancelled') {
      return res;
    }
    execFileSync(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 1500)']);
  }
  throw new Error(`Insights query timed out: ${queryId}`);
}

function rowsFromInsights(results) {
  return (results || []).map((cols) => {
    const row = {};
    for (const c of cols) row[c.field] = c.value;
    return row;
  });
}

function jerusalemDay(isoOrTs) {
  const d = new Date(isoOrTs.includes('T') ? isoOrTs : isoOrTs.replace(' ', 'T') + 'Z');
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function parseAudit(message) {
  try {
    return JSON.parse(message);
  } catch {
    return null;
  }
}

function main() {
  const ident = awsJson(['sts', 'get-caller-identity', '--profile', PROFILE, '--region', REGION]);
  if (String(ident.Account) !== '907390934996') {
    throw new Error(`Wrong AWS account ${ident.Account} (want 907390934996 / pizza)`);
  }

  const endTime = Math.floor(Date.now() / 1000);
  const startTime = endTime - WINDOW_DAYS * 24 * 3600;

  const auditId = startQuery(
    'fields @timestamp, @message | filter @message like /"event":"search_audit"/ | sort @timestamp asc | limit 10000',
    startTime,
    endTime
  );
  const errId = startQuery(
    'fields @timestamp, @message | filter @message like /"level":"error"/ or @message like /"event":"pipeline_failed"/ | sort @timestamp desc | limit 50',
    startTime,
    endTime
  );

  const auditRes = waitResults(auditId);
  const errRes = waitResults(errId);
  if (auditRes.status !== 'Complete') throw new Error(`audit query ${auditRes.status}`);
  if (errRes.status !== 'Complete') throw new Error(`error query ${errRes.status}`);

  const audits = rowsFromInsights(auditRes.results)
    .map((r) => {
      const j = parseAudit(r['@message'] || '');
      if (!j || j.event !== 'search_audit') return null;
      return {
        ts: r['@timestamp'],
        day: jerusalemDay(r['@timestamp']),
        query: String(j.query || '').trim() || '(empty)',
        queryHash: j.queryHash || 'none',
        sessionId: j.sessionId || 'none',
        kind: j.kind || '',
        good: j.good,
        reason: j.reason || '',
        resultCount: j.resultCount,
        requestId: j.requestId,
        entry: j.entry === 'qr' ? 'qr' : '',
      };
    })
    .filter(Boolean);

  const weekHashes = new Set(audits.map((a) => a.queryHash));
  const weekSessions = new Set(audits.map((a) => a.sessionId));

  const byDay = new Map();
  for (const a of audits) {
    if (!byDay.has(a.day)) {
      byDay.set(a.day, { tries: 0, hashes: new Set(), queries: new Map() });
    }
    const d = byDay.get(a.day);
    d.tries += 1;
    d.hashes.add(a.queryHash);
    d.queries.set(a.query, (d.queries.get(a.query) || 0) + 1);
  }

  const auditErrors = audits.filter((a) => a.kind === 'error' || a.kind === 'timeout');
  const empty = audits.filter((a) => a.kind === 'no_results');
  const cwErrors = rowsFromInsights(errRes.results).map((r) => {
    const j = parseAudit(r['@message'] || '') || {};
    return {
      ts: r['@timestamp'],
      event: j.event || '',
      msg: j.msg || String(r['@message'] || '').slice(0, 180),
    };
  });

  const days = [...byDay.keys()].sort();
  const lines = [];
  lines.push(`# Going2Eat morning report`);
  lines.push(``);
  lines.push(`Account ${ident.Account} · profile \`${PROFILE}\` · \`${LOG_GROUP}\``);
  lines.push(`Window: last ${WINDOW_DAYS} days · days in \`${TZ}\``);
  lines.push(``);
  lines.push(`## Week`);
  lines.push(`- **${audits.length}** searches (each \`search_audit\` = one try)`);
  lines.push(`- **${weekHashes.size}** unique searches (queryHash)`);
  lines.push(`- **${weekSessions.size}** unique sessions`);
  lines.push(``);
  lines.push(`## Daily — unique searches`);
  if (days.length === 0) {
    lines.push(`No \`search_audit\` in this window (event exists from 2026-09-20).`);
  } else {
    for (const day of days) {
      const d = byDay.get(day);
      lines.push(`### ${day}`);
      lines.push(`- tries: **${d.tries}** · unique searches: **${d.hashes.size}**`);
      const ranked = [...d.queries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      for (const [q, n] of ranked) {
        lines.push(`  - \`${q.replace(/`/g, "'")}\` ×${n}`);
      }
      lines.push(``);
    }
  }

  const qrAudits = audits.filter((a) => a.entry === 'qr');
  lines.push(`## QR card`);
  lines.push(`Link: https://app.going2eat.food/q`);
  if (qrAudits.length === 0) {
    lines.push(`No QR searches in this window.`);
  } else {
    lines.push(`- **${qrAudits.length}** searches from the QR`);
    lines.push(`- **${new Set(qrAudits.map((a) => a.sessionId)).size}** sessions`);
    const qrQueries = new Map();
    for (const a of qrAudits) qrQueries.set(a.query, (qrQueries.get(a.query) || 0) + 1);
    for (const [q, n] of [...qrQueries.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      lines.push(`  - \`${q.replace(/`/g, "'")}\` ×${n}`);
    }
  }
  lines.push(``);
  lines.push(`## Errors`);
  if (empty.length) {
    lines.push(`Empty results (\`no_results\`): **${empty.length}** (not counted as errors)`);
  }
  if (auditErrors.length === 0 && cwErrors.length === 0) {
    lines.push(`None in this window.`);
  } else {
    if (auditErrors.length) {
      lines.push(`Search failures (error / timeout): **${auditErrors.length}**`);
      for (const a of auditErrors.slice(0, 20)) {
        lines.push(`- ${a.ts} · ${a.kind} · ${a.reason} · \`${String(a.query).replace(/`/g, "'")}\``);
      }
    }
    if (cwErrors.length) {
      lines.push(`CloudWatch error / pipeline_failed lines: **${cwErrors.length}** (showing up to 20)`);
      for (const e of cwErrors.slice(0, 20)) {
        const msg = String(e.msg).replace(/\s+/g, ' ').slice(0, 160);
        lines.push(`- ${e.ts} · ${e.event || 'error'} · ${msg}`);
      }
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

main();
