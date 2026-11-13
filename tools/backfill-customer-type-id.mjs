// Better backfill than tools/backfill-customer-id1.mjs's email join: "All Customers.csv" has the
// real Zoho ID and a real Customer Type per row (Corporate/End User/Design Partner/etc., unlike the
// other export's blank CF.Customer Type). Matches Postgres rows by customer_name (this file has no
// email to join on reliably either, but its ID *is* the Zoho contact_id -- used to set/fix ID1 too).
//
//   node --env-file-if-exists=.env tools/backfill-customer-type-id.mjs <csv-path> [--dry-run]
import fs from 'node:fs';
import { createPool } from '../server/pg/pool.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!file) { console.error('Usage: node tools/backfill-customer-type-id.mjs <csv-path> [--dry-run]'); process.exit(2); }

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const rows = parseCsv(fs.readFileSync(file, 'utf8'));
const header = rows[0];
const idx = (name) => header.indexOf(name);
const col = { id: idx('ID'), name: idx('Customer Name'), type: idx('Customer Type') };
for (const [k, v] of Object.entries(col)) if (v === -1) throw new Error(`Column not found: ${k}`);

// Dedupe by name -- if the same name appears more than once, skip (ambiguous which ID/type is right).
const byName = new Map();
const dupNames = new Set();
for (const r of rows.slice(1)) {
  const name = (r[col.name] || '').trim();
  const id = (r[col.id] || '').trim();
  if (!name || !id) continue;
  const key = name.toLowerCase();
  if (byName.has(key)) dupNames.add(key); else byName.set(key, { name, id, type: (r[col.type] || '').trim() });
}
dupNames.forEach((k) => byName.delete(k));

const withType = [...byName.values()].filter((v) => v.type);
console.log(`${byName.size} unique name -> ID pairs (${dupNames.size} ambiguous names skipped), ${withType.length} have a Customer Type.`);
if (dryRun) process.exit(0);

const pool = createPool();
let id1Updated = 0, typeUpdated = 0;
for (const { name, id, type } of byName.values()) {
  const r1 = await pool.query('UPDATE "Customer" SET "ID1" = $1 WHERE lower("customer_name") = lower($2) AND ("ID1" IS NULL OR "ID1" = \'\')', [id, name]);
  id1Updated += r1.rowCount;
  if (type) {
    const r2 = await pool.query('UPDATE "Customer" SET "Customer_Type" = $1 WHERE lower("customer_name") = lower($2) AND ("Customer_Type" IS NULL OR "Customer_Type" = \'\' OR "Customer_Type" = \'customer\')', [type, name]);
    typeUpdated += r2.rowCount;
  }
}
console.log(`${id1Updated} ID1 values set, ${typeUpdated} Customer_Type values set.`);
await pool.end();
