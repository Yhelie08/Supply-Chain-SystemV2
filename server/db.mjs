// Local replacement for Zoho Creator's data layer: one SQLite table per Zoho form,
// generated from zoho-export/parsed/forms/*.json, plus Zoho-style read/write helpers.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(import.meta.dirname, '..');
const PARSED = path.join(ROOT, 'zoho-export', 'parsed');
// DATA_DIR holds the database and uploads; on Railway it points at a persistent volume.
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const forms = Object.fromEntries(
  fs.readdirSync(path.join(PARSED, 'forms')).map((f) => {
    const form = JSON.parse(fs.readFileSync(path.join(PARSED, 'forms', f), 'utf8'));
    return [form.name, form];
  }),
);
export const reports = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(PARSED, 'reports.json'), 'utf8')).map((r) => [r.name, r]));

const NO_VALUE = new Set(['section', 'help_text', 'plaintext', 'submit', 'cancel', 'tooltip']);
const NUMBER = new Set(['number', 'decimal', 'percentage', 'CNY', 'PHP', 'currency', 'autonumber']);
const JSONISH = new Set(['grid', 'name', 'address', 'checkboxes', 'list']);

// Per form: { colName: { type, kind: 'num'|'bool'|'json'|'text', lookup } }
export const columns = {};
for (const form of Object.values(forms)) {
  const cols = {};
  for (const f of form.fields) {
    if (NO_VALUE.has(f.type) || !f.type) continue;
    const kind = f.type === 'checkbox' ? 'bool' : NUMBER.has(f.type) ? 'num' : JSONISH.has(f.type) ? 'json' : 'text';
    cols[f.name] = { type: f.type, kind, lookup: typeof f.lookup === 'object' ? f.lookup.form : null };
  }
  columns[form.name] = cols;
}

export const db = new DatabaseSync(path.join(DATA_DIR, 'app.db'));
db.exec('PRAGMA journal_mode = WAL');
const q = (name) => `"${name.replace(/"/g, '""')}"`;
const sqlType = { num: 'REAL', bool: 'INTEGER', json: 'TEXT', text: 'TEXT' };

// Create missing tables/columns so the schema always follows the latest .ds export.
for (const [form, cols] of Object.entries(columns)) {
  db.exec(`CREATE TABLE IF NOT EXISTS ${q(form)} (ID INTEGER PRIMARY KEY AUTOINCREMENT, Added_Time TEXT, Modified_Time TEXT, Added_User TEXT, _extra TEXT)`);
  const have = new Set(db.prepare(`PRAGMA table_info(${q(form)})`).all().map((c) => c.name));
  for (const [name, c] of Object.entries(cols)) if (!have.has(name)) db.exec(`ALTER TABLE ${q(form)} ADD COLUMN ${q(name)} ${sqlType[c.kind]}`);
}
// Zoho record IDs are long numbers; start ours high so they look and sort the same way.
db.exec(`INSERT OR IGNORE INTO sqlite_sequence(name, seq) SELECT name, 4900000000000 FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN (SELECT name FROM sqlite_sequence)`);

export class ZohoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function formOfReport(reportName) {
  const r = reports[reportName];
  if (r?.form && columns[r.form]) return { form: r.form, criteria: r.criteria, report: r };
  if (columns[reportName]) return { form: reportName, criteria: null, report: null };
  throw new ZohoError(9230, `Report '${reportName}' not found in the parsed .ds`);
}
export function formByName(formName) {
  if (!columns[formName]) throw new ZohoError(9220, `Form '${formName}' not found in the parsed .ds`);
  return formName;
}

const pad = (n) => String(n).padStart(2, '0');
export function zohoNow(d = new Date()) {
  const h = d.getHours() % 12 || 12;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// ---------- rows <-> Zoho records ----------
// What a lookup shows for its target form, taken from the .ds "displayformat" of the fields that
// point at it, e.g. Customer -> [customer_name], Suppliers -> [" " + Supplier_Name.first_name].
const DISPLAY = {};
for (const form of Object.values(forms)) {
  for (const f of form.fields) {
    const m = f.lookup?.form && !DISPLAY[f.lookup.form] && /(\w+)(?:\.(\w+))?\s*\]/.exec(f.displayformat || '');
    if (m) DISPLAY[f.lookup.form] = { field: m[1], part: m[2] };
  }
}

function displayOf(form, id) {
  if (!id || !columns[form]) return '';
  const row = db.prepare(`SELECT * FROM ${q(form)} WHERE ID = ?`).get(Number(id));
  if (!row) return '';
  const d = DISPLAY[form];
  if (d && columns[form][d.field] && row[d.field] != null && row[d.field] !== '') {
    if (columns[form][d.field].kind !== 'json') return String(row[d.field]);
    const j = JSON.parse(row[d.field]);
    return String((d.part ? j[d.part] : [j.first_name, j.last_name].filter(Boolean).join(' ')) ?? '');
  }
  for (const [name, c] of Object.entries(columns[form])) {
    const v = row[name];
    if (c.kind === 'text' && v != null && v !== '' && !c.lookup) return String(v);
    if (c.type === 'name' && v) { const n = JSON.parse(v); return [n.first_name, n.last_name].filter(Boolean).join(' '); }
  }
  return String(id);
}

export function toRecord(form, row, { raw = false } = {}) {
  const rec = { ID: String(row.ID), Added_Time: row.Added_Time || '', Modified_Time: row.Modified_Time || '', Added_User: row.Added_User || '' };
  for (const [name, c] of Object.entries(columns[form])) {
    let v = row[name];
    if (c.kind === 'json') {
      v = v ? JSON.parse(v) : c.type === 'grid' || c.type === 'list' || c.type === 'checkboxes' ? [] : '';
      // Zoho gives a name field its display text too; widgets show that (and fall back to the ID without it)
      if (c.type === 'name' && v && typeof v === 'object' && !Array.isArray(v)) {
        v = { ...v, zc_display_value: [v.prefix, v.first_name, v.last_name, v.suffix].filter(Boolean).join(' ') };
      }
    }
    else if (c.kind === 'bool') v = v === 1 || v === true;
    else if (c.kind === 'num') v = v == null ? '' : String(v);
    else v = v ?? '';
    if (!raw && c.lookup && v !== '' && v != null) {
      const one = (id) => { const dv = displayOf(c.lookup, id); return { ID: String(id), display_value: dv, zc_display_value: dv }; };
      v = Array.isArray(v) ? v.map(one) : one(v);
    }
    rec[name] = v;
  }
  if (row._extra) Object.assign(rec, JSON.parse(row._extra));
  return rec;
}

const idOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.ID ?? v.id ?? '' : v);
function encode(form, data, existingExtra) {
  const cols = columns[form], out = {}, extra = existingExtra ? JSON.parse(existingExtra) : {};
  for (let [k, v] of Object.entries(data || {})) {
    const c = cols[k];
    if (!c) { if (!['ID', 'Added_Time', 'Modified_Time', 'Added_User'].includes(k)) extra[k] = v; continue; }
    if (c.lookup) v = Array.isArray(v) ? v.map(idOf) : idOf(v);
    if (c.kind === 'json') {
      if (c.type === 'grid' && Array.isArray(v)) v = v.map((r, i) => ({ ID: r.ID || String(Date.now()) + i, ...r }));
      out[k] = v === '' || v == null ? null : JSON.stringify(v);
    } else if (c.kind === 'bool') out[k] = v === true || v === 'true' || v === 1 || v === '1' ? 1 : 0;
    else if (c.kind === 'num') out[k] = v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
    else out[k] = v == null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
  return { out, extra: Object.keys(extra).length ? JSON.stringify(extra) : null };
}

// ---------- Zoho criteria -> JS predicate ----------
const TOKEN = /\s+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\d+(?:\.\d+)?|&&|\|\||==|!=|>=|<=|>|<|\(|\)|!|,|\.(?:contains|startsWith|endsWith)\s*\(|[A-Za-z_]\w*(?:\.(?!contains\b|startsWith\b|endsWith\b)\w+)*/y;
export function compileCriteria(src, ctx = {}) {
  if (!src || !String(src).trim()) return () => true;
  let js = '', m; TOKEN.lastIndex = 0;
  const s = String(src);
  while (TOKEN.lastIndex < s.length) {
    const at = TOKEN.lastIndex;
    if (!(m = TOKEN.exec(s))) throw new ZohoError(3330, `Unsupported criteria near: ${s.slice(at, at + 30)}`);
    const t = m[0];
    if (/^\s+$/.test(t)) js += ' ';
    else if (/^["']/.test(t)) js += JSON.stringify(t.slice(1, -1).replace(/\\(.)/g, '$1'));
    else if (/^(true|false|null)$/.test(t)) js += t;
    else if (t === 'zoho.currentdate') js += JSON.stringify(today());
    else if (t === 'zoho.loginuser' || t === 'zoho.loginuserid') js += JSON.stringify(ctx.user || '');
    else if (/^\.(contains|startsWith|endsWith)/.test(t)) js += t.startsWith('.contains') ? '.includes(' : t.replace(/\s*\($/, '') + '(';
    else if (/^[A-Za-z_]/.test(t)) js += `v(${JSON.stringify(t)})`;
    else js += t;
  }
  // eslint-disable-next-line no-new-func
  const fn = new Function('v', `return (${js});`);
  return (rec) => {
    const v = (name) => {
      let x = rec[name.split('.')[0]];
      if (x && typeof x === 'object' && !Array.isArray(x) && 'ID' in x) x = x.ID;
      if (x === '' || x === undefined) return null;
      if (name === 'ID' || (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x) && x.length < 16)) return Number(x);
      return x;
    };
    try { return !!fn(v); } catch { return false; }
  };
}

// ---------- operations used by the widget SDK ----------
export function getRecords(reportName, { criteria, page = 1, pageSize, max_records, user } = {}) {
  const { form, criteria: reportCriteria } = formOfReport(reportName);
  let reportTest = () => true;
  try { reportTest = compileCriteria(reportCriteria, { user }); } catch (e) { console.warn(`[report ${reportName}] criteria ignored: ${e.message}`); }
  const test = compileCriteria(criteria, { user });
  const all = db.prepare(`SELECT * FROM ${q(form)} ORDER BY ID`).all().map((r) => toRecord(form, r)).filter((r) => reportTest(r) && test(r));
  const size = Math.min(Number(pageSize || max_records || 200), 1000);
  return all.slice((Number(page) - 1) * size, Number(page) * size);
}

export function getRecordById(reportName, id) {
  const { form } = formOfReport(reportName);
  const row = db.prepare(`SELECT * FROM ${q(form)} WHERE ID = ?`).get(Number(id));
  if (!row) throw new ZohoError(9280, 'No records found for the given criteria.');
  return toRecord(form, row);
}

export function addRecord(formName, data, user = '') {
  const form = formByName(formName);
  for (const [k, c] of Object.entries(columns[form])) {
    if (c.type === 'autonumber' && (data[k] == null || data[k] === '')) {
      data[k] = (db.prepare(`SELECT MAX(${q(k)}) AS m FROM ${q(form)}`).get().m || 0) + 1;
    }
  }
  const { out, extra } = encode(form, data);
  const now = zohoNow();
  const cols = ['Added_Time', 'Modified_Time', 'Added_User', '_extra', ...Object.keys(out)];
  const vals = [now, now, user, extra, ...Object.values(out)];
  const res = db.prepare(`INSERT INTO ${q(form)} (${cols.map(q).join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
  return String(res.lastInsertRowid);
}

export function updateRecord(reportOrForm, id, data, { byForm = false } = {}) {
  const form = byForm ? formByName(reportOrForm) : formOfReport(reportOrForm).form;
  const row = db.prepare(`SELECT _extra FROM ${q(form)} WHERE ID = ?`).get(Number(id));
  if (!row) throw new ZohoError(9280, 'No records found for the given criteria.');
  const { out, extra } = encode(form, data, row._extra);
  const sets = { ...out, _extra: extra, Modified_Time: zohoNow() };
  db.prepare(`UPDATE ${q(form)} SET ${Object.keys(sets).map((k) => `${q(k)} = ?`).join(', ')} WHERE ID = ?`).run(...Object.values(sets), Number(id));
  return String(id);
}

export function deleteRecord(reportName, id) {
  const { form } = formOfReport(reportName);
  const res = db.prepare(`DELETE FROM ${q(form)} WHERE ID = ?`).run(Number(id));
  if (!res.changes) throw new ZohoError(9280, 'No records found for the given criteria.');
  return String(id);
}

// Deluge-style helpers for ported functions:  find('Form', rec => ...)  /  update('Form', id, {...})
export const find = (form, test = () => true) =>
  db.prepare(`SELECT * FROM ${q(formByName(form))} ORDER BY ID`).all().map((r) => toRecord(form, r, { raw: true })).filter(test);

export function tableCounts() {
  return Object.keys(columns).map((f) => ({ form: f, rows: db.prepare(`SELECT COUNT(*) AS n FROM ${q(f)}`).get().n })).filter((x) => x.rows);
}
