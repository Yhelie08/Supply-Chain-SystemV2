// Sync Customer table from Zoho Books "Contacts.csv" export (source of truth).
// Matches by ID1 (Contact ID) when already linked; falls back to exact Display Name match
// to backfill ID1 for rows that aren't linked yet. Unlike tools/import-contacts-csv.mjs,
// this does NOT fall back Customer_Type to Contact Type ("customer"/"vendor") -- only a real
// CF.Customer Type value is written, so "customer" junk never gets reintroduced.
//
//   node --env-file-if-exists=.env tools/sync-customers-from-csv.mjs <csv-path> [--dry-run]
import fs from 'node:fs';
import { createPool } from '../server/pg/pool.mjs';
import { createStore } from '../server/pg/store.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!file) { console.error('Usage: node tools/sync-customers-from-csv.mjs <csv-path> [--dry-run]'); process.exit(2); }

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

const text = fs.readFileSync(file, 'utf8');
const rows = parseCsv(text);
const header = rows[0];
const idx = (name) => header.indexOf(name);
const col = {
  name: idx('Display Name'), type: idx('CF.Customer Type'), contactId: idx('Contact ID'),
  email: idx('EmailID'), phone: idx('Phone'), mobile: idx('MobilePhone'),
  bAddr: idx('Billing Address'), bAddr2: idx('Billing Street2'), bCity: idx('Billing City'),
  bState: idx('Billing State'), bCountry: idx('Billing Country'), bCode: idx('Billing Code'),
  sAddr: idx('Shipping Address'), sAddr2: idx('Shipping Street2'), sCity: idx('Shipping City'),
  sState: idx('Shipping State'), sCountry: idx('Shipping Country'), sCode: idx('Shipping Code'),
};
for (const [k, v] of Object.entries(col)) if (v === -1) throw new Error(`Column not found: ${k}`);

const address = (r, prefix) => {
  const a = {
    address_line_1: r[col[prefix + 'Addr']] || '', address_line_2: r[col[prefix + 'Addr2']] || '',
    district_city: r[col[prefix + 'City']] || '', state_province: r[col[prefix + 'State']] || '',
    postal_Code: r[col[prefix + 'Code']] || '', country: r[col[prefix + 'Country']] || '',
  };
  return Object.values(a).some(Boolean) ? a : null;
};

// Dedup by Contact ID (one row per contact; the CSV repeats a contact's row per invoice/txn in
// some exports -- guard against that by keeping first occurrence only).
const seen = new Set();
const records = [];
for (const r of rows.slice(1)) {
  if (r.length <= 1 || !r[col.name] || !r[col.contactId]) continue;
  if (seen.has(r[col.contactId])) continue;
  seen.add(r[col.contactId]);
  records.push({
    contactId: r[col.contactId],
    name: r[col.name],
    Customer_Type: (r[col.type] || '').trim(),
    Email: r[col.email] || '', Phone_Number: r[col.phone] || '', Mobile: r[col.mobile] || '',
    Billing_Address: address(r, 'b'), Shipping_Address: address(r, 's'),
  });
}
console.log(`Parsed ${records.length} unique contacts from ${rows.length - 1} rows.`);

const pool = createPool();
const store = createStore(pool);

const allCustomers = await store.find('Customer');
const byId1 = new Map();
const byNameExact = new Map();
for (const c of allCustomers) {
  if (c.ID1) { if (!byId1.has(c.ID1)) byId1.set(c.ID1, []); byId1.get(c.ID1).push(c); }
  const key = String(c.customer_name || '').trim().toLowerCase();
  if (key) { if (!byNameExact.has(key)) byNameExact.set(key, []); byNameExact.get(key).push(c); }
}

let updatedById1 = 0, updatedByName = 0, id1Backfilled = 0, typeSet = 0, noMatch = 0, ambiguousName = 0;
const sample = [];

for (const rec of records) {
  let target = null;
  const byIdMatches = byId1.get(rec.contactId);
  if (byIdMatches && byIdMatches.length === 1) {
    target = byIdMatches[0];
    updatedById1++;
  } else {
    const nameMatches = byNameExact.get(rec.name.trim().toLowerCase());
    if (nameMatches && nameMatches.length === 1) {
      target = nameMatches[0];
      if (!target.ID1) id1Backfilled++;
      updatedByName++;
    } else if (nameMatches && nameMatches.length > 1) {
      ambiguousName++;
      continue;
    } else {
      noMatch++;
      continue;
    }
  }

  const update = {};
  if (!target.ID1) update.ID1 = rec.contactId;
  if (rec.Customer_Type && target.Customer_Type !== rec.Customer_Type) { update.Customer_Type = rec.Customer_Type; typeSet++; }
  if (rec.Email && !target.Email) update.Email = rec.Email;
  if (rec.Phone_Number && !target.Phone_Number) update.Phone_Number = rec.Phone_Number;
  if (rec.Mobile && !target.Mobile) update.Mobile = rec.Mobile;

  if (Object.keys(update).length === 0) continue;
  if (sample.length < 10) sample.push({ name: rec.name, id: target.ID, update });
  if (!dryRun) await store.updateRecord('Customer', target.ID, update, { byForm: true });
}

console.log(`matched by ID1: ${updatedById1}, matched by name: ${updatedByName} (${id1Backfilled} of those got ID1 backfilled)`);
console.log(`Customer_Type set/corrected: ${typeSet}`);
console.log(`ambiguous name (skipped): ${ambiguousName}, no match at all (skipped): ${noMatch}`);
if (dryRun) { console.log('Sample updates (dry-run, nothing written):'); console.log(sample); }
await pool.end();
