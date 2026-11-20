// Runs tests/fixtures/golden_fulfillment_flow.script.json on the Node side (PGlite + the hooked store) and writes the
// snapshots to tests/fixtures/golden_fulfillment_flow.expected.json. Node is the reference: the Python replay must produce
// the same snapshots. Re-run only when the script changes on purpose:
//     node tools/golden-flow-node.mjs                       writes the expected file
//     node tools/golden-flow-node.mjs --out=<file>          writes somewhere else (used to compare two runs)
// Time is not frozen: everything that depends on "today" is masked (see maskValue), and the run is checked on two
// different frozen days by tools/golden-flow-node.mjs's `--freeze=YYYY-MM-DD` switch.
import fs from 'node:fs';
import path from 'node:path';

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || '').slice(name.length + 3);
const freeze = arg('freeze');
if (freeze) { // a fixed "now", to prove the snapshots do not depend on the day
  const RealDate = Date;
  const base = new RealDate(`${freeze}T09:30:00`).getTime();
  const started = RealDate.now();
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [base + (RealDate.now() - started)])); }
    static now() { return base + (RealDate.now() - started); }
  };
}
const { PGlite } = await import('@electric-sql/pglite');
const { ensureSchema } = await import('../server/pg/schema.mjs');
const { createStore } = await import('../server/pg/store.mjs');
const { createHookedStore } = await import('../server/workflows/index.mjs');
const { workflows } = await import('../server/workflows/all.mjs');

const SCRIPT = path.resolve('tests', 'fixtures', 'golden_fulfillment_flow.script.json');
const OUT = arg('out') || path.resolve('tests', 'fixtures', 'golden_fulfillment_flow.expected.json');
const script = JSON.parse(fs.readFileSync(SCRIPT, 'utf8'));

const db = new PGlite();
await ensureSchema(db);
const raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
const store = createHookedStore(raw, workflows);

const ids = {};
const resolveRefs = (v) => (typeof v === 'string' && v.startsWith('$') && v.slice(1) in ids ? ids[v.slice(1)] : Array.isArray(v) ? v.map(resolveRefs) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(x)])) : v);
const byId = (a, b) => (BigInt(a.ID) < BigInt(b.ID) ? -1 : BigInt(a.ID) > BigInt(b.ID) ? 1 : 0);

// ---- masking: what is not the same from one run to the next (or between Node and Python) ----
const pad = (n) => String(n).padStart(2, '0');
const nowD = new Date();
const TODAY = `${nowD.getFullYear()}-${pad(nowD.getMonth() + 1)}-${pad(nowD.getDate())}`;
const TS = /^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}(:\d{2})?(\.\d+)?( ?[AP]M|Z)?$/i;
const SYSTEM = new Set(['ID', 'Added_Time', 'Modified_Time', 'Added_User']);
function maskValue(key, v, labelOfId) {
  if (/^Forecast/.test(key)) return '<forecast>';          // computed from today by the forecast engine
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map((x) => maskValue('', x, labelOfId));
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SYSTEM.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, maskValue(k, x, labelOfId)]));
  if (typeof v === 'string') {
    if (TS.test(v)) return '<timestamp>';
    if (v === TODAY) return '<today>';
    if (/^\d{15,}$/.test(v) && labelOfId.has(v)) return labelOfId.get(v);
  }
  return v;
}

async function snapshot() {
  const tables = {};
  const labelOfId = new Map();
  for (const form of script.tracked_forms) { // first pass: a label for every id ("Pick1#2"), in creation order
    (await raw.find(form)).sort(byId).forEach((r, i) => labelOfId.set(String(r.ID), `${form}#${i + 1}`));
  }
  for (const form of script.tracked_forms) {
    tables[form] = (await raw.find(form)).sort(byId).map((r) => {
      const out = { '_id': labelOfId.get(String(r.ID)) };
      for (const [k, v] of Object.entries(r).sort(([a], [b]) => (a < b ? -1 : 1))) if (!SYSTEM.has(k)) out[k] = maskValue(k, v, labelOfId);
      return out;
    });
  }
  return tables;
}

const snapshots = [];
for (const [n, step] of script.steps.entries()) {
  if (step.op === 'add') {
    const target = step.store === 'raw' ? raw : store;
    ids[step.as] = String(await target.addRecord(step.form, resolveRefs(step.data)));
  } else if (step.op === 'update') {
    const rows = (await raw.find(step.form, (r) => Object.entries(step.where).every(([k, v]) => String(r[k] ?? '') === String(v)))).sort(byId);
    const row = rows[step.nth ?? 0];
    if (!row) throw new Error(`step ${n + 1} (${step.form} ${JSON.stringify(step.where)}): no matching row`);
    await store.updateRecord(step.form, row.ID, resolveRefs(step.data), { byForm: true });
  } else if (step.op === 'snapshot') {
    snapshots.push({ name: step.name, tables: await snapshot() });
  } else throw new Error(`step ${n + 1}: unknown op ${step.op}`);
}
const known_defects = [
  'Stage_Events: only the first stage of a package is logged (package.order_readiness here). advanceStage / reconcileFulfillment / the QC, crate and dispatch routing write Fulfillment_Stage through the RAW store inside a hook, which never fires the Stage_Events afterUpdate hook, so Picking, Pack & QC, Order Aggregation and For Delivery are never logged. Found 2026-11-19. This file records the current Node behavior on purpose; when the Python port fixes it, regenerate the expectation deliberately.',
];
fs.writeFileSync(OUT, JSON.stringify({ _about: 'Expected snapshots of golden_fulfillment_flow.script.json, written by the Node reference (tools/golden-flow-node.mjs). Ids, timestamps, today and forecast fields are masked.', known_defects, snapshots }, null, 1));
const sizes = snapshots.map((s) => Object.values(s.tables).reduce((a, t) => a + t.length, 0));
console.log(`wrote ${OUT}: ${snapshots.length} snapshots, rows per snapshot ${sizes.join(' ')}`);
await db.close();
process.exit(0);
