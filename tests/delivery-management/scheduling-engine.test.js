// Delivery Management, D2b: the SA_Scheduling_Engine workflow (server/modules/delivery-management/scheduling-engine.mjs):
// four actions that run after a Service Appointment is saved through the API, here on PGlite with the hooked store.
// Tests marked "mirrors Zoho" follow the Deluge scripts literally; they are to be confirmed against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ymd, addDays, todayDate, truthy } from '../../server/workflows/deluge.mjs';

const SA = 'Service_Appointment_Form';
const FORMS = [SA, 'Daily_Team_Availability', 'DMS_Exception_Queue', 'Policy_Settings'];
const inDays = (n) => ymd(addDays(todayDate(), n));
const today = inDays(0);
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const team = (installer, extra = {}) => raw.addRecord('Daily_Team_Availability', { Availability_Date: today, Installer: installer, Driver: `${installer}-driver`, Availability_Status: 'Full Day', Max_Capacity_Hours: 8, ...extra });
const customer = { first_name: 'Maria', last_name: 'Santos' };
// A record whose site is confirmed, ready for the engine.
const site = (extra = {}) => ({ Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Customer_Name: customer, Customer_Address: '1 Main St', City: 'Quezon City', Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'ok', ...extra });
// A record that already has a suggestion (written without hooks), to be confirmed through the hooked store.
const suggested = (extra = {}) => raw.addRecord(SA, { Sales_Order: 'SO-2', Type_of_Delivery: 'Delivery Only', Customer_Name: customer, Customer_Address: '1 Main St', City: 'Quezon City', Installer: 'A', Assigned_to_Driver: 'A-driver', Fleet_Assignment: 'Hino', Suggested_Schedule_Date: today, Suggested_Time_Slot: '08:00:00 AM', Estimated_Duration: 2, Appointment_Status: 'Queued', ...extra });
const read = (id) => raw.getRecordById(SA, id, { raw: true });
const exceptions = () => raw.find('DMS_Exception_Queue');
const approve = (id, extra = {}) => store.updateRecord(SA, id, { Confirmed_Schedule_Date: today, Confirmed_Time_Slot: '08:00:00 AM', ...extra }, { byForm: true });

test('action 1: a confirmed site with no dates gets a suggestion right after the save', async () => {
  await team('A');
  const id = await store.addRecord(SA, site());
  const r = await read(id);
  assert.equal(r.Suggested_Schedule_Date, today);
  assert.equal(r.Suggested_Time_Slot, '08:00:00 AM');
  assert.equal(r.Installer, 'A');
  assert.equal(r.Appointment_Status, 'Queued');
});

test('action 1: not run when the site is not confirmed, or when a date is already there', async () => {
  await team('A');
  assert.equal((await read(await store.addRecord(SA, site({ Site_Confirmation_Status: 'Pending' })))).Installer, '');
  assert.equal((await read(await store.addRecord(SA, site({ Suggested_Schedule_Date: inDays(5) })))).Installer, '');
});

test('action 2: approving the suggestion writes the calendar entry and marks the appointment Scheduled', async () => {
  await team('A', { Vehicle: 'Hino' });
  const id = await store.addRecord(SA, site());
  await approve(id);
  const r = await read(id);
  assert.equal(r.Calendar_Entry_Created, true);
  assert.equal(r.Appointment_Status, 'Scheduled');
  assert.ok(!truthy(r.Override_Applied));
  assert.equal(r.Calendar_Event_Summary, `Title: SO-1 - Maria Santos | Date: ${today} | Time: 08:00:00 AM (2.30 hrs) | Team: A / A-driver | Fleet: Hino | Type: Delivery Only | Location: 1 Main St, Quezon City | Notes: `);
});

test('action 2: a different date or slot is an override: flagged, stamped, and the reason goes into the summary', async () => {
  await team('A');
  const id = await suggested();
  await approve(id, { Confirmed_Time_Slot: '09:00:00 AM', Override_By: 'Maria', Override_Reason: 'Customer asked' });
  const r = await read(id);
  assert.ok(truthy(r.Override_Applied));
  assert.notEqual(r.Override_Timestamp, '');
  assert.match(r.Calendar_Event_Summary, /Time: 09:00:00 AM \(2\.30 hrs\) .* \| Notes: Override: Customer asked$/);
  assert.equal(r.Appointment_Status, 'Scheduled');
});

test('action 2: a full day with no override is a Calendar Conflict: flagged, one exception, no calendar entry', async () => {
  await team('A');
  await suggested({ Sales_Order: 'SO-other', Confirmed_Schedule_Date: today, Calendar_Entry_Created: true, Estimated_Duration: 6, Appointment_Status: 'Scheduled' }); // 6.90 hours
  const id = await suggested(); // 2.30 more = 9.20 > 8
  await approve(id);
  const r = await read(id);
  assert.equal(r.Exception_Status, 'Flagged');
  assert.equal(r.Exception_Reason, 'Calendar Conflict');
  assert.ok(!truthy(r.Calendar_Entry_Created));
  assert.equal(r.Appointment_Status, 'Queued');
  await approve(id);
  const rows = await exceptions();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].Exception_Stage, rows[0].Exception_Reason, rows[0].Severity, rows[0].Status], ['Calendar', 'Calendar Conflict', 'High', 'Open']);
});

test('action 2: a full day WITH an override is allowed on purpose (ASAP) and the summary says so', async () => {
  await team('A');
  await suggested({ Sales_Order: 'SO-other', Confirmed_Schedule_Date: today, Calendar_Entry_Created: true, Estimated_Duration: 6, Appointment_Status: 'Scheduled' });
  const id = await suggested();
  await approve(id, { Confirmed_Time_Slot: '09:00:00 AM', Override_By: 'Maria', Override_Reason: 'Customer asked' });
  const r = await read(id);
  assert.equal(r.Calendar_Entry_Created, true);
  assert.equal(r.Calendar_Event_Summary, `Title: SO-2 - Maria Santos | Date: ${today} | Time: 09:00:00 AM (2.30 hrs) | Team: A / A-driver | Fleet: Hino | Type: Delivery Only | Location: 1 Main St, Quezon City | Notes: Override: Customer asked | ASAP - Exceeds Daily Capacity (9.20 / 8 hrs)`);
  assert.equal((await exceptions()).length, 0);
});

test('mirrors Zoho: a successful confirmation resolves an old Calendar Conflict flag', async () => {
  await team('A');
  const id = await suggested({ Exception_Status: 'Flagged', Exception_Reason: 'Calendar Conflict' });
  await approve(id);
  assert.equal((await read(id)).Exception_Status, 'Resolved');
});

test('mirrors Zoho: the clean-up also resolves Calendar Full and Overtime reasons whether or not they are Flagged, but not other flags', async () => {
  await team('A');
  const full = await suggested({ Exception_Status: 'Open', Exception_Reason: 'Calendar Full' });
  await approve(full);
  assert.equal((await read(full)).Exception_Status, 'Resolved');
  const other = await suggested({ Exception_Status: 'Flagged', Exception_Reason: 'Requires Manual Planning' });
  await approve(other);
  assert.equal((await read(other)).Exception_Status, 'Flagged');
});

test('action 2: Pick Up and 3rd Party confirm at once, with no team and no capacity check', async () => {
  const pick = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Pick Up', Customer_Name: customer, Confirmed_Schedule_Date: inDays(1), Confirmed_Time_Slot: '10:00:00 AM' });
  let r = await read(pick);
  assert.equal(r.Fleet_Assignment, 'Customer Pickup');
  assert.equal(r.Calendar_Event_Summary, `Title: SO-1 - Maria Santos | Date: ${inDays(1)} | Time: 10:00:00 AM | Type: Pick Up | Notes: Customer/dispatcher-scheduled pickup, no delivery team assigned`);
  assert.equal(r.Appointment_Status, 'Scheduled');
  const third = await store.addRecord(SA, { Sales_Order: 'SO-3', Fleet_Decision: '3rd Party', Fleet_Assignment: 'Lalamove', Customer_Name: customer, Confirmed_Schedule_Date: inDays(1), Confirmed_Time_Slot: '10:00:00 AM' });
  r = await read(third);
  assert.equal(r.Calendar_Event_Summary, `Title: SO-3 - Maria Santos | Date: ${inDays(1)} | Time: 10:00:00 AM | Fleet: Lalamove | Notes: 3rd-party courier, no internal team assigned`);
  assert.equal(r.Calendar_Entry_Created, true);
  const unnamed = await store.addRecord(SA, { Sales_Order: 'SO-4', Fleet_Decision: '3rd Party', Confirmed_Schedule_Date: inDays(1), Confirmed_Time_Slot: '10:00:00 AM' });
  assert.match((await read(unnamed)).Calendar_Event_Summary, /\| Fleet: 3rd Party \|/);
});

test('action 2: only when there is a confirmed date and no calendar entry yet', async () => {
  await team('A');
  const id = await suggested();
  await store.updateRecord(SA, id, { Estimated_Duration: 3 }, { byForm: true }); // no confirmed date yet: nothing to write
  assert.ok(!truthy((await read(id)).Calendar_Entry_Created));
  await approve(id);
  const summary = (await read(id)).Calendar_Event_Summary;
  await store.updateRecord(SA, id, { Estimated_Duration: 3 }, { byForm: true });
  assert.equal((await read(id)).Calendar_Event_Summary, summary); // already has its calendar entry: not rewritten
});

test('action 3: Completed tags the summary once; Failed only when a calendar entry exists', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-5', Calendar_Event_Summary: 'Title: x | Notes: ', Calendar_Entry_Created: true, Appointment_Status: 'Scheduled' });
  await store.updateRecord(SA, id, { Appointment_Status: 'Completed' }, { byForm: true });
  assert.equal((await read(id)).Calendar_Event_Summary, 'Title: x | Notes:  [Completed]');
  await store.updateRecord(SA, id, { Sales_Order: 'SO-5b' }, { byForm: true });
  assert.equal((await read(id)).Calendar_Event_Summary, 'Title: x | Notes:  [Completed]');

  const failed = await raw.addRecord(SA, { Sales_Order: 'SO-6', Calendar_Event_Summary: 'Title: y', Appointment_Status: 'Scheduled' });
  await store.updateRecord(SA, failed, { Appointment_Status: 'Failed' }, { byForm: true });
  assert.equal((await read(failed)).Calendar_Event_Summary, 'Title: y');
  await store.updateRecord(SA, failed, { Calendar_Entry_Created: true }, { byForm: true });
  assert.equal((await read(failed)).Calendar_Event_Summary, 'Title: y [Failed]');
});

test('action 4: a delivery changed to Pick Up releases its team and is confirmed as a pickup', async () => {
  const id = await suggested({ Confirmed_Schedule_Date: '', Confirmed_Time_Slot: '' });
  await store.updateRecord(SA, id, { Type_of_Delivery: 'Pick Up', Confirmed_Schedule_Date: inDays(1), Confirmed_Time_Slot: '10:00:00 AM' }, { byForm: true });
  const r = await read(id);
  assert.deepEqual([r.Installer, r.Assigned_to_Driver, r.Suggested_Schedule_Date, r.Suggested_Time_Slot, r.Fleet_Assignment], ['', '', '', '', 'Customer Pickup']);
  assert.equal(r.Calendar_Event_Summary, `Title: SO-2 - Maria Santos | Date: ${inDays(1)} | Time: 10:00:00 AM | Type: Pick Up | Notes: Converted from delivery to Pick Up - original team released`);
  assert.equal(r.Appointment_Status, 'Scheduled');
  assert.equal(r.Calendar_Entry_Created, true);

  const queued = await suggested();
  await store.updateRecord(SA, queued, { Type_of_Delivery: 'Pick Up' }, { byForm: true });
  const q = await read(queued);
  assert.equal(q.Installer, '');
  assert.equal(q.Appointment_Status, 'Queued');
  assert.ok(!truthy(q.Calendar_Entry_Created));
});

test('mirrors Zoho: action 2 reads the saved input, so a Priority order the engine confirmed itself keeps the engine\'s summary', async () => {
  await team('A', { Vehicle: 'Hino' });
  const id = await store.addRecord(SA, site({ Priority: true }));
  const r = await read(id);
  assert.equal(r.Appointment_Status, 'Scheduled');
  assert.equal(r.Calendar_Entry_Created, true);
  assert.equal(r.Calendar_Event_Summary, `Title: SO-1 - Maria Santos | Date: ${today} | Time: 8:00 AM (2.30 hrs) | Team: A / A-driver | Fleet: Hino | Type: Delivery Only | Location: 1 Main St, Quezon City | Notes: Auto-confirmed (Priority)`);
});

test('writes made by the engine do not run the workflows again, and the custom API path (no hooks) does not run them either', async () => {
  await team('A');
  const id = await store.addRecord(SA, site());
  assert.equal((await read(id)).Appointment_Status, 'Queued'); // would loop or be Scheduled if the hooks had re-fired
  const direct = await raw.addRecord(SA, site());
  assert.equal((await read(direct)).Installer, '');
});
