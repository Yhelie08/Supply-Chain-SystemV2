// Loads a backup made by tools/export-zoho-data.mjs into Postgres, keeping every Zoho record ID.
// Each form is loaded in its own transaction and checked against the row count of the export:
// a mismatch rolls that form back. A form that already has rows is skipped unless replace is set,
// so a re-run can never wipe records that were created in the new app.
import fs from 'node:fs';
import path from 'node:path';
import { columns } from '../model.mjs';
import { q, ownColumns, ensureSchema, syncSequence } from './schema.mjs';
import { encode, withTx } from './store.mjs';

const cast = { json: '::jsonb', num: '::numeric', bool: '::boolean', text: '' };
const flat = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v.display_value ?? v.zc_display_value ?? v.ID ?? '' : v ?? '');

// One exported Zoho record -> the values for one table row (null when the record has no usable ID).
export function recordToRow(form, rec) {
  if (!/^\d{1,19}$/.test(String(rec.ID ?? ''))) return null;
  // Keys like "Customer.Added_Time" are copies of a looked-up record's fields that a Zoho report adds;
  // they would go stale here, and no widget reads them, so they are not imported.
  const own = Object.fromEntries(Object.entries(rec).filter(([k]) => !k.includes('.')));
  const { out, extra } = encode(form, own);
  return { id: String(rec.ID), addedTime: flat(rec.Added_Time), modifiedTime: flat(rec.Modified_Time), addedUser: String(flat(rec.Added_User)), extra, out };
}

export async function importBackup(db, dir, { replace = false, only = null, dryRun = false, log = console.log } = {}) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (!dryRun) await ensureSchema(db);
  const summary = [];
  for (const entry of manifest.forms) {
    if (only && !only.has(entry.form)) continue;
    const file = path.join(dir, `${entry.form}.json`);
    const line = { form: entry.form, rows: 0, status: '' };
    summary.push(line);
    if (!columns[entry.form]) { line.status = 'skipped: form is not in the parsed export'; continue; }
    if (entry.error || !fs.existsSync(file)) { line.status = `skipped: no data file${entry.error ? ` (${entry.error})` : ''}`; continue; }
    const recs = JSON.parse(fs.readFileSync(file, 'utf8'));
    const rows = recs.map((r) => recordToRow(entry.form, r));
    if (rows.some((r) => !r)) { line.status = 'FAILED: a record has no valid ID'; continue; }
    if (rows.length !== entry.rows) { line.status = `FAILED: file has ${rows.length} rows, manifest says ${entry.rows}`; continue; }
    line.rows = rows.length;
    if (dryRun) { line.status = 'ok (dry run)'; continue; }
    if (!rows.length) { line.status = 'empty'; continue; }

    const form = entry.form;
    const have = Number((await db.query(`SELECT count(*)::int AS n FROM ${q(form)}`)).rows[0].n);
    if (have && !replace) { line.status = `skipped: table already has ${have} rows (use replace to reload)`; continue; }

    // Columns that appear in the data: the fixed ones plus every field some record has a value for.
    const used = ownColumns(form).map(([n]) => n).filter((n) => rows.some((r) => n in r.out));
    const names = ['ID', 'Added_Time', 'Modified_Time', 'Added_User', '_extra', ...used];
    const casts = ['::bigint', '', '', '', '::jsonb', ...used.map((n) => cast[columns[form][n].kind])];
    const perChunk = Math.max(1, Math.floor(30000 / names.length));
    try {
      await withTx(db, async (tx) => {
        if (have) await tx.query(`DELETE FROM ${q(form)}`);
        for (let at = 0; at < rows.length; at += perChunk) {
          const chunk = rows.slice(at, at + perChunk);
          const params = [];
          const tuples = chunk.map((r) => {
            const vals = [r.id, r.addedTime, r.modifiedTime, r.addedUser, r.extra, ...used.map((n) => r.out[n] ?? null)];
            return `(${vals.map((v, i) => { params.push(v); return `$${params.length}${casts[i]}`; }).join(', ')})`;
          });
          await tx.query(`INSERT INTO ${q(form)} (${names.map(q).join(', ')}) VALUES ${tuples.join(', ')}`, params);
        }
        const now = Number((await tx.query(`SELECT count(*)::int AS n FROM ${q(form)}`)).rows[0].n);
        if (now !== entry.rows) throw new Error(`row count after import is ${now}, expected ${entry.rows}`);
      });
      line.status = 'imported';
    } catch (e) {
      line.rows = 0;
      line.status = `FAILED (rolled back): ${e.message}`;
    }
  }
  if (!dryRun) await syncSequence(db);
  for (const l of summary) log(l.form.padEnd(42), String(l.rows).padStart(6), l.status);
  return summary;
}
