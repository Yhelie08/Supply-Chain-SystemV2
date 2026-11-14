// One-time seed: the two real suppliers (Tony Fan, Fenteng Lighting) into the shared Postgres
// Suppliers table. Empty until now -- npm run seed's mock supplierDefs use fake Supplier_ID
// values ("SUP-001"/"SUP-002"), not the real Books vendor ids server/workflows/suppliers.mjs
// already hardcodes (booksId), so that mock seed was never suitable for the real Postgres.
// Without this table populated, the Inquiry widget's "Suppliers (auto-selected)" field has
// nothing to tag, so submitted Inquiries never reach either supplier's portal (Supplier_1/
// Supplier_2) -- confirmed live: INQ-00001 tagged zero suppliers, never showed in Tony Fan's portal.
//
//   node --env-file-if-exists=.env tools/seed-suppliers.mjs
import { createPool } from '../server/pg/pool.mjs';
import { createStore } from '../server/pg/store.mjs';
import { SUPPLIERS } from '../server/workflows/suppliers.mjs';

const pool = createPool();
const store = createStore(pool);

const existing = await store.find('Suppliers');
const byBooksId = new Map(existing.map((r) => [String(r.Supplier_ID || ''), r]));

for (const s of SUPPLIERS) {
  if (byBooksId.has(s.booksId)) { console.log(`Already present: ${s.name} (${s.booksId})`); continue; }
  const id = await store.addRecord('Suppliers', {
    Supplier_ID: s.booksId,
    Supplier_Name: { first_name: s.name },
    Handles_All: true,
    Status: 'Normal',
  }, 'seed-suppliers');
  console.log(`Added ${s.name} -> Suppliers ID ${id} (Supplier_ID ${s.booksId})`);
}

await pool.end();
