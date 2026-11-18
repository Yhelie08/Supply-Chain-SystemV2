// Day plans (spec v1.4, Delivery 02 §4, DP-R1-R6): server/modules/delivery-management/day-plans.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import {
  findDayPlan, stopIds, reorderDayPlan, removeStop, confirmStopLoading, lockDayPlan,
} from '../../server/modules/delivery-management/day-plans.mjs';

const SA = 'Service_Appointment_Form';
const PLAN = 'Day_Plan';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, PLAN, 'DMS_Exception_Queue']) await db.query(`DELETE FROM "${f}"`); });

const scheduled = (extra = {}) => ({
  Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Calendar_Entry_Created: true, Appointment_Status: 'Scheduled',
  Installer: 'CJ', Confirmed_Schedule_Date: '2027-04-01', Confirmed_Time_Slot: '10:00:00 AM', ...extra,
});

test('a Scheduled appointment joins its team-day\'s plan automatically (DP-R1)', async () => {
  const id = await store.addRecord(SA, scheduled());
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.ok(plan);
  assert.deepEqual(stopIds(plan), [String(id)]);
  assert.equal(Number(plan.Version), 1);
});

test('default stop order is by window start, earliest first (DP-R2)', async () => {
  const late = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-LATE', Confirmed_Time_Slot: '02:00:00 PM' }));
  const early = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-EARLY', Confirmed_Time_Slot: '08:00:00 AM' }));
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.deepEqual(stopIds(plan), [String(early), String(late)]);
});

test('rescheduling a job to a new team-day moves it off the old plan and onto the new one', async () => {
  const id = await store.addRecord(SA, scheduled());
  await store.updateRecord(SA, id, { Installer: 'Edmon', Confirmed_Schedule_Date: '2027-04-02' }, { byForm: true });
  const old = await findDayPlan(raw, '2027-04-01', 'CJ');
  const next = await findDayPlan(raw, '2027-04-02', 'Edmon');
  assert.deepEqual(stopIds(old), []);
  assert.deepEqual(stopIds(next), [String(id)]);
});

test('a Queued (unscheduled) appointment never gets a day plan', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Queued' });
  assert.equal(await findDayPlan(raw, '', ''), null);
});

test('reorderDayPlan (DP-R3): refused with the wrong version, named "please refresh"', async () => {
  const a = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-A', Confirmed_Time_Slot: '08:00:00 AM' }));
  const b = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-B', Confirmed_Time_Slot: '09:00:00 AM' }));
  await assert.rejects(
    reorderDayPlan(raw, { date: '2027-04-01', installer: 'CJ', version: 99, order: [b, a] }),
    /please refresh/,
  );
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.deepEqual(stopIds(plan), [String(a), String(b)]); // nothing lost
});

test('reorderDayPlan (DP-R3): the right version reorders and bumps the version', async () => {
  const a = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-A', Confirmed_Time_Slot: '08:00:00 AM' }));
  const b = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-B', Confirmed_Time_Slot: '09:00:00 AM' }));
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  const result = await reorderDayPlan(raw, { date: '2027-04-01', installer: 'CJ', version: plan.Version, order: [b, a] });
  assert.equal(result.version, Number(plan.Version) + 1);
  const after = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.deepEqual(stopIds(after), [String(b), String(a)]);
});

test('reorderDayPlan (DP-R4): refused when the list is not the same jobs, just reordered', async () => {
  const a = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-A' }));
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  await assert.rejects(
    reorderDayPlan(raw, { date: '2027-04-01', installer: 'CJ', version: plan.Version, order: [a, '99999'] }),
    /same jobs, only reordered/,
  );
  await assert.rejects(
    reorderDayPlan(raw, { date: '2027-04-01', installer: 'CJ', version: plan.Version, order: [] }),
    /same jobs, only reordered/,
  );
});

test('confirmStopLoading (LS-R3) records the loaded box count against a stop', async () => {
  const id = await store.addRecord(SA, scheduled());
  await confirmStopLoading(raw, '2027-04-01', 'CJ', id, 4);
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.equal(plan.Stops[0].Loaded_Box_Count, 4);
  assert.equal(plan.Stops[0].Loading_Confirmed, true);
});

test('lockDayPlan (DS-R3) stamps Locked, Locked_At, Dispatched_By and both signatures', async () => {
  await store.addRecord(SA, scheduled());
  const locked = await lockDayPlan(raw, '2027-04-01', 'CJ', { user: 'dispatcher@x.com', driverSignature: 'd.png', dispatcherSignature: 'e.png' });
  assert.equal(locked.Locked, true);
  assert.ok(locked.Locked_At);
  assert.equal(locked.Dispatched_By, 'dispatcher@x.com');
  assert.equal(locked.Driver_Signature, 'd.png');
  assert.equal(locked.Dispatcher_Signature, 'e.png');
});

test('a locked day plan is not touched by a later reschedule onto it, or by removeStop/confirmStopLoading', async () => {
  const id = await store.addRecord(SA, scheduled());
  await lockDayPlan(raw, '2027-04-01', 'CJ');
  const other = await store.addRecord(SA, scheduled({ Sales_Order: 'SO-OTHER', Installer: 'Edmon', Confirmed_Schedule_Date: '2027-04-03' }));
  await store.updateRecord(SA, other, { Installer: 'CJ', Confirmed_Schedule_Date: '2027-04-01' }, { byForm: true });
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.deepEqual(stopIds(plan), [String(id)]); // the new job never joined the locked plan
  assert.equal(await removeStop(raw, '2027-04-01', 'CJ', id), false);
  await assert.rejects(confirmStopLoading(raw, '2027-04-01', 'CJ', id, 2), /locked/);
});

test('removeStop (DS-R4 support) takes a job off an unlocked plan', async () => {
  const id = await store.addRecord(SA, scheduled());
  assert.equal(await removeStop(raw, '2027-04-01', 'CJ', id), true);
  const plan = await findDayPlan(raw, '2027-04-01', 'CJ');
  assert.deepEqual(stopIds(plan), []);
});
