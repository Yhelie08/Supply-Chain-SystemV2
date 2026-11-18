// Dispatch / the pre-delivery gate (spec v1.4, Delivery 03 §3, DS-R1-R5): server/modules/delivery-management/dispatch.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { runPreDeliveryGate, dispatchDay } from '../../server/modules/delivery-management/dispatch.mjs';
import { findDayPlan, stopIds, confirmStopLoading } from '../../server/modules/delivery-management/day-plans.mjs';

const truthy = (v) => v === true || v === 'true';

const SA = 'Service_Appointment_Form';
const EXC = 'DMS_Exception_Queue';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, EXC, 'Day_Plan']) await db.query(`DELETE FROM "${f}"`); });

const COMPLETE_CHECKLIST = [1, 2, 5, 7, 8, 9, 10].map((id) => ({ Line: id, Status: 'Yes' })).concat([
  { Line: 3, Detail: { Required: 'No' } }, { Line: 4, Detail: { Restricted: 'No' } },
  { Line: 6, Detail: { Meters: '2.4' } }, { Line: 11, Detail: { Start: '8:00 AM', End: '6:00 PM' } },
]);

const readyJob = (extra = {}) => ({
  Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Calendar_Entry_Created: true, Appointment_Status: 'Scheduled',
  Installer: 'CJ', Confirmed_Schedule_Date: '2027-06-01', Contact: '0917', Customer_Address: '123 St', Box_Count: 2,
  Site_Checklist: COMPLETE_CHECKLIST, ...extra,
});

test('runPreDeliveryGate: a fully-ready job passes once loading is confirmed with the matching box count', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, true);
  assert.deepEqual(gate.stops[0].failures, []);
});

test('runPreDeliveryGate: no contact/address (G2), no loading confirmed (G6), incomplete checklist (G7) all list at once', async () => {
  await store.addRecord(SA, readyJob({ Contact: '', Email: '', Customer_Address: '', Address: '', Site_Checklist: [] }));
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, false);
  const failures = gate.stops[0].failures.join(' | ');
  assert.match(failures, /G2: no contact/);
  assert.match(failures, /G2: no delivery address/);
  assert.match(failures, /G6: loading not confirmed/);
  assert.match(failures, /G7: site requirements checklist incomplete/);
});

test('runPreDeliveryGate: G4 fails while an exception is open on the job', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  await raw.addRecord(EXC, { Sales_Order_Reference: id, Status: 'Open', Exception_Reason: 'Something' });
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, false);
  assert.match(gate.stops[0].failures.join(' | '), /G4: an open exception/);
});

test('runPreDeliveryGate: G7 fails on a still-Pending permit even though the checklist itself is complete (SR-R4)', async () => {
  const pendingPermit = COMPLETE_CHECKLIST.map((r) => (r.Line === 3 ? { Line: 3, Detail: { Required: 'Yes', ObtainedStatus: 'Pending' } } : r));
  const id = await store.addRecord(SA, readyJob({ Site_Checklist: pendingPermit }));
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Checklist_Complete, true, 'a Pending permit still counts as "answered"');
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.equal(gate.ok, false);
  assert.match(gate.stops[0].failures.join(' | '), /G7: work permit \/ gate pass still Pending/);
});

test('runPreDeliveryGate: G6 fails on a box-count mismatch', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 1); // package has 2
  const gate = await runPreDeliveryGate(raw, '2027-06-01', 'CJ');
  assert.match(gate.stops[0].failures.join(' | '), /G6: loaded 1 boxes, package has 2/);
});

test('dispatchDay: a full pass stamps every job Dispatched and locks the day plan', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const result = await dispatchDay(raw, '2027-06-01', 'CJ', { user: 'dispatcher@x.com', driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(result.ok, true);
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Appointment_Status, 'Dispatched');
  assert.ok(sa.Dispatched_At);
  const plan = await findDayPlan(raw, '2027-06-01', 'CJ');
  assert.equal(plan.Locked, true);
  assert.equal(plan.Dispatched_By, 'dispatcher@x.com');
});

test('dispatchDay (DS-R4): a failing job is pulled off the plan, requeued, and raises a Dispatch exception; a passing job on the same day still goes out', async () => {
  const ok = await store.addRecord(SA, readyJob({ Sales_Order: 'SO-OK', Confirmed_Time_Slot: '08:00:00 AM' }));
  const bad = await store.addRecord(SA, readyJob({ Sales_Order: 'SO-BAD', Confirmed_Time_Slot: '09:00:00 AM', Contact: '', Email: '' }));
  await confirmStopLoading(raw, '2027-06-01', 'CJ', ok, 2);
  await confirmStopLoading(raw, '2027-06-01', 'CJ', bad, 2);
  const result = await dispatchDay(raw, '2027-06-01', 'CJ', { driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(result.ok, false);
  assert.equal((await raw.getRecordById(SA, ok, { raw: true })).Appointment_Status, 'Dispatched');
  const badSa = await raw.getRecordById(SA, bad, { raw: true });
  assert.equal(badSa.Appointment_Status, 'Queued');
  assert.equal(badSa.Confirmed_Schedule_Date, '');
  const plan = await findDayPlan(raw, '2027-06-01', 'CJ');
  assert.deepEqual(stopIds(plan), [String(ok)]);
  const [exc] = await raw.find(EXC, (r) => String(r.Sales_Order_Reference) === String(bad));
  assert.equal(exc.Exception_Stage, 'Dispatch');
  assert.match(exc.Exception_Reason, /G2: no contact/);
});

test('dispatchDay: everything failing locks nothing and leaves the day plan unlocked', async () => {
  await store.addRecord(SA, readyJob({ Contact: '', Email: '' }));
  const result = await dispatchDay(raw, '2027-06-01', 'CJ', { driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(result.ok, false);
  assert.match(result.message, /Every job on this day failed/);
  const plan = await findDayPlan(raw, '2027-06-01', 'CJ');
  assert.deepEqual(stopIds(plan), []); // the only stop was removed
  assert.equal(truthy(plan.Locked), false); // and the plan was never locked
});

test('dispatchDay (G8): refused without both signatures, even when every job would otherwise pass', async () => {
  const id = await store.addRecord(SA, readyJob());
  await confirmStopLoading(raw, '2027-06-01', 'CJ', id, 2);
  const noSignatures = await dispatchDay(raw, '2027-06-01', 'CJ');
  assert.equal(noSignatures.ok, false);
  assert.match(noSignatures.message, /G8/);
  const onlyDriver = await dispatchDay(raw, '2027-06-01', 'CJ', { driverSignature: 'd' });
  assert.equal(onlyDriver.ok, false);
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Appointment_Status, 'Scheduled'); // untouched
});

test('dispatchDay: nothing to dispatch when the team-day has no plan', async () => {
  const result = await dispatchDay(raw, '2099-01-01', 'Nobody');
  assert.equal(result.ok, false);
  assert.match(result.message, /Nothing to dispatch/);
});
