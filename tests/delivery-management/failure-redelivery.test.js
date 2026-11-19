// Failure, Redelivery and the Delivery Exception Queue (spec v1.4, Delivery 05, FR-R1-R5):
// server/modules/delivery-management/failure-redelivery.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import {
  failureReasonCodes, createRedeliveryJob, checkRedeliverySilence, forceCloseJob, getDeliveryExceptionQueue,
  DEFAULT_FAILURE_REASONS,
} from '../../server/modules/delivery-management/failure-redelivery.mjs';

const SA = 'Service_Appointment_Form';
const EXC = 'DMS_Exception_Queue';
const AQ = 'Approval_Queue';
const CATALOGUE = 'Delivery_Failure_Reasons';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows); // resolving an exception (below) must go through the hooked store,
  // same as a dispatcher's save in the UI would — EXC_Resolve_Sync only fires on hooked-store writes.
});
beforeEach(async () => { for (const f of [SA, EXC, AQ, CATALOGUE, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });
// Resolves the one open "Failed visit" exception for a job, the way a dispatcher would in the Exception Queue.
const resolveFailedVisit = async (failedSaId) => {
  const [exc] = await raw.find(EXC, (r) => String(r.Sales_Order_Reference) === String(failedSaId) && r.Status === 'Open');
  await store.updateRecord(EXC, exc.ID, { Status: 'Resolved' }, { byForm: true });
};

const failedJob = (extra = {}) => ({
  Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Failed',
  Order_Date: '2027-01-01', Requested_Delivery_Date: '2027-01-15', ...extra,
});

test('failureReasonCodes: the 11-code default when the catalogue is empty', async () => {
  const codes = await failureReasonCodes(raw);
  assert.equal(codes.length, 11);
  assert.deepEqual(codes, DEFAULT_FAILURE_REASONS.map((r) => r.Code));
});

test('failureReasonCodes: an admin-edited catalogue replaces the default entirely', async () => {
  await raw.addRecord(CATALOGUE, { Code: 'custom_one', Reason: 'x', Next_Step: 'y', Active: true });
  const codes = await failureReasonCodes(raw);
  assert.deepEqual(codes, ['custom_one']);
});

test('createRedeliveryJob (FR-R1): only a Completed/Failed job can get one', async () => {
  const id = await raw.addRecord(SA, failedJob({ Appointment_Status: 'Scheduled' }));
  await assert.rejects(createRedeliveryJob(raw, id, { reasonCode: 'not_home' }), /already Completed or Failed/);
});

test('createRedeliveryJob: refuses an unknown code, and "other" without notes', async () => {
  const id = await raw.addRecord(SA, failedJob());
  await assert.rejects(createRedeliveryJob(raw, id, { reasonCode: 'made_up' }), /not one of the failure reason codes/);
  await assert.rejects(createRedeliveryJob(raw, id, { reasonCode: 'other' }), /Notes are required/);
});

test('createRedeliveryJob (2026-11-18): every reason code raises a Dispatch exception now, it does not create the redelivery itself', async () => {
  const id = await raw.addRecord(SA, failedJob());
  const { raisedException } = await createRedeliveryJob(raw, id, { reasonCode: 'not_home' });
  assert.equal(raisedException, true);
  const [exc] = await raw.find(EXC, (r) => String(r.Sales_Order_Reference) === String(id));
  assert.equal(exc.Exception_Stage, 'Dispatch');
  assert.equal(exc.Exception_Reason, 'Failed visit: not_home');
  assert.equal((await raw.find(SA, (r) => String(r.Rescheduled_From_SA) === String(id))).length, 0, 'not created yet — only once the exception is resolved');
});

test('createRedeliveryJob (FR-R1/R2): stamps the reason on the original, keeps Order Date/target on the redelivery once resolved, never edits the original\'s outcome', async () => {
  const id = await raw.addRecord(SA, failedJob({ Item_Details: [{ Item_Name: 'Sofa', SKU: 'SKU-1', Quantity: 1, PAC: 'A' }] }));
  await createRedeliveryJob(raw, id, { reasonCode: 'not_home' });
  const original = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(original.Failure_Reason_Code, 'not_home');

  await resolveFailedVisit(id);
  const redo = (await raw.find(SA, (r) => String(r.Rescheduled_From_SA) === String(id)))[0];
  assert.equal(redo.Appointment_Status, 'Queued');
  assert.equal(redo.Order_Date, '2027-01-01');
  assert.equal(redo.Requested_Delivery_Date, '2027-01-15');
  assert.equal(redo.Priority, true);
  assert.equal(redo.Broken_Redelivery, false);
  assert.deepEqual(redo.Item_Details.map((i) => i.SKU), ['SKU-1']);
});

test('createRedeliveryJob (FR-R2): damaged_in_transit and refused flag Broken_Redelivery on the resolved redelivery; other codes do not', async () => {
  const damaged = await raw.addRecord(SA, failedJob({ Sales_Order: 'SO-DMG' }));
  await createRedeliveryJob(raw, damaged, { reasonCode: 'damaged_in_transit' });
  await resolveFailedVisit(damaged);
  const redoDmg = (await raw.find(SA, (r) => String(r.Rescheduled_From_SA) === String(damaged)))[0];
  assert.equal(redoDmg.Broken_Redelivery, true);

  const notHome = await raw.addRecord(SA, failedJob({ Sales_Order: 'SO-NH' }));
  await createRedeliveryJob(raw, notHome, { reasonCode: 'not_home' });
  await resolveFailedVisit(notHome);
  const redoNh = (await raw.find(SA, (r) => String(r.Rescheduled_From_SA) === String(notHome)))[0];
  assert.equal(redoNh.Broken_Redelivery, false);
});

test('createRedeliveryJob: refuses a second call while the exception is still open, and once more once the redelivery exists', async () => {
  const id = await raw.addRecord(SA, failedJob());
  await createRedeliveryJob(raw, id, { reasonCode: 'not_home' });
  await assert.rejects(createRedeliveryJob(raw, id, { reasonCode: 'weather_road' }), /already open/);

  await resolveFailedVisit(id);
  await assert.rejects(createRedeliveryJob(raw, id, { reasonCode: 'weather_road' }), /already exists/);
});

test('checkRedeliverySilence (FR-R4): alerts a done+failure-coded job past the window with no redelivery, skips one with a redelivery or too recent', async () => {
  const overdue = await raw.addRecord(SA, failedJob({ Sales_Order: 'SO-OVERDUE', Failure_Reason_Code: 'not_home' }));
  await db.query('UPDATE "Service_Appointment_Form" SET "Job_Done_At" = $1 WHERE "ID" = $2', ['2020-01-01 09:00:00 AM', overdue]);
  const alreadyRedone = await raw.addRecord(SA, failedJob({ Sales_Order: 'SO-REDONE', Failure_Reason_Code: 'not_home' }));
  await db.query('UPDATE "Service_Appointment_Form" SET "Job_Done_At" = $1 WHERE "ID" = $2', ['2020-01-01 09:00:00 AM', alreadyRedone]);
  await raw.addRecord(SA, { Sales_Order: 'SO-REDONE-2', Rescheduled_From_SA: alreadyRedone, Appointment_Status: 'Queued' });
  await raw.addRecord(SA, failedJob({ Sales_Order: 'SO-RECENT', Failure_Reason_Code: 'not_home' })); // just failed, within the window

  const result = await checkRedeliverySilence(raw);
  assert.equal(result.alerted, 1);
  const [exc] = await raw.find(EXC, (r) => String(r.Sales_Order_Reference) === String(overdue));
  assert.match(exc.Exception_Reason, /No redelivery scheduled within 2 days/);

  const again = await checkRedeliverySilence(raw);
  assert.equal(again.alerted, 0, 'the same open exception is not raised twice');
});

test('forceCloseJob (FR-R5): sets the outcome, flags Force_Closed, and prepares a force_close Approval_Queue item with the spec\'s own options', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled' });
  const { approvalId } = await forceCloseJob(raw, id, { outcome: 'Failed', reason: 'Phone died mid-visit', user: 'dispatcher@x.com' });
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Appointment_Status, 'Failed');
  assert.equal(sa.Force_Closed, true);
  assert.equal(sa.Force_Close_Reason, 'Phone died mid-visit');
  const item = await raw.getRecordById(AQ, approvalId, { raw: true });
  assert.equal(item.Kind, 'force_close');
  assert.deepEqual(JSON.parse(item.Options), ['Confirm', 'Reopen']);
  assert.equal(item.Status, 'pending');
  assert.equal(JSON.parse(item.Payload).previousStatus, 'Scheduled', 'what Reopen puts the job back to');
});

test('forceCloseJob: refuses a bad outcome or a blank reason', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await assert.rejects(forceCloseJob(raw, id, { outcome: 'Dispatched', reason: 'x' }), /Outcome must be/);
  await assert.rejects(forceCloseJob(raw, id, { outcome: 'Failed', reason: '' }), /reason is required/);
});

test('getDeliveryExceptionQueue: merges open exceptions, pending schedule_shortfall/third_party_booking approvals, and awaiting-redelivery jobs, sorted by category then Order Date', async () => {
  const broken = await raw.addRecord(SA, { Sales_Order: 'SO-BROKEN', Category: 'broken', Order_Date: '2027-01-01' });
  await raw.addRecord(EXC, { Sales_Order_Reference: broken, Status: 'Open', Exception_Reason: 'Something broke' });

  const lateJob = await raw.addRecord(SA, { Sales_Order: 'SO-LATE', Category: 'late', Order_Date: '2027-01-02' });
  await raw.addRecord(AQ, { Kind: 'schedule_shortfall', Record_Id: String(lateJob), Status: 'pending', Summary: 'No slot', Options: JSON.stringify(['Add a team-day (overtime, extra installer)', 'Tell the customer (proposed new date)']) });

  const atRisk = await raw.addRecord(SA, { Sales_Order: 'SO-RISK', Category: 'at_risk', Order_Date: '2027-01-03', Appointment_Status: 'Failed', Failure_Reason_Code: 'not_home' });

  // A pending decided item (not pending) must not show up.
  await raw.addRecord(AQ, { Kind: 'third_party_booking', Record_Id: '9999', Status: 'decided', Summary: 'done already', Options: '[]' });

  const items = await getDeliveryExceptionQueue(raw);
  assert.deepEqual(items.map((i) => i.kind), ['exception', 'schedule_shortfall', 'awaiting_redelivery']);
  await raw.addRecord(AQ, { Kind: 'force_close', Record_Id: String(atRisk), Status: 'pending', Summary: 'SO-RISK was force-closed as Failed: x', Options: JSON.stringify(['Confirm', 'Reopen']) });
  assert.ok((await getDeliveryExceptionQueue(raw)).some((i) => i.kind === 'force_close' && i.options.join() === 'Confirm,Reopen'), 'a pending force_close review shows in the queue');
  assert.deepEqual(items.map((i) => i.saId), [broken, lateJob, atRisk]);
  assert.deepEqual(items.map((i) => i.so), ['SO-BROKEN', 'SO-LATE', 'SO-RISK']);
  assert.deepEqual(items[1].options, ['Add a team-day (overtime, extra installer)', 'Tell the customer (proposed new date)']);
  assert.equal(items[0].options, undefined, 'only approval-kind rows carry options');
});

// ---------- permits still Pending, close to the job's date (review: "permits pending malapit sa target") ----------
const PERMIT_PENDING = [{ Line: 3, Detail: { Required: 'Yes', ObtainedStatus: 'Pending' } }];
const PERMIT_OBTAINED = [{ Line: 3, Detail: { Required: 'Yes', ObtainedStatus: 'Obtained' } }];

test('getDeliveryExceptionQueue: a Pending permit shows when the job is within permit_warn_days (default 2) or past its date; not before, not once obtained, not once done', async () => {
  const now = new Date(2027, 5, 10, 9, 0, 0); // 2027-06-10
  const mk = (so, date, extra = {}) => raw.addRecord(SA, { Sales_Order: so, Type_of_Delivery: 'With Installation', Appointment_Status: 'Scheduled', Confirmed_Schedule_Date: date, Site_Checklist: PERMIT_PENDING, ...extra });
  const soon = await mk('SO-SOON', '2027-06-12');       // 2 days: inside
  await mk('SO-TODAY', '2027-06-10');                    // today: inside
  await mk('SO-PAST', '2027-06-08');                     // 2 days past: inside, says so
  await mk('SO-FAR', '2027-06-20');                      // 10 days: not yet
  await mk('SO-OBTAINED', '2027-06-11', { Site_Checklist: PERMIT_OBTAINED });
  await mk('SO-DONE', '2027-06-11', { Appointment_Status: 'Completed' });
  await mk('SO-NODATE', '', {});
  const items = (await getDeliveryExceptionQueue(raw, { now })).filter((i) => i.kind === 'permit_pending');
  assert.deepEqual(items.map((i) => i.so).sort(), ['SO-PAST', 'SO-SOON', 'SO-TODAY']);
  const byNo = Object.fromEntries(items.map((i) => [i.so, i.summary]));
  assert.match(byNo['SO-SOON'], /in 2 day\(s\) \(2027-06-12\)/);
  assert.match(byNo['SO-TODAY'], /the job is today/);
  assert.match(byNo['SO-PAST'], /2 day\(s\) past its date/);
  assert.equal(items.find((i) => i.so === 'SO-SOON').saId, soon);
});

test('permit_warn_days is read from the settings: with 14 the far job shows too', async () => {
  const now = new Date(2027, 5, 10, 9, 0, 0);
  await raw.addRecord('Policy_Settings', { Policy_Key: 'permit_warn_days', Value: '14' });
  await raw.addRecord(SA, { Sales_Order: 'SO-FAR', Type_of_Delivery: 'With Installation', Appointment_Status: 'Scheduled', Confirmed_Schedule_Date: '2027-06-20', Site_Checklist: PERMIT_PENDING });
  assert.equal((await getDeliveryExceptionQueue(raw, { now })).filter((i) => i.kind === 'permit_pending').length, 1);
});
