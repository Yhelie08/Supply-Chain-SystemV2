// Load sheet (spec v1.4, Delivery 03 §2, LS-R1/LS-R2): server/modules/delivery-management/load-sheet.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { buildLoadSheet } from '../../server/modules/delivery-management/load-sheet.mjs';
import { confirmStopLoading } from '../../server/modules/delivery-management/day-plans.mjs';

const SA = 'Service_Appointment_Form';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, 'Day_Plan']) await db.query(`DELETE FROM "${f}"`); });

const scheduled = (extra = {}) => ({
  Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Calendar_Entry_Created: true, Appointment_Status: 'Scheduled',
  Installer: 'CJ', Confirmed_Schedule_Date: '2027-05-01', Customer_Name: { first_name: 'Ana', last_name: 'Reyes' },
  City: 'Pasig', Box_Count: 3, Fragile: true, Crate_Marks: 'This side up', ...extra,
});

test('a job not yet on any day plan has no load sheet', async () => {
  assert.equal(await buildLoadSheet(raw, '2027-05-01', 'CJ'), null);
});

test('LS-R1: load order is the reverse of drop order (last stop loaded first)', async () => {
  await store.addRecord(SA, scheduled({ Sales_Order: 'SO-A', Confirmed_Time_Slot: '08:00:00 AM' }));
  await store.addRecord(SA, scheduled({ Sales_Order: 'SO-B', Confirmed_Time_Slot: '10:00:00 AM' }));
  await store.addRecord(SA, scheduled({ Sales_Order: 'SO-C', Confirmed_Time_Slot: '12:00:00 PM' }));
  const sheet = await buildLoadSheet(raw, '2027-05-01', 'CJ');
  assert.deepEqual(sheet.drop_order.map((r) => r.sales_order), ['SO-A', 'SO-B', 'SO-C']);
  assert.deepEqual(sheet.load_order.map((r) => r.sales_order), ['SO-C', 'SO-B', 'SO-A']);
});

test('LS-R2: lists job, first name, city, box count, fragile/two-person flags and crate marks — never price or payment', async () => {
  await store.addRecord(SA, scheduled());
  const sheet = await buildLoadSheet(raw, '2027-05-01', 'CJ');
  const row = sheet.drop_order[0];
  assert.equal(row.customer_first_name, 'Ana');
  assert.equal(row.city, 'Pasig');
  assert.equal(row.box_count, 3);
  assert.equal(row.fragile, true);
  assert.equal(row.two_person, false);
  assert.equal(row.crate_marks, 'This side up');
  const keys = Object.keys(row).join(',').toLowerCase();
  assert.ok(!keys.includes('price') && !keys.includes('payment'));
});

test('LS-R3: confirmStopLoading shows up on the load sheet row for that stop', async () => {
  const id = await store.addRecord(SA, scheduled());
  await confirmStopLoading(raw, '2027-05-01', 'CJ', id, 3);
  const sheet = await buildLoadSheet(raw, '2027-05-01', 'CJ');
  assert.equal(sheet.drop_order[0].loading_confirmed, true);
  assert.equal(sheet.drop_order[0].loaded_box_count, 3);
});
