// Integration: rescoreAll actually writes Category/Queue_Rank/... onto Service_Appointment_Form, a widget save
// scores automatically, a widget cannot type the queue columns, and the recalculate_delivery_queue custom API
// works. Mirrors tests/fulfillment-sorter-hooks.test.js.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { rescoreAll } from '../../server/modules/delivery-management/sorter.mjs';
import { apis } from '../../server/modules/delivery-management/apis.mjs';

const SA = 'Service_Appointment_Form';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const addAppointment = (extra) => raw.addRecord(SA, { Sales_Order: 'SO-1', Appointment_Status: 'Queued', Contact: '09171234567', Customer_Address: '1 Main St', ...extra });

test('rescoreAll: every open appointment gets a Category, Queue_Rank and Scored_At', async () => {
  await addAppointment({ Sales_Order: 'SO-1', Order_Date: '2026-11-01', Requested_Delivery_Date: '2026-12-15' });
  await addAppointment({ Sales_Order: 'SO-2', Order_Date: '2026-11-05', Requested_Delivery_Date: '2026-12-15' });
  const result = await rescoreAll(raw);
  assert.equal(result.scored, 2);
  const rows = await raw.find(SA);
  const bySo = Object.fromEntries(rows.map((r) => [r.Sales_Order, r]));
  assert.equal(bySo['SO-1'].Category, 'on_time');
  assert.equal(bySo['SO-1'].Queue_Rank, '1');
  assert.equal(bySo['SO-2'].Queue_Rank, '2');
  assert.ok(bySo['SO-1'].Scored_At);
});

test('rescoreAll: a Completed or Failed appointment is left out of scoring', async () => {
  await addAppointment({ Appointment_Status: 'Completed' });
  const result = await rescoreAll(raw);
  assert.equal(result.scored, 0);
  const [row] = await raw.find(SA);
  assert.equal(row.Category, '');
});

test('saving a Service_Appointment_Form record scores it automatically (no manual rescore call)', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-9', Appointment_Status: 'Queued', Order_Date: '2026-11-01', Requested_Delivery_Date: '2026-12-15', Contact: '09171234567', Customer_Address: '1 Main St' });
  const row = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(row.Category, 'on_time');
  assert.ok(row.Scored_At);
});

test('a widget cannot type the queue columns directly into something false; the next save overwrites them', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-10', Appointment_Status: 'Queued', Order_Date: '2026-11-01', Requested_Delivery_Date: '2026-12-15', Contact: '09171234567', Customer_Address: '1 Main St' });
  await store.updateRecord(SA, id, { Category: 'broken', Queue_Rank: '999' }, { byForm: true });
  const row = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(row.Category, 'on_time', 'the hook rescores on every save, so a typed value never survives it');
  assert.equal(row.Queue_Rank, '1');
});

test('an exception flagged on the appointment flips it to blocked, and clearing it flips it back', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-11', Appointment_Status: 'Queued', Order_Date: '2026-11-01', Requested_Delivery_Date: '2026-12-15', Contact: '09171234567', Customer_Address: '1 Main St' });
  await store.updateRecord(SA, id, { Exception_Status: 'Flagged' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Category, 'blocked');
  await store.updateRecord(SA, id, { Exception_Status: '' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Category, 'on_time');
});

test('recalculate_delivery_queue custom API rescores everything and reports a count', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-20', Appointment_Status: 'Queued', Contact: '09171234567', Customer_Address: '1 Main St' });
  const result = await apis.recalculate_delivery_queue({}, raw, {});
  assert.equal(result.status, 'success');
  assert.equal(result.scored, 1);
});
