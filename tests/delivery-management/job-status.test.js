// Job status chain + event log (spec v1.4, Delivery 03's "Job statuses"; 05/04 Timestamps and Event Log):
// server/modules/delivery-management/job-status.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { computeJobStatus, stampJobStatus, archiveOldJobs } from '../../server/modules/delivery-management/job-status.mjs';

const SA = 'Service_Appointment_Form';
const FW = 'Field_Work';
const EVENTS = 'Stage_Events';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, FW, EVENTS, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

test('computeJobStatus: the six stages, in order', () => {
  assert.equal(computeJobStatus({}), 'requested');
  assert.equal(computeJobStatus({ Confirmed_Schedule_Date: '2027-01-01' }), 'scheduled');
  assert.equal(computeJobStatus({ Confirmed_Schedule_Date: '2027-01-01', Appointment_Confirmed_At: '2026-12-01 09:00:00 AM' }), 'confirmed');
  assert.equal(computeJobStatus({ Confirmed_Schedule_Date: '2027-01-01', Appointment_Confirmed_At: 'x', Dispatched_At: 'x' }), 'dispatched');
  assert.equal(computeJobStatus({ Appointment_Status: 'Dispatched' }), 'dispatched');
  assert.equal(computeJobStatus({ Dispatched_At: 'x', Job_Arrived_At: 'x' }), 'on_site');
  assert.equal(computeJobStatus({ Job_Arrived_At: 'x', Appointment_Status: 'Completed' }), 'done');
  assert.equal(computeJobStatus({ Appointment_Status: 'Failed' }), 'done');
  assert.equal(computeJobStatus({ Appointment_Status: 'Completed', Job_Archived_At: 'x' }), 'archived');
});

test('a Service Appointment save stamps Job_Status and logs exactly one job.<status> event', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Job_Status, 'requested');
  let events = await raw.find(EVENTS, (e) => String(e.Record_Id) === String(id));
  assert.deepEqual(events.map((e) => e.Event), ['job.requested']);

  await store.updateRecord(SA, id, { Confirmed_Schedule_Date: '2027-01-01', Calendar_Entry_Created: true }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Job_Status, 'scheduled');
  events = await raw.find(EVENTS, (e) => String(e.Record_Id) === String(id));
  assert.deepEqual(events.map((e) => e.Event), ['job.requested', 'job.scheduled']);
});

test('re-saving with nothing changed never duplicates the event for the same stage (T-6)', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await stampJobStatus(raw, id);
  await stampJobStatus(raw, id);
  const events = await raw.find(EVENTS, (e) => String(e.Record_Id) === String(id));
  assert.equal(events.length, 1);
});

test('on_site: Field_Work\'s own "Status: Started" save stamps Job_Arrived_At and Job_Status, first write wins', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Confirmed_Schedule_Date: '2027-01-01', Calendar_Entry_Created: true });
  await store.addRecord(FW, { Sales_Order: 'SO-1', Service_Appointment_ID: id, Status: 'Started' });
  const first = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(first.Job_Status, 'on_site');
  assert.ok(first.Job_Arrived_At);
  await store.addRecord(FW, { Sales_Order: 'SO-1', Service_Appointment_ID: id, Status: 'Started' });
  const second = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(second.Job_Arrived_At, first.Job_Arrived_At, 'the second "Started" save does not restamp it');
});

test('archiveOldJobs: a Completed job past archive_after_days (default 7) is archived; a recent one is not', async () => {
  const old = await raw.addRecord(SA, { Sales_Order: 'SO-OLD', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Completed' });
  const recent = await raw.addRecord(SA, { Sales_Order: 'SO-RECENT', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Completed' });
  // backdate the old one's Modified_Time directly (the field itself is server-stamped on every save, so a
  // fixture has to reach around the store to set it, same as any other test touching a stamp field).
  await db.query('UPDATE "Service_Appointment_Form" SET "Modified_Time" = $1 WHERE "ID" = $2', ['2020-01-01 09:00:00 AM', old]);
  const result = await archiveOldJobs(raw);
  assert.equal(result.archived, 1);
  assert.equal((await raw.getRecordById(SA, old, { raw: true })).Job_Status, 'archived');
  assert.ok(!(await raw.getRecordById(SA, recent, { raw: true })).Job_Archived_At, 'not old enough yet');
  const [event] = await raw.find(EVENTS, (e) => String(e.Record_Id) === String(old));
  assert.equal(event.Event, 'job.archived');
});

test('archiveOldJobs (AR-R1): never archives a job with an open exception, even if old enough', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-FLAGGED', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Completed', Exception_Status: 'Flagged' });
  await db.query('UPDATE "Service_Appointment_Form" SET "Modified_Time" = $1 WHERE "ID" = $2', ['2020-01-01 09:00:00 AM', id]);
  const result = await archiveOldJobs(raw);
  assert.equal(result.archived, 0);
});

test('archiveOldJobs (AR-R3): a failed job with a reason code waits for its own redelivery to be done too', async () => {
  const failed = await raw.addRecord(SA, { Sales_Order: 'SO-FAILED', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Failed', Failure_Reason_Code: 'not_home' });
  await db.query('UPDATE "Service_Appointment_Form" SET "Modified_Time" = $1 WHERE "ID" = $2', ['2020-01-01 09:00:00 AM', failed]);
  const noRedeliveryYet = await archiveOldJobs(raw);
  assert.equal(noRedeliveryYet.archived, 0, 'no redelivery at all yet — not ready');

  const redo = await raw.addRecord(SA, { Sales_Order: 'SO-REDO', Rescheduled_From_SA: failed, Appointment_Status: 'Scheduled' });
  const redeliveryOpen = await archiveOldJobs(raw);
  assert.equal(redeliveryOpen.archived, 0, 'the redelivery exists but is not done yet');

  await raw.updateRecord(SA, redo, { Appointment_Status: 'Completed' }, { byForm: true });
  const redeliveryDone = await archiveOldJobs(raw);
  assert.equal(redeliveryDone.archived, 1, 'now both the original and its redelivery are done');
});

test('archiveOldJobs never touches an open (not Completed/Failed) job', async () => {
  await raw.addRecord(SA, { Sales_Order: 'SO-OPEN', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled' });
  const result = await archiveOldJobs(raw);
  assert.equal(result.archived, 0);
});
