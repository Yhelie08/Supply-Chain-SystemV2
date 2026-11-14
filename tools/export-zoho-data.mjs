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
import { fileURLToPath } from 'node:url';
import { zohoReader } from './zoho/reader.mjs'; // read-only: GET calls only

const PARSED = path.resolve(import.meta.dirname, '..', 'zoho-export', 'parsed');

export function loadFormsAndReports(parsedDir = PARSED) {
  const forms = JSON.parse(fs.readFileSync(path.join(parsedDir, 'forms.json'), 'utf8'));
  const reports = JSON.parse(fs.readFileSync(path.join(parsedDir, 'reports.json'), 'utf8'));
  return { forms, reports };
}

let cachedReports = null;

// Unfiltered list report with the most columns wins; a filtered one is used only if nothing else exists.
export function pickReport(form, reports = null) {
  const repList = reports || (cachedReports || (cachedReports = loadFormsAndReports().reports));
  const lists = repList.filter((r) => r.form === form.name && r.type === 'list');
  const rank = (r) => [r.criteria ? 0 : 1, (r.columns || []).length, r.isDefault ? 1 : 0];
  lists.sort((a, b) => { const x = rank(a), y = rank(b); return y[0] - x[0] || y[1] - x[1] || y[2] - x[2]; });
  return lists[0] || null;
}

export function buildExportPlan(forms, reports = null, only = null) {
  const onlySet = only ? (only instanceof Set ? only : new Set(String(only).split(','))) : null;
  return forms
    .filter((f) => !onlySet || onlySet.has(f.name))
    .map((f) => ({ form: f, report: pickReport(f, reports) }));
}

export async function exportZohoData({
  forms = null,
  reports = null,
  reader = zohoReader,
  env = process.env.ZOHO_ENV || 'development',
  dryRun = false,
  only = null,
  outDir = null,
  log = console.log,
} = {}) {
  const loaded = (!forms || !reports) ? loadFormsAndReports() : null;
  const fList = forms || loaded.forms;
  const rList = reports || loaded.reports;
  const plan = buildExportPlan(fList, rList, only);

  if (dryRun) {
    log(`Environment: ${env} (dry run, no API calls)`);
    for (const { form, report } of plan) {
      log(form.name.padEnd(42), report ? `${report.name}${report.criteria ? '  [FILTERED]' : ''}` : '-- no report: cannot export');
    }
    return { plan, manifest: null, exitCode: 0 };
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resolvedOutDir = path.resolve(String(outDir || path.join(import.meta.dirname, '..', 'data', 'zoho-backup', `${env}-${stamp}`)));
  fs.mkdirSync(resolvedOutDir, { recursive: true });
  log(`Exporting ${plan.length} forms from "${env}" to ${resolvedOutDir}`);

  const manifest = { environment: env, startedAt: new Date().toISOString(), forms: [] };
  for (const { form, report } of plan) {
    const entry = { form: form.name, report: report?.name || null, rows: 0, fieldsSeen: 0, formFieldCount: form.fieldCount, notes: [] };
    manifest.forms.push(entry);
    if (!report) {
      entry.notes.push('no list report, cannot export');
      log(form.name.padEnd(42), 'SKIPPED (no report)');
      continue;
    }
    if (report.criteria) entry.notes.push('report is filtered: not all records');
    try {
      const res = await reader.getRecords({ report_name: report.name, page: 1, pageSize: 1_000_000 });
      const rows = res.data || [];
      entry.rows = rows.length;
      entry.fieldsSeen = new Set(rows.flatMap((r) => Object.keys(r))).size;
      if (rows.length && entry.fieldsSeen < form.fieldCount) entry.notes.push('fewer fields than the form: report may hide columns');
      fs.writeFileSync(path.join(resolvedOutDir, `${form.name}.json`), JSON.stringify(rows));
      log(form.name.padEnd(42), String(rows.length).padStart(6), 'rows', entry.notes.length ? `  ! ${entry.notes.join('; ')}` : '');
    } catch (e) {
      entry.error = e.message;
      log(form.name.padEnd(42), 'FAILED:', e.message);
    }
  }
  manifest.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(resolvedOutDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  const errors = manifest.forms.filter((f) => f.error).length;
  const skipped = manifest.forms.filter((f) => !f.report && !f.error).length;
  const exported = manifest.forms.filter((f) => f.report && !f.error).length;
  log(`\nDone: ${exported} exported, ${skipped} skipped (no report), ${errors} failed. Manifest: ${path.join(resolvedOutDir, 'manifest.json')}`);
  return { plan, manifest, outDir: resolvedOutDir, exitCode: errors ? 1 : 0 };
}

if (process.argv[1] && (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) || path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase())) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  const result = await exportZohoData({
    dryRun: Boolean(args['dry-run']),
    only: args.only,
    outDir: args.out,
  });
  process.exit(result.exitCode);
}
