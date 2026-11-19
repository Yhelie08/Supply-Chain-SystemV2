// SR-R1, automated only at the final step (owner's call, 2026-11-18: "i-automate lang ang huling Hand Off
// click"): server/modules/delivery-management/auto-handoff.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';

const SCHED = 'Delivery_Scheduling';
const SR = 'Service_Request1';
const SA = 'Service_Appointment_Form';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SCHED, SR, SA, 'Package_Shipments']) await db.query(`DELETE FROM "${f}"`); });

const ready = (extra = {}) => ({
  SO: 'SO-1', Date_field: '2027-06-01', Time: '08:00 AM', Type_of_Delivery: 'Delivery Only',
  Customer_Name: 'Maria Santos', Customer_Address: '1 Main St', Delivery_City: 'Quezon City',
  Email: 'maria@example.com', Contact: '09171234567', Package_Number: 'PKG-1',
  Item_Details: [{ Item_Name: 'Sofa', SKU: 'SKU-1', PAC: 'PKG-1', Quantity: 2 }],
  Schedule_Status: 'New', ...extra,
});

test('a record with date, time and SO is handed off by itself: Service_Request1 and the appointment both appear', async () => {
  const id = await store.addRecord(SCHED, ready());
  const [sr] = await raw.find(SR, (r) => String(r.Initial_Schedule_ID) === String(id));
  assert.ok(sr, 'Service_Request1 was created');
  assert.equal(sr.Sales_Order, 'SO-1');
  assert.equal(sr.SR_Status, 'Scheduling'); // makeAppointment's own write-back moves it past 'New' immediately
  assert.equal(sr.Customer_Address, '1 Main St');
  assert.equal(sr.Item_Name, 'Sofa');

  const [sa] = await raw.find(SA, (r) => String(r.Service_Request_ID) === String(sr.ID));
  assert.ok(sa, 'the appointment was created too, by Service_Request1\'s own existing hook');
  assert.equal(sa.Appointment_Status, 'Queued');
  assert.equal(sa.Type_of_Delivery, 'Delivery Only');

  const sched = await raw.getRecordById(SCHED, id, { raw: true });
  assert.equal(sched.Schedule_Status, 'Handed Off');
  assert.equal(String(sched.Service_Request_ID), String(sr.ID));
});

test('missing a date, time or SO: nothing is created', async () => {
  await store.addRecord(SCHED, ready({ Time: '' }));
  await store.addRecord(SCHED, ready({ Date_field: '', SO: 'SO-2' }));
  await store.addRecord(SCHED, ready({ SO: '', Customer_Name: 'X' }));
  assert.equal((await raw.find(SR)).length, 0);
});

test('Cancelled is never handed off, even with a date, time and SO', async () => {
  await store.addRecord(SCHED, ready({ Schedule_Status: 'Cancelled' }));
  assert.equal((await raw.find(SR)).length, 0);
});

test('already handed off (Service_Request_ID set) is not handed off again on a later save', async () => {
  const id = await store.addRecord(SCHED, ready());
  assert.equal((await raw.find(SR)).length, 1);
  await store.updateRecord(SCHED, id, { Notes: 'late addition' }, { byForm: true });
  assert.equal((await raw.find(SR)).length, 1, 'still just the one Service Request');
});

test('a race (Service_Request1 already exists for this Initial_Schedule_ID) is caught even if the write-back has not landed', async () => {
  const id = await store.addRecord(SCHED, ready());
  // Simulate the write-back not having landed yet, then save again.
  await db.query(`UPDATE "${SCHED}" SET "Service_Request_ID" = '' WHERE "ID" = $1`, [id]);
  await store.updateRecord(SCHED, id, { Notes: 'resaved before the write-back' }, { byForm: true });
  assert.equal((await raw.find(SR)).length, 1, 'the existing-SR guard still caught it');
});

test('a Pullout type is marked If_Pull_Out "Yes" on the Service Request', async () => {
  await store.addRecord(SCHED, ready({ SO: 'SO-PO', Type_of_Delivery: 'Pullout' }));
  const [sr] = await raw.find(SR, (r) => r.Sales_Order === 'SO-PO');
  assert.equal(sr.If_Pull_Out, 'Yes');
});

test('no Item_Details grid falls back to the header Item_Detail/Qty/Package_Number as one line', async () => {
  await store.addRecord(SCHED, ready({ SO: 'SO-FALLBACK', Item_Details: [], Item_Detail: 'Lamp', Qty: '3' }));
  const [sr] = await raw.find(SR, (r) => r.Sales_Order === 'SO-FALLBACK');
  assert.equal(sr.Item_Name, 'Lamp');
  assert.equal(Number(sr.Quantity), 3);
});
