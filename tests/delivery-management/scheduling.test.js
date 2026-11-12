// Delivery Management, D2a: the scheduling engine (server/modules/delivery-management/scheduling.mjs, from
// functions/dmsScheduleSlot.dg) and the custom API dms_reschedule, run on PGlite. Tests marked "mirrors Zoho" follow the
// Deluge script literally, quirks included; they are to be confirmed against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { ymd, addDays, todayDate } from '../../server/workflows/deluge.mjs';
import { scheduleSlot, slotText, storedClock } from '../../server/modules/delivery-management/scheduling.mjs';
import { customApis } from '../../server/modules/index.mjs';

const FORMS = ['Service_Appointment_Form', 'Daily_Team_Availability', 'DMS_Exception_Queue', 'Policy_Settings'];
const inDays = (n) => ymd(addDays(todayDate(), n));
let db, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const team = (installer, extra = {}) => store.addRecord('Daily_Team_Availability', { Availability_Date: inDays(0), Installer: installer, Driver: `${installer}-driver`, Availability_Status: 'Full Day', Max_Capacity_Hours: 8, ...extra });
const sa = (extra = {}) => store.addRecord('Service_Appointment_Form', { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Queued', Customer_Name: { first_name: 'Maria', last_name: 'Santos' }, ...extra });
const job = (installer, hours, extra = {}) => sa({ Sales_Order: `SO-${installer}-${hours}`, Installer: installer, Confirmed_Schedule_Date: inDays(0), Estimated_Duration: hours, Appointment_Status: 'Scheduled', Calendar_Entry_Created: true, ...extra });
const policy = (key, Value) => store.addRecord('Policy_Settings', { Policy_Key: key, Value });
const read = (id) => store.getRecordById('Service_Appointment_Form', id, { raw: true });
const exceptions = () => store.find('DMS_Exception_Queue');

test('clock text: the start time plus the used hours, whole-minute arithmetic, stored the way Zoho keeps a time', () => {
  assert.equal(slotText('', 0), '8:00 AM');
  assert.equal(slotText(null, 2.3), '10:18 AM');
  assert.equal(slotText('09:00:00 AM', 4.6), '1:36 PM');
  assert.equal(slotText('11:30 AM', 1), '12:30 PM');
  assert.equal(slotText('12:00 AM', 0.5), '12:30 AM');
  assert.equal(storedClock('8:00 AM'), '08:00:00 AM');
  assert.equal(storedClock('1:36 PM'), '01:36:00 PM');
});

test('a record that does not exist, or an id that is not a number, answers "Record not found."', async () => {
  assert.deepEqual(await scheduleSlot(store, '4662244000099999999', false), { status: 'error', message: 'Record not found.' });
  assert.equal((await scheduleSlot(store, 'abc', false)).status, 'error');
});

test('guards: a finished job is blocked, Pick Up is skipped, a Flagged exception blocks the automatic run only', async () => {
  await team('A');
  for (const Appointment_Status of ['Completed', 'Failed']) assert.equal((await scheduleSlot(store, await sa({ Appointment_Status }), false)).status, 'blocked');
  assert.equal((await scheduleSlot(store, await sa({ Type_of_Delivery: 'Pick Up' }), true)).status, 'skipped');
  const flagged = await sa({ Exception_Status: 'Flagged', Exception_Reason: 'Calendar Full' });
  const auto = await scheduleSlot(store, flagged, false);
  assert.equal(auto.status, 'blocked');
  assert.equal((await read(flagged)).Exception_Status, 'Flagged');
  const manual = await scheduleSlot(store, flagged, true);
  assert.equal(manual.status, 'success');
  assert.equal((await read(flagged)).Exception_Status, 'Resolved');
});

test('a free team today: the suggestion, the default length, and the fields the script writes', async () => {
  await team('A', { Vehicle: 'Hino (NBX-1446)', Start_Time1: '09:00:00 AM' });
  const id = await sa();
  const out = await scheduleSlot(store, id, true);
  assert.deepEqual(out, { status: 'success', message: `Suggested: A / A-driver - ${inDays(0)} 9:00 AM`, date: inDays(0), time: '9:00 AM', installer: 'A' });
  const r = await read(id);
  assert.equal(r.Suggested_Schedule_Date, inDays(0));
  assert.equal(r.Suggested_Time_Slot, '09:00:00 AM');
  assert.equal(r.Installer, 'A');
  assert.equal(r.Assigned_to_Driver, 'A-driver');
  assert.equal(r.Fleet_Assignment, 'Hino (NBX-1446)');
  assert.equal(String(r.Estimated_Duration), '2');
  assert.equal(r.Appointment_Status, 'Queued');
  assert.equal(r.Calendar_Entry_Created, false);
  assert.equal(r.Installation_Required, false);
  assert.equal(r.Original_System_Suggestion, `System suggested: A / A-driver on ${inDays(0)} (Hino (NBX-1446))`);
});

test('no vehicle on the team means "Own Fleet"; an installation job needs installation and defaults to 4 hours', async () => {
  await team('A');
  const id = await sa({ Type_of_Delivery: 'Delivery and Installation' });
  await scheduleSlot(store, id, true);
  const r = await read(id);
  assert.equal(r.Fleet_Assignment, 'Own Fleet');
  assert.equal(r.Installation_Required, true);
  assert.equal(String(r.Estimated_Duration), '4');
});

test('the start time moves by the hours the team already has that day, with the 15% traffic buffer', async () => {
  await team('A');
  await job('A', 2);
  const out = await scheduleSlot(store, await sa(), true);
  assert.equal(out.time, '10:18 AM');
});

test('a team that does not have the room is skipped, then the next day is tried', async () => {
  await team('A', { Max_Capacity_Hours: 3 });
  await job('A', 2);
  await team('A', { Availability_Date: inDays(1), Max_Capacity_Hours: 3 });
  const out = await scheduleSlot(store, await sa({ Estimated_Duration: 2 }), true);
  assert.equal(out.date, inDays(1));
});

test('a team marked Not Available is ignored, and a future Requested_Delivery_Date starts the search later', async () => {
  await team('A', { Availability_Status: 'Not Available' });
  await team('B', { Availability_Date: inDays(1) });
  await team('B', { Availability_Date: inDays(3) });
  assert.equal((await scheduleSlot(store, await sa(), true)).date, inDays(1));
  assert.equal((await scheduleSlot(store, await sa({ Requested_Delivery_Date: inDays(2) }), true)).date, inDays(3));
  assert.equal((await scheduleSlot(store, await sa({ Requested_Delivery_Date: inDays(-5) }), true)).date, inDays(1));
});

test('the team with the most hours left wins, and a tie goes to the team with fewer jobs', async () => {
  await team('A', { Max_Capacity_Hours: 6 });
  await team('B', { Max_Capacity_Hours: 8 });
  assert.equal((await scheduleSlot(store, await sa(), true)).installer, 'B');
  await db.query('DELETE FROM "Daily_Team_Availability"');
  await db.query('DELETE FROM "Service_Appointment_Form"'); // the first run left B's own suggestion behind
  await team('A');
  await team('B');
  await job('A', 0); // A has a job of no length: same hours left as B, but one more job
  assert.equal((await scheduleSlot(store, await sa(), true)).installer, 'B');
});

test('fixed (the owner confirmed it was a bug): a team is charged only for its own suggested jobs, so the team with an empty day is preferred', async () => {
  await team('A');
  await team('B');
  await sa({ Sales_Order: 'SO-other', Installer: 'A', Suggested_Schedule_Date: inDays(0), Estimated_Duration: 2 });
  const out = await scheduleSlot(store, await sa(), true);
  // In Zoho both teams were charged 2.30 hours and the tie went to A. Here B, with nothing on Monday, is picked from 8:00 AM.
  assert.equal(out.installer, 'B');
  assert.equal(out.time, '8:00 AM');
});

test('the own suggested jobs of a team count against it; a Failed one and the record itself do not', async () => {
  await team('A');
  await sa({ Sales_Order: 'SO-own', Installer: 'A', Suggested_Schedule_Date: inDays(0), Estimated_Duration: 2 });
  await sa({ Sales_Order: 'SO-failed', Installer: 'A', Suggested_Schedule_Date: inDays(0), Estimated_Duration: 5, Appointment_Status: 'Failed' });
  const me = await sa({ Installer: 'A', Suggested_Schedule_Date: inDays(0), Estimated_Duration: 2 });
  const out = await scheduleSlot(store, me, true);
  assert.equal(out.time, '10:18 AM'); // only SO-own (2.30 hours) is charged
});

test('a team at its SO count limit is skipped even with time left', async () => {
  await team('A', { Max_SO_Capacity: 1 });
  await job('A', 1);
  await team('A', { Availability_Date: inDays(1), Max_SO_Capacity: 1 });
  assert.equal((await scheduleSlot(store, await sa(), true)).date, inDays(1));
});

test('a blank or zero capacity falls back to the length of the working day from the policies', async () => {
  await policy('workday_start_time', '8:00 AM');
  await policy('workday_end_time', '12:00 PM'); // 4 hours
  await team('A', { Max_Capacity_Hours: 0 });
  await team('A', { Availability_Date: inDays(1), Max_Capacity_Hours: 0 });
  const id = await sa({ Type_of_Delivery: 'Delivery and Installation' }); // 4 x 1.15 = 4.60 hours: does not fit in 4
  assert.equal((await scheduleSlot(store, id, true)).status, 'flagged');
});

test('Calendar Full: nothing in the window flags the record, clears the old suggestion and raises one exception (not two)', async () => {
  const id = await sa({ Suggested_Schedule_Date: inDays(4), Suggested_Time_Slot: '08:00:00 AM', Installer: 'Old', Assigned_to_Driver: 'Old', Fleet_Assignment: 'Old' });
  const out = await scheduleSlot(store, id, true);
  assert.deepEqual(out, { status: 'flagged', message: 'Calendar Full - walang available na team sa loob ng 14 araw.' });
  const r = await read(id);
  assert.equal(r.Exception_Status, 'Flagged');
  assert.equal(r.Exception_Reason, 'Calendar Full');
  assert.deepEqual([r.Suggested_Schedule_Date, r.Suggested_Time_Slot, r.Installer, r.Assigned_to_Driver, r.Fleet_Assignment], ['', '', '', '', '']);
  await scheduleSlot(store, id, true);
  const rows = await exceptions();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].Exception_Stage, rows[0].Exception_Reason, rows[0].Severity, rows[0].Raised_By, rows[0].Status, rows[0].Customer_Name], ['Scheduling', 'Calendar Full', 'Medium', 'System', 'Open', 'Maria Santos']);
  assert.equal(String(rows[0].Sales_Order_Reference.ID ?? rows[0].Sales_Order_Reference), id);
});

test('the search window comes from the policy', async () => {
  await policy('max_days_scheduling_window', '2');
  await team('A', { Availability_Date: inDays(2) });
  const out = await scheduleSlot(store, await sa(), true);
  assert.match(out.message, /walang available na team sa loob ng 2 araw/);
});

test('Overtime Declined: a slot that would run past the working day is flagged, not suggested', async () => {
  await team('A', { Max_Capacity_Hours: 12 });
  await job('A', 4); // 4.60 used
  const id = await sa({ Type_of_Delivery: 'With Installation' }); // 4.60 more = 9.20 > 9
  const out = await scheduleSlot(store, id, true);
  assert.equal(out.status, 'flagged');
  assert.match(out.message, /^Slot Pushed — Overtime Declined - walang available/);
  assert.equal((await read(id)).Exception_Reason, 'Slot Pushed — Overtime Declined');
});

test('Multi-Day Install needs manual planning: flagged at once, with one exception', async () => {
  await team('A');
  const id = await sa({ Type_of_Delivery: 'Multi-Day Install' });
  assert.deepEqual(await scheduleSlot(store, id, false), { status: 'flagged', message: 'Multi-Day Install - kailangan ng manual planning.' });
  assert.equal((await read(id)).Exception_Reason, 'Requires Manual Planning');
  await scheduleSlot(store, id, true); // re-run resolves the flag, then flags it again
  assert.equal((await exceptions()).length, 1);
});

test('Full-Day Install takes the whole 8 hours: only a team with an empty day can have it', async () => {
  await team('A');
  await job('A', 1);
  await team('A', { Availability_Date: inDays(1) });
  const out = await scheduleSlot(store, await sa({ Type_of_Delivery: 'Full-Day Install' }), true);
  assert.equal(out.date, inDays(1));
});

test('Priority: confirms itself, writes the calendar summary, and the traffic buffer comes from the policy', async () => {
  await policy('traffic_buffer_percent', '50');
  await team('A', { Vehicle: 'Hino', Start_Time1: '08:00:00 AM' });
  const id = await sa({ Priority: true, Customer_Address: '1 Main St', City: 'Quezon City' });
  const out = await scheduleSlot(store, id, true);
  assert.equal(out.status, 'success');
  const r = await read(id);
  assert.equal(r.Confirmed_Schedule_Date, inDays(0));
  assert.equal(r.Confirmed_Time_Slot, '08:00:00 AM');
  assert.equal(r.Calendar_Entry_Created, true);
  assert.equal(r.Appointment_Status, 'Scheduled');
  assert.equal(r.Calendar_Event_Summary, `Title: SO-1 - Maria Santos | Date: ${inDays(0)} | Time: 8:00 AM (3.00 hrs) | Team: A / A-driver | Fleet: Hino | Type: Delivery Only | Location: 1 Main St, Quezon City | Notes: Auto-confirmed (Priority)`);
});

test('a job that is not Priority stays a suggestion: the officer confirms it', async () => {
  await team('A');
  const id = await sa();
  await scheduleSlot(store, id, true);
  const r = await read(id);
  assert.equal(r.Confirmed_Schedule_Date, '');
  assert.equal(r.Appointment_Status, 'Queued');
});

test('the custom API dms_reschedule runs the engine as a re-run and answers what the widgets read', async () => {
  await team('A');
  const id = await sa({ Exception_Status: 'Flagged' });
  const out = await customApis.dms_reschedule({ recordId: id }, store, { user: 'tester' });
  assert.equal(out.status, 'success');
  assert.equal(out.installer, 'A');
  assert.equal(out.date, inDays(0));
  assert.equal(customApis.dms_reschedule.notPorted, undefined);
});
