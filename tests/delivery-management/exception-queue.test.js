// Delivery Management, D2c: EXC_Resolve_Sync (server/modules/delivery-management/exception-queue.mjs), run on PGlite
// with the hooked store. Tests marked "mirrors Zoho" follow the Deluge script literally; they are to be confirmed
// against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ymd, addDays, todayDate, truthy, idOf } from '../../server/workflows/deluge.mjs';

const SA = 'Service_Appointment_Form';
const EXC = 'DMS_Exception_Queue';
const today = ymd(todayDate());
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, 'Daily_Team_Availability', EXC, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const customer = { first_name: 'Maria', last_name: 'Santos' };
const appointment = (extra = {}) => raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Customer_Name: customer, Appointment_Status: 'Scheduled', Exception_Status: 'Flagged', Exception_Reason: 'Calendar Full', ...extra });
const exception = (ref, extra = {}) => store.addRecord(EXC, { Sales_Order_Reference: ref, Exception_Stage: 'Scheduling', Exception_Reason: 'Calendar Full', Severity: 'Medium', Raised_By: 'System', Status: 'Open', ...extra });
const resolve = (id, extra = {}) => store.updateRecord(EXC, id, { Status: 'Resolved', ...extra }, { byForm: true });
const readSA = (id) => raw.getRecordById(SA, id, { raw: true });
const readExc = (id) => raw.getRecordById(EXC, id, { raw: true });

test('resolving stamps the resolution time and resolves the appointment\'s exception flag', async () => {
  const sa = await appointment();
  const id = await exception(sa);
  assert.equal((await readSA(sa)).Exception_Status, 'Flagged'); // an Open exception changes nothing
  await resolve(id);
  assert.notEqual((await readExc(id)).Resolution_Date, '');
  assert.equal((await readSA(sa)).Exception_Status, 'Resolved');
});

test('an existing resolution time is kept', async () => {
  const sa = await appointment();
  const id = await exception(sa, { Resolution_Date: '2026-11-01 10:00:00 AM' });
  const before = (await readExc(id)).Resolution_Date;
  await resolve(id);
  assert.equal((await readExc(id)).Resolution_Date, before);
});

test('mirrors Zoho: Dismissed needs an appointment to do anything; Resolved with no appointment only gets the stamp', async () => {
  const sa = await appointment();
  const dismissed = await exception(sa);
  await store.updateRecord(EXC, dismissed, { Status: 'Dismissed' }, { byForm: true });
  assert.equal((await readSA(sa)).Exception_Status, 'Resolved');
  assert.equal((await readExc(dismissed)).Resolution_Date, ''); // only Resolved is stamped

  const other = await appointment({ Sales_Order: 'SO-2' });
  const noRef = await exception('');
  await store.updateRecord(EXC, noRef, { Status: 'Dismissed' }, { byForm: true });
  assert.equal((await readSA(other)).Exception_Status, 'Flagged');
  const noRefResolved = await exception('');
  await resolve(noRefResolved);
  assert.notEqual((await readExc(noRefResolved)).Resolution_Date, '');
  assert.equal((await readSA(other)).Exception_Status, 'Flagged');
});

test('an exception that is neither Resolved nor Dismissed does nothing', async () => {
  const sa = await appointment();
  const id = await exception(sa);
  await store.updateRecord(EXC, id, { Status: 'In Progress' }, { byForm: true });
  assert.equal((await readSA(sa)).Exception_Status, 'Flagged');
  assert.equal((await readExc(id)).Resolution_Date, '');
});

test('Revert to System: the dates are cleared and the engine runs again at once, as a manual re-run', async () => {
  await raw.addRecord('Daily_Team_Availability', { Availability_Date: today, Installer: 'A', Driver: 'A-driver', Availability_Status: 'Full Day', Max_Capacity_Hours: 8 });
  const later = ymd(addDays(todayDate(), 3));
  const sa = await appointment({ Suggested_Schedule_Date: later, Suggested_Time_Slot: '08:00:00 AM', Confirmed_Schedule_Date: later, Confirmed_Time_Slot: '08:00:00 AM', Calendar_Entry_Created: true });
  const id = await exception(sa);
  await resolve(id, { Revert_to_System: true });
  const r = await readSA(sa);
  assert.equal(r.Suggested_Schedule_Date, today);
  assert.equal(r.Installer, 'A');
  assert.equal(r.Confirmed_Schedule_Date, '');
  assert.equal(r.Appointment_Status, 'Queued');
  assert.ok(!truthy(r.Calendar_Entry_Created));
  assert.equal(r.Exception_Status, 'Resolved');
});

test('Revert to System with no team available: the re-run flags the appointment again and raises a new exception', async () => {
  const sa = await appointment();
  const id = await exception(sa);
  await resolve(id, { Revert_to_System: true });
  const r = await readSA(sa);
  assert.equal(r.Exception_Status, 'Flagged');
  assert.equal(r.Exception_Reason, 'Calendar Full');
  const rows = await raw.find(EXC);
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((e) => e.Status === 'Open').length, 1);
});

test('Dispatch-stage requeue: a Priority copy with its items goes back to the queue, the failed attempt is archived, once only', async () => {
  const sa = await appointment({
    Sales_Order: 'SO-7', Customer_Address: '1 Main St', City: 'Quezon City', Contact: '09171234567', Email: 'maria@example.com',
    Type_of_Delivery: 'With Installation', Package_Number: 'PKG-1', Initial_Schedule_ID: 'IS-1', Service_Request_ID: 'SR-1', Service_Request: 'SR-1',
    Requested_Delivery_Date: '2026-12-01', Exception_Status: '', Exception_Reason: '', Installer: 'A', Confirmed_Schedule_Date: today,
    Item_Details: [{ Item_Name: 'Lamp', SKU: 'L-1', Quantity: 2, PAC: 'PAC-1' }, { Item_Name: 'Switch', SKU: 'S-1', Quantity: 1, PAC: 'PAC-2' }],
  });
  const id = await exception(sa, { Exception_Stage: 'Dispatch', Exception_Reason: 'Delivery failed' });
  const exceptionId = (await readExc(id)).Exception_ID;
  await resolve(id);
  const all = await raw.find(SA);
  assert.equal(all.length, 2);
  const copy = all.find((r) => r.ID !== sa);
  assert.equal(copy.Appointment_Status, 'Queued');
  assert.ok(truthy(copy.Priority));
  assert.equal(copy.Rescheduled_From_SA, sa);
  assert.equal(copy.Rescheduled_Via_Exception, String(exceptionId));
  assert.deepEqual([copy.Sales_Order, copy.Sales_Order_Display, copy.Customer_Address, copy.City, copy.Type_of_Delivery, copy.Package_Number], ['SO-7', 'SO-7', '1 Main St', 'Quezon City', 'With Installation', 'PKG-1']);
  assert.deepEqual([copy.Initial_Schedule_ID, copy.Service_Request_ID, copy.Requested_Delivery_Date], ['IS-1', 'SR-1', '2026-12-01']);
  assert.equal(copy.Customer_Name.last_name, 'Santos');
  assert.deepEqual(copy.Item_Details.map(({ Item_Name, SKU, Quantity, PAC }) => ({ Item_Name, SKU, Quantity: Number(Quantity), PAC })), [
    { Item_Name: 'Lamp', SKU: 'L-1', Quantity: 2, PAC: 'PAC-1' }, { Item_Name: 'Switch', SKU: 'S-1', Quantity: 1, PAC: 'PAC-2' }]);
  assert.equal(copy.Installer, ''); // a fresh order: no team, no dates
  assert.equal(copy.Confirmed_Schedule_Date, '');
  assert.equal((await readSA(sa)).Appointment_Status, 'Failed');
  assert.ok(truthy((await readExc(id)).Requeue_Processed));

  await store.updateRecord(EXC, id, { Severity: 'High' }, { byForm: true }); // saved again: not requeued twice
  assert.equal((await raw.find(SA)).length, 2);
});

test('only the Dispatch stage is requeued, and Dismissed is never requeued', async () => {
  const sa = await appointment();
  await resolve(await exception(sa, { Exception_Stage: 'Scheduling' }));
  const dismissed = await exception(sa, { Exception_Stage: 'Dispatch' });
  await store.updateRecord(EXC, dismissed, { Status: 'Dismissed' }, { byForm: true });
  assert.equal((await raw.find(SA)).length, 1);
  assert.equal(idOf((await readExc(dismissed)).Sales_Order_Reference), sa);
});
