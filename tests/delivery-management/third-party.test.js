// Third-party bookings (spec v1.4, Delivery 02 §5, TP-R1-R4): server/modules/delivery-management/third-party.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { recordThirdPartyBooking, recordThirdPartyResult } from '../../server/modules/delivery-management/third-party.mjs';
import { runPreDeliveryGate, dispatchDay } from '../../server/modules/delivery-management/dispatch.mjs';
import { confirmStopLoading, findDayPlan } from '../../server/modules/delivery-management/day-plans.mjs';

const SA = 'Service_Appointment_Form';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, 'Day_Plan', 'DMS_Exception_Queue']) await db.query(`DELETE FROM "${f}"`); });

test('TP-R1: records provider, booking ref, fee, pickup time and driver/plate, and confirms a not-yet-scheduled job', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Customer_Name: { first_name: 'Ana', last_name: 'Reyes' } });
  await recordThirdPartyBooking(raw, id, {
    provider: 'Lalamove', bookingRef: 'LLM-123', fee: 350, pickupTime: '09:00:00 AM',
    driverName: 'Jun', plate: 'ABC-123', date: '2027-07-01', user: 'dispatcher@x.com',
  });
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Fleet_Decision, '3rd Party');
  assert.equal(sa.Fleet_Assignment, 'Lalamove');
  assert.equal(sa.Third_Party_Provider, 'Lalamove');
  assert.equal(sa.Third_Party_Booking_Ref, 'LLM-123');
  assert.equal(Number(sa.Third_Party_Fee), 350);
  assert.equal(sa.Third_Party_Pickup_Time, '09:00:00 AM');
  assert.equal(sa.Third_Party_Driver_Name, 'Jun');
  assert.equal(sa.Third_Party_Plate, 'ABC-123');
  assert.equal(sa.Confirmed_Schedule_Date, '2027-07-01');
  assert.equal(sa.Calendar_Entry_Created, true);
  assert.equal(sa.Appointment_Status, 'Scheduled');
});

test('TP-R1: a provider or a booking ref is required', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await assert.rejects(recordThirdPartyBooking(raw, id, { bookingRef: 'X' }), /provider is required/);
  await assert.rejects(recordThirdPartyBooking(raw, id, { provider: 'Lalamove' }), /booking reference is required/);
});

test('TP-R1: a job already scheduled keeps its date — booking only adds the third-party details', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Confirmed_Schedule_Date: '2027-07-05', Appointment_Status: 'Scheduled', Calendar_Entry_Created: true });
  await recordThirdPartyBooking(raw, id, { provider: 'Lalamove', bookingRef: 'LLM-9', date: '2027-08-01' });
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Confirmed_Schedule_Date, '2027-07-05'); // unchanged, not overwritten by the new "date" param
});

test('TP-R4: records the dispatcher-entered result, stamping left/done "with the time we were told" when the provider gives no time of its own', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await recordThirdPartyResult(raw, id, { resultQty: '10/10 delivered', photo: '/uploads/proof.jpg', leftAt: '', doneAt: '', customerConfirmed: true });
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Third_Party_Result_Qty, '10/10 delivered');
  assert.equal(sa.Third_Party_Photo, '/uploads/proof.jpg');
  assert.ok(sa.Third_Party_Left_At);
  assert.ok(sa.Third_Party_Done_At);
  assert.equal(sa.Third_Party_Proof_Confirmed, true);
});

test('TP-R4: the provider\'s own reported time is kept as given, not replaced by "now"', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await recordThirdPartyResult(raw, id, { leftAt: '2027-07-01 08:00:00 AM', doneAt: '2027-07-01 10:00:00 AM' });
  const sa = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(sa.Third_Party_Left_At, '2027-07-01 08:00:00 AM');
  assert.equal(sa.Third_Party_Done_At, '2027-07-01 10:00:00 AM');
});

const COMPLETE_CHECKLIST = [1, 2, 5, 7, 8, 9, 10].map((id) => ({ Line: id, Status: 'Yes' })).concat([
  { Line: 3, Detail: { Required: 'No' } }, { Line: 4, Detail: { Restricted: 'No' } },
  { Line: 6, Detail: { Meters: '2.4' } }, { Line: 11, Detail: { Start: '8:00 AM', End: '6:00 PM' } },
]);

test('G8 (TP-R2): a third-party job passes the gate with its booking reference, never needing a driver signature', async () => {
  const id = await store.addRecord(SA, {
    Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Contact: '0917', Customer_Address: '123 St', Box_Count: 2,
    Site_Checklist: COMPLETE_CHECKLIST, Confirmed_Schedule_Date: '2027-09-01', Appointment_Status: 'Scheduled', Calendar_Entry_Created: true, Installer: 'CJ',
  });
  await recordThirdPartyBooking(raw, id, { provider: 'Lalamove', bookingRef: 'LLM-1' });
  await confirmStopLoading(raw, '2027-09-01', 'CJ', id, 2);
  const gate = await runPreDeliveryGate(raw, '2027-09-01', 'CJ');
  assert.equal(gate.ok, true);
  assert.equal(gate.stops[0].thirdParty, true);
  // No driver signature given at all — only the dispatcher's — and it still dispatches.
  const result = await dispatchDay(raw, '2027-09-01', 'CJ', { dispatcherSignature: 'e' });
  assert.equal(result.ok, true);
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Appointment_Status, 'Dispatched');
});

test('G8: a third-party job with no booking reference fails the gate', async () => {
  const id = await store.addRecord(SA, {
    Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Fleet_Decision: '3rd Party', Contact: '0917', Customer_Address: '123 St',
    Box_Count: 2, Site_Checklist: COMPLETE_CHECKLIST, Confirmed_Schedule_Date: '2027-09-01', Appointment_Status: 'Scheduled', Calendar_Entry_Created: true, Installer: 'CJ',
  });
  await confirmStopLoading(raw, '2027-09-01', 'CJ', id, 2);
  const gate = await runPreDeliveryGate(raw, '2027-09-01', 'CJ');
  assert.equal(gate.ok, false);
  assert.match(gate.stops[0].failures.join(' | '), /G8: third-party job needs a booking reference/);
});

test('G8: a day mixing an own-team job and a third-party job still needs a driver signature for the own-team one', async () => {
  const own = await store.addRecord(SA, {
    Sales_Order: 'SO-OWN', Type_of_Delivery: 'Delivery Only', Contact: '0917', Customer_Address: '123 St', Box_Count: 1,
    Site_Checklist: COMPLETE_CHECKLIST, Confirmed_Schedule_Date: '2027-09-02', Confirmed_Time_Slot: '08:00:00 AM', Appointment_Status: 'Scheduled', Calendar_Entry_Created: true, Installer: 'CJ',
  });
  const tp = await store.addRecord(SA, {
    Sales_Order: 'SO-TP', Type_of_Delivery: 'Delivery Only', Contact: '0917', Customer_Address: '123 St', Box_Count: 1,
    Site_Checklist: COMPLETE_CHECKLIST, Confirmed_Schedule_Date: '2027-09-02', Confirmed_Time_Slot: '09:00:00 AM', Appointment_Status: 'Scheduled', Calendar_Entry_Created: true, Installer: 'CJ',
  });
  await recordThirdPartyBooking(raw, tp, { provider: 'Lalamove', bookingRef: 'LLM-2' });
  await confirmStopLoading(raw, '2027-09-02', 'CJ', own, 1);
  await confirmStopLoading(raw, '2027-09-02', 'CJ', tp, 1);
  const noDriver = await dispatchDay(raw, '2027-09-02', 'CJ', { dispatcherSignature: 'e' });
  assert.equal(noDriver.ok, false);
  assert.match(noDriver.message, /driver and dispatcher signatures/);
  const withDriver = await dispatchDay(raw, '2027-09-02', 'CJ', { driverSignature: 'd', dispatcherSignature: 'e' });
  assert.equal(withDriver.ok, true);
});
