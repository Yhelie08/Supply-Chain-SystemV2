// One-off: fill ID1 (Zoho Books contact_id, the existing convention from ZohoCreatorVersionOLD's
// sync-customers.js) on Customer rows imported by tools/import-contacts-csv.mjs, which never
// captured it. Matches CSV rows to Postgres rows by Email (duplicate customer_name values exist
// in this data, per the old script's own dedup warning -- email is the reliable join key).
//
//   node --env-file-if-exists=.env tools/backfill-customer-id1.mjs <csv-path> [--dry-run]
import fs from 'node:fs';
import { createPool } from '../server/pg/pool.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!file) { console.error('Usage: node tools/backfill-customer-id1.mjs <csv-path> [--dry-run]'); process.exit(2); }

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
const col = { email: idx('EmailID'), contactId: idx('Contact ID'), name: idx('Display Name') };
for (const [k, v] of Object.entries(col)) if (v === -1) throw new Error(`Column not found: ${k}`);

// email -> Zoho contact_id, skipping duplicate/blank emails (ambiguous join, leave those for manual linking)
const byEmail = new Map();
const dupEmails = new Set();
for (const r of rows.slice(1)) {
  const email = (r[col.email] || '').trim().toLowerCase();
  const contactId = (r[col.contactId] || '').trim();
  if (!email || !contactId) continue;
  if (byEmail.has(email)) dupEmails.add(email); else byEmail.set(email, contactId);
}
dupEmails.forEach((e) => byEmail.delete(e));

console.log(`${byEmail.size} unique email -> Contact ID pairs (${dupEmails.size} ambiguous emails skipped).`);
if (dryRun) process.exit(0);

const pool = createPool();
let updated = 0, missing = 0;
for (const [email, contactId] of byEmail) {
  const res = await pool.query('UPDATE "Customer" SET "ID1" = $1 WHERE lower("Email") = $2 AND ("ID1" IS NULL OR "ID1" = \'\')', [contactId, email]);
  if (res.rowCount) updated += res.rowCount; else missing++;
}
console.log(`${updated} rows updated, ${missing} emails had no matching Postgres row.`);
await pool.end();
