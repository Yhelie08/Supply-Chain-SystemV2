// Concurrency-safe record numbering: store.nextNumber (server/pg/store.mjs + server/db.mjs) and the
// shared wrapper server/workflows/numbering.mjs. A persistent series counter hands out distinct numbers
// even when callers race, and reconciles with the highest number already stored (imports / explicit numbers).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { nextNumber } from '../../server/workflows/numbering.mjs';

let db, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => {
  await db.query('DELETE FROM "Purchase_Order"');
  await db.query('DELETE FROM "Replacement_Request"');
  await db.query('DELETE FROM _number_series');
});

test('parallel nextNumber calls never collide', async () => {
  const nums = await Promise.all(Array.from({ length: 25 }, () => store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5)));
  assert.equal(new Set(nums).size, 25, 'every caller gets a distinct number');
  assert.ok(nums.every((n) => /^PO-\d{5}$/.test(n)), 'zero-padded PO-nnnnn');
});

test('nextNumber continues from the highest existing', async () => {
  await store.addRecord('Purchase_Order', { PO_No: 'PO-00041' });
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00042');
});

test('nextNumber is sequential even before any record is inserted', async () => {
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00001');
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00002');
});

test('nextNumber reconciles with a later explicit higher number', async () => {
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00001');
  await store.addRecord('Purchase_Order', { PO_No: 'PO-00050' });
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00051');
});

test('each form/field has its own series', async () => {
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00001');
  assert.equal(await store.nextNumber('Replacement_Request', 'RR_No', 'RR-', 5), 'RR-00001');
  assert.equal(await store.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00002');
});

test('the numbering wrapper takes the prefix without the dash (Yhel callers)', async () => {
  assert.equal(await nextNumber(store, 'Purchase_Order', 'PO_No', 'PO'), 'PO-00001');
  assert.equal(await nextNumber(store, 'Replacement_Request', 'RR_No', 'RR', 5), 'RR-00001');
});

test('SQLite store nextNumber: continues from max and stays sequential', async () => {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-numbering-'));
  const sqlite = await import('../../server/db.mjs');
  sqlite.addRecord('Purchase_Order', { PO_No: 'PO-00041' });
  assert.equal(sqlite.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00042');
  assert.equal(sqlite.nextNumber('Purchase_Order', 'PO_No', 'PO-', 5), 'PO-00043');
  assert.equal(nextNumber(sqlite, 'Purchase_Order', 'PO_No', 'PO'), 'PO-00044');
});