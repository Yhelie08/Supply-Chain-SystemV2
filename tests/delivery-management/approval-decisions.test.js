// Applying a decision on Delivery's own Approval_Queue items: server/modules/delivery-management/approval-decisions.mjs.
// Also covers the decisions.mjs fix (Record_Type guard) that made this possible — before it, deciding a Delivery
// item wrongly stamped "The shipment no longer exists." (procurement/decisions.mjs assumed every non-'pr' item
// was a shipment).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';

const AQ = 'Approval_Queue';
const SA = 'Service_Appointment_Form';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { await db.query(`DELETE FROM "${AQ}"`); await db.query(`DELETE FROM "${SA}"`); });

const prepared = (extra = {}) => raw.addRecord(AQ, {
  Kind: 'schedule_shortfall', Record_Type: 'service_appointment', Record_Id: '123', Record_No: 'SO-1',
  Summary: 'No slot', Options: JSON.stringify(['Add a team-day (overtime, extra installer)', 'Tell the customer (proposed new date)']),
  Status: 'pending', ...extra,
});

test('schedule_shortfall: deciding either option stamps a record-only Result, not a shipment lookup', async () => {
  const id = await prepared();
  await store.updateRecord(AQ, id, { Decision: 'Add a team-day (overtime, extra installer)' }, { byForm: true });
  const row = await raw.getRecordById(AQ, id, { raw: true });
  assert.equal(row.Status, 'decided');
  assert.match(row.Result, /Add the extra capacity yourself/);
  assert.doesNotMatch(row.Result, /shipment/i);
});

test('third_party_booking: "Book third party" and "Keep own team" each get their own Result', async () => {
  const book = await prepared({ Kind: 'third_party_booking', Options: JSON.stringify(['Book third party', 'Keep own team on 2027-01-05']) });
  await store.updateRecord(AQ, book, { Decision: 'Book third party' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, book, { raw: true })).Result, /Record a third-party booking/);

  const keep = await prepared({ Kind: 'third_party_booking', Record_Id: '456', Options: JSON.stringify(['Book third party', 'Keep own team on 2027-01-05']) });
  await store.updateRecord(AQ, keep, { Decision: 'Keep own team on 2027-01-05' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, keep, { raw: true })).Result, /Kept with the own team/);
});

test('third_party_booking: "Book third party" on a job that already has the booking says who it is booked with', async () => {
  const saId = await raw.addRecord(SA, { Sales_Order: 'SO-3P', Type_of_Delivery: 'Delivery Only', Third_Party_Provider: 'Lalamove', Third_Party_Booking_Ref: 'LLM-1' });
  const id = await prepared({ Kind: 'third_party_booking', Record_Id: String(saId), Options: JSON.stringify(['Book third party', 'Keep own team on 2027-01-05']) });
  await store.updateRecord(AQ, id, { Decision: 'Book third party' }, { byForm: true });
  assert.equal((await raw.getRecordById(AQ, id, { raw: true })).Result, 'Recorded. Booked with Lalamove (reference LLM-1).');
});

test('an unrecognised Kind under service_appointment is left alone, not guessed at', async () => {
  const id = await prepared({ Kind: 'some_future_kind', Options: JSON.stringify(['Confirm', 'Reopen']) });
  await store.updateRecord(AQ, id, { Decision: 'Confirm' }, { byForm: true });
  const row = await raw.getRecordById(AQ, id, { raw: true });
  assert.equal(row.Status, 'decided');
  assert.equal(row.Result, '', 'no Result stamped — not the wrong "shipment no longer exists" either');
});

// ---------- force_close (FR-R5): Confirm / Reopen ----------
async function forceClosed(extraSa = {}, payload = {}) {
  const saId = await raw.addRecord(SA, { Sales_Order: 'SO-FC', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Failed', Force_Closed: true, Force_Close_Reason: 'Phone died', Job_Done_At: '2026-11-18 10:00:00 AM', ...extraSa });
  const itemId = await prepared({ Kind: 'force_close', Record_Id: String(saId), Record_No: 'SO-FC', Options: JSON.stringify(['Confirm', 'Reopen']), Payload: JSON.stringify({ outcome: 'Failed', reason: 'Phone died', previousStatus: 'Dispatched', ...payload }) });
  return { saId, itemId };
}

test('force_close "Confirm": the close stands, the job is untouched', async () => {
  const { saId, itemId } = await forceClosed();
  await store.updateRecord(AQ, itemId, { Decision: 'Confirm' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, itemId, { raw: true })).Result, /Confirmed. The force-close stands/);
  const sa = await raw.getRecordById(SA, saId, { raw: true });
  assert.deepEqual([sa.Appointment_Status, sa.Force_Closed], ['Failed', true]);
});

test('force_close "Reopen": back to the status it had, force-close flags and done stamps cleared, job status moves on', async () => {
  const { saId, itemId } = await forceClosed({ Dispatched_At: '2026-11-18 08:00:00 AM', Job_Status: 'done' });
  await store.updateRecord(AQ, itemId, { Decision: 'Reopen' }, { byForm: true });
  const item = await raw.getRecordById(AQ, itemId, { raw: true });
  assert.match(item.Result, /Reopened\. The job is back to Dispatched \(job status dispatched\)/);
  const sa = await raw.getRecordById(SA, saId, { raw: true });
  assert.equal(sa.Appointment_Status, 'Dispatched');
  assert.ok(!sa.Force_Closed, 'Force_Closed cleared');
  assert.ok(!sa.Force_Close_Reason && !sa.Job_Done_At && !sa.Job_Archived_At, 'done stamps cleared');
  assert.equal(sa.Job_Status, 'dispatched');
});

test('force_close "Reopen" with no previousStatus on the item (older item) falls back to Scheduled', async () => {
  const { saId, itemId } = await forceClosed({}, { previousStatus: undefined });
  await store.updateRecord(AQ, itemId, { Decision: 'Reopen' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, saId, { raw: true })).Appointment_Status, 'Scheduled');
});

test('force_close "Reopen" is refused (and says so) when the job changed since, or no longer exists', async () => {
  const changed = await forceClosed({ Appointment_Status: 'Completed' });
  await store.updateRecord(AQ, changed.itemId, { Decision: 'Reopen' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, changed.itemId, { raw: true })).Result, /Not reopened: the job has changed since it was force-closed \(it is now Completed\)/);
  assert.equal((await raw.getRecordById(SA, changed.saId, { raw: true })).Appointment_Status, 'Completed');

  const gone = await prepared({ Kind: 'force_close', Record_Id: '999999', Options: JSON.stringify(['Confirm', 'Reopen']), Payload: JSON.stringify({ outcome: 'Failed' }) });
  await store.updateRecord(AQ, gone, { Decision: 'Reopen' }, { byForm: true });
  assert.match((await raw.getRecordById(AQ, gone, { raw: true })).Result, /no longer exists/);
});

test('a Procurement (shipment) item is untouched by the Delivery hook', async () => {
  const sId = await raw.addRecord('Shipments', { Shipment_No: 'SHP-1', Shipment_Mode: 'Sea' });
  const id = await raw.addRecord(AQ, { Kind: 'air_upgrade', Record_Type: 'shipment', Record_Id: String(sId), Record_No: 'SHP-1', Summary: 'x', Options: JSON.stringify(['upgrade_air', 'move_target', 'tell_customer']), Status: 'pending' });
  await store.updateRecord(AQ, id, { Decision: 'upgrade_air' }, { byForm: true });
  const row = await raw.getRecordById(AQ, id, { raw: true });
  assert.match(row.Result, /air/);
});
