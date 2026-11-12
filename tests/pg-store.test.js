// Postgres store: schema, 19-digit Zoho IDs, criteria -> SQL parity with the JS predicate, lookups.
// Runs against PGlite (a real Postgres engine in WebAssembly), so no database server is needed.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { columns } from '../server/model.mjs';
import { compileCriteria } from '../server/criteria.mjs';
import { ensureSchema, syncSequence } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { criteriaToSql } from '../server/pg/criteria-sql.mjs';

const BIG = '4662244000012319507';
const NEXT = '4662244000012319508';
let db, store, queries;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  // Count every query the store sends, to prove lookups are batched.
  queries = [];
  const counting = { query: (sql, params) => { queries.push(sql); return db.query(sql, params); }, transaction: (fn) => db.transaction(fn) };
  store = createStore(counting);
});

test('schema: a table per form, and running it again changes nothing', async () => {
  const { rows } = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
  assert.equal(rows[0].n, Object.keys(columns).length);
  assert.equal(await ensureSchema(db), 0);
});

test('IDs: a 19-digit Zoho ID is kept exactly and found exactly (not its neighbour)', async () => {
  await db.query('INSERT INTO "Customer" ("ID", customer_name) VALUES ($1::bigint, $2), ($3::bigint, $4)', [BIG, 'Big', NEXT, 'Next']);
  assert.equal(Number(BIG).toString() === BIG, false, 'the ID really is too big for a JavaScript number');
  const rec = await store.getRecordById('Customer', BIG);
  assert.equal(rec.ID, BIG);
  assert.equal(typeof rec.ID, 'string');
  const found = await store.getRecords('Customer', { criteria: `ID == "${BIG}"` });
  assert.deepEqual(found.map((r) => r.ID), [BIG]);
  await syncSequence(db);
  const fresh = await store.addRecord('Customer', { customer_name: 'New' });
  assert.ok(BigInt(fresh) > BigInt(NEXT), 'new IDs start above every imported ID');
});

test('add, read, update and delete a record', async () => {
  const id = await store.addRecord('Projects', { Project_Name: 'Mall', Status: 'Open', Group_Discount_Pct: 12.5, All_SRP_Approved: 'true', Surprise: 'kept in _extra' }, 'a@b.c');
  let rec = await store.getRecordById('Projects', id);
  assert.equal(rec.Project_Name, 'Mall');
  assert.equal(rec.Group_Discount_Pct, '12.5');
  assert.equal(rec.All_SRP_Approved, true);
  assert.equal(rec.Added_User, 'a@b.c');
  assert.equal(rec.Surprise, 'kept in _extra');
  await store.updateRecord('Projects', id, { Status: 'Closed', All_SRP_Approved: false });
  rec = await store.getRecordById('Projects', id);
  assert.equal(rec.Status, 'Closed');
  assert.equal(rec.All_SRP_Approved, false);
  assert.equal(rec.Project_Name, 'Mall', 'fields not in the update are untouched');
  await store.deleteRecord('Projects', id);
  await assert.rejects(() => store.getRecordById('Projects', id), (e) => e.code === 9280);
  await assert.rejects(() => store.deleteRecord('Projects', id), (e) => e.code === 9280);
});

test('lookups are resolved in one query per lookup form, not one per row', async () => {
  const c1 = await store.addRecord('Customer', { customer_name: 'Alpha' });
  const c2 = await store.addRecord('Customer', { customer_name: 'Beta' });
  for (let i = 0; i < 6; i++) await store.addRecord('Projects', { Project_Name: `P${i}`, Customer: { ID: i % 2 ? c1 : c2 } });
  queries.length = 0;
  const rows = await store.getRecords('Projects', { criteria: 'Project_Name.startsWith("P")' });
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[0].Customer, { ID: c2, display_value: 'Beta', zc_display_value: 'Beta' });
  assert.equal(rows[1].Customer.display_value, 'Alpha');
  assert.equal(queries.length, 2, 'one query for the page, one for all customers');
});

// The same criteria must select the same rows whether Postgres or the JS predicate does the filtering.
test('criteria: SQL gives the same rows as the JS predicate', async () => {
  const people = [
    { Project_Name: 'Alpha tower', Status: 'Open', Group_Discount_Pct: 10, All_SRP_Approved: true },
    { Project_Name: 'Beta mall', Status: 'Closed', Group_Discount_Pct: 20, All_SRP_Approved: false },
    { Project_Name: 'Gamma', Status: '', Group_Discount_Pct: '', All_SRP_Approved: false },
    { Project_Name: 'tower two', Status: 'Open' },
  ];
  await db.query('DELETE FROM "Projects"');
  for (const p of people) await store.addRecord('Projects', p);
  const all = await store.getRecords('Projects', { criteria: '' });
  const cases = [
    'Status == "Open"', 'Status != "Open"', 'Status == null', 'Status != null',
    'Project_Name.contains("tower")', 'Project_Name.startsWith("Beta")', 'Project_Name.endsWith("mall")',
    'Group_Discount_Pct == 10', 'Group_Discount_Pct != 10', 'Group_Discount_Pct == null',
    'All_SRP_Approved == true', 'All_SRP_Approved == false',
    'Status == "Open" && Project_Name.contains("tower")', 'Status == "Closed" || Status == null',
    '!(Status == "Open")', '(Status == "Open" || Status == "Closed") && All_SRP_Approved == false',
    '"Open" == Status', 'Status == "Nope"',
  ];
  for (const src of cases) {
    const t = criteriaToSql(src, 'Projects');
    assert.ok(t, `should translate to SQL: ${src}`);
    const expected = all.filter(compileCriteria(src)).map((r) => r.ID);
    const got = (await store.getRecords('Projects', { criteria: src })).map((r) => r.ID);
    assert.deepEqual(got, expected, src);
  }
});

test('criteria: anything unsupported falls back to the JS filter and still works', async () => {
  for (const src of ['Group_Discount_Pct > 10', 'Status == ""', 'Project_Name == Status']) {
    assert.equal(criteriaToSql(src, 'Projects'), null, `${src} is left to the JS filter`);
  }
  const rows = await store.getRecords('Projects', { criteria: 'Group_Discount_Pct > 10' });
  assert.deepEqual(rows.map((r) => r.Project_Name), ['Beta mall']);
});

test('paging: page and pageSize', async () => {
  const p1 = await store.getRecords('Projects', { page: 1, pageSize: 3 });
  const p2 = await store.getRecords('Projects', { page: 2, pageSize: 3 });
  assert.equal(p1.length, 3);
  assert.equal(p2.length, 1);
  assert.ok(BigInt(p1[0].ID) < BigInt(p2[0].ID));
});

test('lookup display values follow the format Zoho defines for each form', async () => {
  const supplier = await store.addRecord('Suppliers', { Supplier_ID: '2680178000002735078', Supplier_Name: { first_name: 'Tony', last_name: 'Fan' } });
  const item = await store.addRecord('Items', { ID1: 'B1', item_name: 'Spot lamp', SKU: 'S-1' });
  const inquiry = await store.addRecord('Inquiry_Form', { sku: 'S-1', Items: item, Suppliers: [supplier] });
  const [row] = await store.getRecords('Inquiry_Form', { criteria: `ID == "${inquiry}"` });
  assert.equal(row.Items.display_value, 'Spot lamp', 'Items show item_name, not their Books id');
  assert.equal(row.Suppliers[0].display_value, ' Tony', 'Suppliers use [" " + Supplier_Name.first_name], leading space included');
});

test('display formats: fields, dotted fields, quoted text and +; anything else gives nothing', async () => {
  const { displayFromFormat } = await import('../server/model.mjs');
  const row = { customer_name: 'ACME', Supplier_Name: { first_name: 'Tony' }, empty: null };
  assert.equal(displayFromFormat('[customer_name]', row), 'ACME');
  assert.equal(displayFromFormat('[" " + Supplier_Name.first_name]', row), ' Tony');
  assert.equal(displayFromFormat('[customer_name + " - " + Supplier_Name.first_name]', row), 'ACME - Tony');
  assert.equal(displayFromFormat('[empty]', row), '');
  for (const bad of ['[customer_name +]', '[+ customer_name]', '[customer_name customer_name]', '[ifnull(customer_name, "")]']) assert.equal(displayFromFormat(bad, row), '', bad);
});
