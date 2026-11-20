// One-time export of the Node side's answers, kept in git as fixtures for the Python parity tests
// (docs/superpowers/plans/2026-11-19-python-fulfillment-completion.md, Phase 2). Node is the reference; once these files exist the
// Python tests no longer need Node to run. Re-run only when the parsed forms or spec-forms change on purpose:
//     node tools/export-parity-fixtures.mjs
// Writes:
//   tests/fixtures/node_model.json    the column map of every form, the lookup display formats, and which form each report reads
//   tests/fixtures/node_schema.json   what Node's ensureSchema really creates in Postgres (tables, columns, types, nullability, defaults, indexes, sequence)
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { columns, lookupDisplay, reports, formOfReport } from '../server/model.mjs';
import { ensureSchema, SEQ, SEQ_START } from '../server/pg/schema.mjs';

const OUT = path.resolve('tests', 'fixtures');
fs.mkdirSync(OUT, { recursive: true });
const sortKeys = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

// ---- the model ----
const reportForm = {};
for (const name of Object.keys(reports)) {
  try { const r = formOfReport(name); reportForm[name] = { form: r.form, criteria: r.criteria ?? null }; } catch (e) { reportForm[name] = { error: String(e.message).slice(0, 80) }; }
}
const model = {
  _about: 'Exported from Node server/model.mjs by tools/export-parity-fixtures.mjs. columns: form -> column -> {type, kind, lookup}.',
  columns: sortKeys(Object.fromEntries(Object.entries(columns).map(([f, cols]) => [f, sortKeys(cols)]))),
  lookupDisplay: sortKeys(lookupDisplay),
  reportForm: sortKeys(reportForm),
};
fs.writeFileSync(path.join(OUT, 'node_model.json'), JSON.stringify(model));

// ---- the schema Node really creates ----
const db = new PGlite();
await ensureSchema(db);
const cols = (await db.query(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`)).rows;
const idx = (await db.query(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`)).rows;
const seq = (await db.query(`SELECT sequencename, start_value::text AS start_value FROM pg_sequences WHERE schemaname = 'public'`)).rows;
const tables = {};
for (const c of cols) (tables[c.table_name] ||= []).push([c.column_name, c.data_type, c.is_nullable, c.column_default]);
const indexes = {};
for (const i of idx) (indexes[i.tablename] ||= []).push([i.indexname, i.indexdef]);
const schema = { _about: 'What Node ensureSchema creates on an empty database. tables: table -> [[column, data_type, is_nullable, default]] in column order.', sequence: { name: SEQ, start: SEQ_START, found: seq }, tables: sortKeys(tables), indexes: sortKeys(indexes) };
fs.writeFileSync(path.join(OUT, 'node_schema.json'), JSON.stringify(schema));
console.log(`forms ${Object.keys(model.columns).length}, reports ${Object.keys(model.reportForm).length}, tables ${Object.keys(schema.tables).length}, indexed tables ${Object.keys(schema.indexes).length}`);
await db.close();
