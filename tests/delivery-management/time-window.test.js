// Time window, not exact time (spec v1.4, Delivery 03): server/modules/delivery-management/time-window.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { windowFor } from '../../server/modules/delivery-management/time-window.mjs';

const SA = 'Service_Appointment_Form';
let db, raw, store;
// A confirmed slot equal to the suggestion, so the override validation (which wants Override By for a different one) stays out of the way.
const slot = (t) => ({ Confirmed_Schedule_Date: '2027-06-01', Suggested_Schedule_Date: '2027-06-01', Confirmed_Time_Slot: t, Suggested_Time_Slot: t });

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

test('windowFor: a slot before noon is the morning half, noon or later the afternoon half; not a clock time = blank', () => {
  assert.equal(windowFor('08:00:00 AM'), 'Morning (8:00 AM–12:00 NN)');
  assert.equal(windowFor('11:59:00 AM'), 'Morning (8:00 AM–12:00 NN)');
  assert.equal(windowFor('12:00:00 PM'), 'Afternoon (12:00 NN–5:00 PM)');
  assert.equal(windowFor('3:30 PM'), 'Afternoon (12:00 NN–5:00 PM)');
  assert.equal(windowFor('12:15 AM'), 'Morning (8:00 AM–12:00 NN)');
  assert.equal(windowFor(''), '');
  assert.equal(windowFor('soon'), '');
  assert.equal(windowFor('09:00 AM', '7:30 AM', '6:00 PM'), 'Morning (7:30 AM–12:00 NN)');
});

test('the window is stamped on save from Confirmed_Time_Slot, follows a reschedule, and a widget cannot write it', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', ...slot('09:00:00 AM'), Time_Window: 'Whenever' });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Time_Window, 'Morning (8:00 AM–12:00 NN)');
  await store.updateRecord(SA, id, slot('02:00:00 PM'), { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Time_Window, 'Afternoon (12:00 NN–5:00 PM)');
  await store.updateRecord(SA, id, { Time_Window: 'Hacked' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Time_Window, 'Afternoon (12:00 NN–5:00 PM)');
  await store.updateRecord(SA, id, slot(''), { byForm: true });
  assert.ok(!(await raw.getRecordById(SA, id, { raw: true })).Time_Window, 'no slot, no window');
});

test('the half-days follow the Control Panel workday times', async () => {
  await raw.addRecord('Policy_Settings', { Policy_Key: 'workday_start_time', Value: '7:00 AM' });
  await raw.addRecord('Policy_Settings', { Policy_Key: 'workday_end_time', Value: '6:00 PM' });
  const id = await store.addRecord(SA, { Sales_Order: 'SO-2', Type_of_Delivery: 'Delivery Only', ...slot('01:00:00 PM') });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Time_Window, 'Afternoon (12:00 NN–6:00 PM)');
});
