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
