// One-off import: Zoho Books "Contacts.csv" export -> Customer table (Postgres, DATABASE_URL).
//
//   node --env-file-if-exists=.env tools/import-contacts-csv.mjs <csv-path> [--dry-run]
import fs from 'node:fs';
import { createPool } from '../server/pg/pool.mjs';
import { createStore } from '../server/pg/store.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
if (!file) { console.error('Usage: node tools/import-contacts-csv.mjs <csv-path> [--dry-run]'); process.exit(2); }

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
  name: idx('Display Name'), type: idx('CF.Customer Type'), contactType: idx('Contact Type'),
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

const records = rows.slice(1).filter((r) => r.length > 1 && r[col.name]).map((r) => ({
  customer_name: r[col.name],
  Customer_Type: r[col.type] || r[col.contactType] || '',
  Email: r[col.email] || '',
  Phone_Number: r[col.phone] || '',
  Mobile: r[col.mobile] || '',
  Billing_Address: address(r, 'b'),
  Shipping_Address: address(r, 's'),
}));

console.log(`Parsed ${records.length} contacts from ${rows.length - 1} rows.`);
if (dryRun) { console.log(records.slice(0, 3)); process.exit(0); }

const pool = createPool();
const store = createStore(pool);
let ok = 0, failed = 0;
for (const rec of records) {
  try { await store.addRecord('Customer', rec, 'csv-import'); ok++; }
  catch (e) { failed++; console.error(`FAILED ${rec.customer_name}: ${e.message}`); }
}
console.log(`${ok} imported, ${failed} failed.`);
await pool.end();
