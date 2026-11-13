// Read-only backup of every form's records from Zoho Creator (the environment in ZOHO_ENV).
// Nothing is written to Zoho. Output goes to data/zoho-backup/<env>-<timestamp>/ (data/ is gitignored).
//
//   node --env-file-if-exists=.env tools/export-zoho-data.mjs [--dry-run] [--only=Form_A,Form_B] [--out=dir]
//
// For each form it reads the unfiltered "list" report with the most columns. A report only returns the
// columns it displays, so the manifest compares the fields seen in the data with the form's field count:
// a form flagged "fewer fields than the form" needs a fuller report in Zoho before the final export.
import fs from 'node:fs';
import path from 'node:path';
import { zohoReader } from './zoho/reader.mjs'; // read-only: GET calls only

const PARSED = path.resolve(import.meta.dirname, '..', 'zoho-export', 'parsed');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const env = process.env.ZOHO_ENV || 'development';
const only = args.only ? new Set(String(args.only).split(',')) : null;

const forms = JSON.parse(fs.readFileSync(path.join(PARSED, 'forms.json'), 'utf8'));
const reports = JSON.parse(fs.readFileSync(path.join(PARSED, 'reports.json'), 'utf8'));

// Unfiltered list report with the most columns wins; a filtered one is used only if nothing else exists.
function pickReport(form) {
  const lists = reports.filter((r) => r.form === form.name && r.type === 'list');
  const rank = (r) => [r.criteria ? 0 : 1, (r.columns || []).length, r.isDefault ? 1 : 0];
  lists.sort((a, b) => { const x = rank(a), y = rank(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; });
  return lists[0] || null;
}

const plan = forms.filter((f) => !only || only.has(f.name)).map((f) => ({ form: f, report: pickReport(f) }));

if (args['dry-run']) {
  console.log(`Environment: ${env} (dry run, no API calls)`);
  for (const { form, report } of plan) {
    console.log(form.name.padEnd(42), report ? `${report.name}${report.criteria ? '  [FILTERED]' : ''}` : '-- no report: cannot export');
  }
  process.exit(0);
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = path.resolve(String(args.out || path.join(import.meta.dirname, '..', 'data', 'zoho-backup', `${env}-${stamp}`)));
fs.mkdirSync(outDir, { recursive: true });
console.log(`Exporting ${plan.length} forms from "${env}" to ${outDir}`);

const manifest = { environment: env, startedAt: new Date().toISOString(), forms: [] };
for (const { form, report } of plan) {
  const entry = { form: form.name, report: report?.name || null, rows: 0, fieldsSeen: 0, formFieldCount: form.fieldCount, notes: [] };
  manifest.forms.push(entry);
  if (!report) { entry.notes.push('no list report, cannot export'); console.log(form.name.padEnd(42), 'SKIPPED (no report)'); continue; }
  if (report.criteria) entry.notes.push('report is filtered: not all records');
  try {
    const res = await zohoReader.getRecords({ report_name: report.name, page: 1, pageSize: 1_000_000 });
    const rows = res.data || [];
    entry.rows = rows.length;
    entry.fieldsSeen = new Set(rows.flatMap((r) => Object.keys(r))).size;
    if (rows.length && entry.fieldsSeen < form.fieldCount) entry.notes.push('fewer fields than the form: report may hide columns');
    fs.writeFileSync(path.join(outDir, `${form.name}.json`), JSON.stringify(rows));
    console.log(form.name.padEnd(42), String(rows.length).padStart(6), 'rows', entry.notes.length ? `  ! ${entry.notes.join('; ')}` : '');
  } catch (e) {
    entry.error = e.message;
    console.log(form.name.padEnd(42), 'FAILED:', e.message);
  }
}
manifest.finishedAt = new Date().toISOString();
fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
const failed = manifest.forms.filter((f) => f.error || !f.report).length;
console.log(`\nDone: ${manifest.forms.length - failed} exported, ${failed} failed or skipped. Manifest: ${path.join(outDir, 'manifest.json')}`);
process.exit(failed ? 1 : 0);
