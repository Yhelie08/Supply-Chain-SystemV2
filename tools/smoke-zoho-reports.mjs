// Read-only smoke test: every report an admin widget reads must answer from live Zoho Creator.
//   SMOKE_EMAIL=... SMOKE_PASSWORD=... [SMOKE_BASE=http://localhost:4100] node tools/smoke-zoho-reports.mjs
// Start the server first with BACKEND=zoho. Only getRecords is called, nothing is written to Zoho.
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4100';
const SECTIONS = ['Analytic', 'Procurement', 'Fulfillment', 'Delivery Management'];
const MODULES = path.resolve(import.meta.dirname, '..', 'modules');

// report name -> Set of "Section/Tab" that use it
const usedBy = new Map();
const NAME = /(?:report_name|reportName)\s*[:=]\s*["'](\w+)["']|(?:const|let|var)\s+\w*(?:REPORT|Report)\w*\s*=\s*["'](\w+)["']/g;
function scan(dir, tab) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) scan(p, tab);
    else if (/\.(js|html)$/.test(e.name)) {
      for (const m of fs.readFileSync(p, 'utf8').matchAll(NAME)) {
        const r = m[1] || m[2];
        if (r.startsWith('TODO_')) continue; // placeholder the widget itself switches off
        if (!usedBy.has(r)) usedBy.set(r, new Set());
        usedBy.get(r).add(tab);
      }
    }
  }
}
for (const s of SECTIONS) {
  const sd = path.join(MODULES, s);
  if (!fs.existsSync(sd)) continue;
  for (const t of fs.readdirSync(sd, { withFileTypes: true })) if (t.isDirectory()) scan(path.join(sd, t.name), `${s}/${t.name}`);
}

const login = await fetch(`${BASE}/login`, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ email: process.env.SMOKE_EMAIL, password: process.env.SMOKE_PASSWORD, next: '/' }),
});
const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
if (!cookie) { console.error('Sign-in failed: check SMOKE_EMAIL / SMOKE_PASSWORD.'); process.exit(1); }

const result = new Map();
for (const r of [...usedBy.keys()].sort()) {
  const res = await fetch(`${BASE}/api/getRecords`, { method: 'POST', headers: { 'Content-Type': 'application/json', cookie }, body: JSON.stringify({ report_name: r }) });
  const j = await res.json().catch(() => ({ code: res.status, message: 'bad response' }));
  const rows = Array.isArray(j.data) ? j.data.length : null;
  result.set(r, { code: j.code, rows, note: j.code !== 3000 ? String(j.message || '').slice(0, 80) : rows === 200 ? 'at 200-row cap' : '' });
}

console.log('REPORT'.padEnd(44), 'CODE'.padEnd(6), 'ROWS'.padEnd(6), 'NOTE');
for (const [r, v] of result) console.log(r.padEnd(44), String(v.code).padEnd(6), String(v.rows ?? '-').padEnd(6), v.note);

const tabs = new Map();
for (const [r, set] of usedBy) for (const t of set) (tabs.get(t) || tabs.set(t, []).get(t)).push(r);
console.log('\nTAB'.padEnd(46), 'STATUS');
let bad = 0;
for (const [t, rs] of [...tabs].sort()) {
  const failed = rs.filter((r) => result.get(r).code !== 3000);
  if (failed.length) bad++;
  console.log(t.padEnd(45), failed.length ? `FAIL: ${failed.join(', ')}` : 'ok');
}
console.log(`\n${result.size} reports, ${tabs.size} tabs with report reads, ${bad} tabs failing.`);
process.exit(bad ? 1 : 0);
