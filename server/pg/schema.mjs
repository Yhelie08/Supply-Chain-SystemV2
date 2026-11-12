// Postgres schema generated from the Zoho export: one table per form, typed from the field types.
// Record IDs are BIGINT (Zoho IDs have 19 digits, too big for a JavaScript number) and are always
// handled as strings in JavaScript; new IDs come from one sequence that starts above every Zoho ID.
import { columns, SYSTEM_COLUMNS } from '../model.mjs';

export const q = (name) => `"${String(name).replace(/"/g, '""')}"`;
export const SEQ = 'record_id_seq';
export const SEQ_START = '4900000000000000000';
const pgType = { num: 'NUMERIC', bool: 'BOOLEAN', json: 'JSONB', text: 'TEXT' };

// The form's own columns (a field named like a system column is the system column).
export const ownColumns = (form) => Object.entries(columns[form]).filter(([name]) => !SYSTEM_COLUMNS.includes(name));

// Creates missing tables and columns so the schema follows the parsed export. Returns how many statements ran.
export async function ensureSchema(db) {
  await db.query(`CREATE SEQUENCE IF NOT EXISTS ${SEQ} START ${SEQ_START}`);
  const { rows } = await db.query('SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = current_schema()');
  const have = new Map();
  for (const r of rows) {
    if (!have.has(r.table_name)) have.set(r.table_name, new Set());
    have.get(r.table_name).add(r.column_name);
  }
  const statements = [];
  for (const form of Object.keys(columns)) {
    const own = ownColumns(form);
    if (!have.has(form)) {
      statements.push(`CREATE TABLE ${q(form)} (${[
        `"ID" BIGINT PRIMARY KEY DEFAULT nextval('${SEQ}')`,
        '"Added_Time" TEXT', '"Modified_Time" TEXT', '"Added_User" TEXT', '"_extra" JSONB',
        ...own.map(([name, c]) => `${q(name)} ${pgType[c.kind]}`),
      ].join(', ')})`);
    } else {
      for (const [name, c] of own) {
        if (!have.get(form).has(name)) statements.push(`ALTER TABLE ${q(form)} ADD COLUMN ${q(name)} ${pgType[c.kind]}`);
      }
    }
  }
  for (const sql of statements) await db.query(sql);
  return statements.length;
}

// After an import, move the sequence above the largest ID in any table so new records never collide.
export async function syncSequence(db) {
  const parts = Object.keys(columns).map((f) => `SELECT COALESCE(MAX("ID"), 0) AS m FROM ${q(f)}`);
  const { rows } = await db.query(`SELECT GREATEST(MAX(m), ${SEQ_START}::bigint) + 1 AS next FROM (${parts.join(' UNION ALL ')}) t`);
  await db.query('SELECT setval($1, $2::bigint, false)', [SEQ, String(rows[0].next)]);
}
