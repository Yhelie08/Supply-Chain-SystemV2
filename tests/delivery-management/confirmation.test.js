// Appointment confirmation + the unconfirmed-by-cutoff alert (spec v1.4, Delivery 03 §1, AP-R2/AP-R4):
// server/modules/delivery-management/confirmation.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ymd, addDays, todayDate } from '../../server/workflows/deluge.mjs';
import { runConfirmCutoffCheck } from '../../server/modules/delivery-management/confirmation.mjs';

const SA = 'Service_Appointment_Form';
const EXC = 'DMS_Exception_Queue';
const tomorrow = ymd(addDays(todayDate(), 1));
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, EXC]) await db.query(`DELETE FROM "${f}"`); });

test('Confirm_Appointment stamps Appointment_Confirmed_At once and clears the trigger back', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await store.updateRecord(SA, id, { Confirm_Appointment: true }, { byForm: true });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.ok(r.Appointment_Confirmed_At);
  assert.equal(r.Confirm_Appointment, false);
});

test('confirming twice keeps the first stamp (first write wins)', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await store.updateRecord(SA, id, { Confirm_Appointment: true }, { byForm: true });
  const first = (await raw.getRecordById(SA, id, { raw: true })).Appointment_Confirmed_At;
  await store.updateRecord(SA, id, { Confirm_Appointment: true }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Appointment_Confirmed_At, first);
});

test('AP-R4: an appointment confirmed-scheduled for tomorrow, not yet AP-R2-confirmed, gets one alert', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Pick Up', Confirmed_Schedule_Date: tomorrow });
  const result = await runConfirmCutoffCheck(raw);
  assert.equal(result.alerted, 1);
  const [exc] = await raw.find(EXC);
  assert.equal(exc.Exception_Reason, 'Unconfirmed by cutoff');
  assert.equal(String(exc.Sales_Order_Reference), String(id));
  const again = await runConfirmCutoffCheck(raw);
  assert.equal(again.alerted, 0, 'the same open exception is not raised twice');
  assert.equal((await raw.find(EXC)).length, 1);
});

test('AP-R4: an appointment already confirmed is not alerted', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Pick Up', Confirmed_Schedule_Date: tomorrow });
  await store.updateRecord(SA, id, { Confirm_Appointment: true }, { byForm: true });
  const result = await runConfirmCutoffCheck(raw);
  assert.equal(result.alerted, 0);
});

test('AP-R4: a completed or failed job is never alerted even if unconfirmed', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Pick Up', Confirmed_Schedule_Date: tomorrow, Calendar_Entry_Created: true, Appointment_Status: 'Completed' });
  const result = await runConfirmCutoffCheck(raw);
  assert.equal(result.alerted, 0);
});

test('AP-R4: only tomorrow is checked, not today or the day after', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-TODAY', Type_of_Delivery: 'Pick Up', Confirmed_Schedule_Date: ymd(todayDate()) });
  await store.addRecord(SA, { Sales_Order: 'SO-LATER', Type_of_Delivery: 'Pick Up', Confirmed_Schedule_Date: ymd(addDays(todayDate(), 2)) });
  const result = await runConfirmCutoffCheck(raw);
  assert.equal(result.checked, 0);
  assert.equal(result.alerted, 0);
});
