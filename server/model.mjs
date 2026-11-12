// The data model parsed from the Zoho export (zoho-export/parsed): forms, reports and the typed
// column list of every form. No database code here, so the SQLite and Postgres stores share it.
import fs from 'node:fs';
import path from 'node:path';
import { ZohoError } from './criteria.mjs';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const PARSED = path.join(ROOT, 'zoho-export', 'parsed');

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

// How Zoho shows a record of each form when another form looks it up, e.g. Items -> "[item_name]",
// Suppliers -> `[" " + Supplier_Name.first_name]` (the form's lookup fields all agree on one format).
export const lookupDisplay = {};
for (const form of Object.values(forms)) {
  for (const f of form.fields) {
    if (f.lookup && typeof f.lookup === 'object' && f.displayformat) lookupDisplay[f.lookup.form] ??= f.displayformat;
  }
}

// Evaluates a display format such as `[customer_name]` or `[" " + Supplier_Name.first_name]` on a stored row.
// Only field names (with a dotted part for name/address fields), string literals and + are understood; anything
// else gives '' so the caller can fall back.
export function displayFromFormat(format, row) {
  const inner = String(format ?? '').trim().replace(/^\[/, '').replace(/\]$/, '');
  const token = /\s*(?:"((?:[^"\\]|\\.)*)"|([A-Za-z_]\w*(?:\.\w+)*)|(\+))/y;
  let out = '', expectValue = true, m;
  token.lastIndex = 0;
  while (token.lastIndex < inner.length) {
    if (!(m = token.exec(inner))) return '';
    if (m[3]) { if (expectValue) return ''; expectValue = true; continue; }
    if (!expectValue) return '';
    expectValue = false;
    if (m[1] !== undefined) out += m[1].replace(/\\(.)/g, '$1');
    else {
      const [field, ...path] = m[2].split('.');
      let v = row[field];
      for (const p of path) v = v?.[p];
      out += v == null || typeof v === 'object' ? '' : String(v);
    }
  }
  return expectValue ? '' : out;
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

// Columns every table has besides the form's own fields.
export const SYSTEM_COLUMNS = ['ID', 'Added_Time', 'Modified_Time', 'Added_User', '_extra'];
