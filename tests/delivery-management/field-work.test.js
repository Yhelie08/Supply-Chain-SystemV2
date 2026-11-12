// Delivery Management, D3b and D3c: FW_Reschedule_To_Exceptio and FW_Completion_Schedule_Sy
// (server/modules/delivery-management/field-work.mjs), run on PGlite with the hooked store. Tests marked "mirrors Zoho"
// follow the Deluge scripts literally; they are to be confirmed against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ymd, todayDate, truthy, idOf } from '../../server/workflows/deluge.mjs';
import { parseDateTime } from '../../server/modules/delivery-management/field-work.mjs';

const FW = 'Field_Work';
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
beforeEach(async () => { for (const f of [FW, SA, EXC]) await db.query(`DELETE FROM "${f}"`); });

const customer = { first_name: 'Maria', last_name: 'Santos' };
const appointment = (extra = {}) => raw.addRecord(SA, { Sales_Order: 'SO-1', Customer_Name: customer, Appointment_Status: 'Scheduled', ...extra });
const readSA = (id) => raw.getRecordById(SA, id, { raw: true });
const exceptions = () => raw.find(EXC);

test('date-times are read in the formats Zoho and the widgets use', () => {
  assert.deepEqual(parseDateTime('2026-10-27 09:39:00 AM'), { year: 2026, month: 10, day: 27, hour: 9, minute: 39 });
  assert.deepEqual(parseDateTime('2026-10-27 21:05:00'), { year: 2026, month: 10, day: 27, hour: 21, minute: 5 });
  assert.deepEqual(parseDateTime('27-Oct-2026 12:15:00 AM'), { year: 2026, month: 10, day: 27, hour: 0, minute: 15 });
  assert.deepEqual(parseDateTime('2026-10-27T13:00:00'), { year: 2026, month: 10, day: 27, hour: 13, minute: 0 });
  assert.equal(parseDateTime('soon'), null);
  assert.equal(parseDateTime(''), null);
});

// ----- D3b -----
test('a reschedule request raises one Dispatch exception for the first appointment of that sales order', async () => {
  const first = await appointment();
  await appointment({ Sales_Order: 'SO-1', Customer_Name: { first_name: 'Other', last_name: 'Person' } });
  const id = await store.addRecord(FW, { Sales_Order: 'SO-1', Status: 'Reschedule Requested', Reschedule_Reason: 'Site closed' });
  const rows = await exceptions();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].Exception_Stage, rows[0].Exception_Reason, rows[0].Severity, rows[0].Raised_By, rows[0].Assigned_To, rows[0].Status, rows[0].Customer_Name], ['Dispatch', 'Site closed', 'Medium', 'Officer', 'Delivery Officer', 'Open', 'Maria Santos']);
  assert.equal(idOf(rows[0].Sales_Order_Reference), first);
  assert.ok(truthy((await raw.getRecordById(FW, id, { raw: true })).Reschedule_Processed));
  assert.equal((await readSA(first)).Appointment_Status, 'Scheduled'); // nothing else changes until an officer resolves it
  await store.updateRecord(FW, id, { Reschedule_Reason: 'Changed my mind' }, { byForm: true });
  assert.equal((await exceptions()).length, 1); // processed once
});

test('mirrors Zoho: with no appointment for that sales order nothing is raised, but the request still counts as processed', async () => {
  const id = await store.addRecord(FW, { Sales_Order: 'SO-404', Status: 'Reschedule Requested', Reschedule_Reason: 'x' });
  assert.equal((await exceptions()).length, 0);
  assert.ok(truthy((await raw.getRecordById(FW, id, { raw: true })).Reschedule_Processed));
});

test('other statuses raise nothing', async () => {
  await appointment();
  await store.addRecord(FW, { Sales_Order: 'SO-1', Status: 'Started' });
  assert.equal((await exceptions()).length, 0);
});

// ----- D3c -----
const finished = (extra = {}) => ({ Sales_Order: 'SO-1', Installation_Status: 'Complete', Schedule_Start_Date_and_Time: `${today} 09:00:00 AM`, Schedule_End_Date_and_Time: `${today} 11:30:00 AM`, ...extra });
const team = (extra = {}) => ({ Installer: 'A', Confirmed_Schedule_Date: today, ...extra });

test('a completed installation completes the appointment and adds the actual times to its calendar summary', async () => {
  const sa = await appointment({ ...team(), Confirmed_Time_Slot: '09:00:00 AM', Calendar_Event_Summary: 'Title: SO-1 | Notes: ', Calendar_Entry_Created: true });
  await store.addRecord(FW, finished({ Service_Appointment_ID: sa }));
  const r = await readSA(sa);
  assert.equal(r.Appointment_Status, 'Completed');
  const [y, m, d] = today.split('-');
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1];
  assert.equal(r.Calendar_Event_Summary, `Title: SO-1 | Notes:  | Actual: ${month} ${d}, ${y} 09:00 AM - 11:30 AM`);
});

test('missing times show as "?" in the note', async () => {
  const sa = await appointment({ Calendar_Event_Summary: 'Title' });
  await store.addRecord(FW, finished({ Service_Appointment_ID: sa, Schedule_Start_Date_and_Time: '' }));
  assert.equal((await readSA(sa)).Calendar_Event_Summary, 'Title | Actual: ? - 11:30 AM');
});

test('the team\'s pending suggestions that day now start when the job really ended; confirmed jobs planned earlier are flagged as drift', async () => {
  const done = await appointment({ ...team(), Confirmed_Time_Slot: '09:00:00 AM' });
  const pending = await appointment({ ...team({ Confirmed_Schedule_Date: '' }), Sales_Order: 'SO-2', Suggested_Schedule_Date: today, Suggested_Time_Slot: '10:00:00 AM', Appointment_Status: 'Queued' });
  const late = await appointment({ ...team(), Sales_Order: 'SO-3', Confirmed_Time_Slot: '10:00:00 AM' }); // planned to start before 11:30
  const later = await appointment({ ...team(), Sales_Order: 'SO-4', Confirmed_Time_Slot: '01:00:00 PM' }); // after 11:30: fine
  const otherTeam = await appointment({ Installer: 'B', Confirmed_Schedule_Date: today, Sales_Order: 'SO-5', Confirmed_Time_Slot: '10:00:00 AM' });
  const completed = await appointment({ ...team(), Sales_Order: 'SO-6', Confirmed_Time_Slot: '10:00:00 AM', Appointment_Status: 'Completed' });
  await store.addRecord(FW, finished({ Service_Appointment_ID: done }));

  assert.equal((await readSA(pending)).Suggested_Time_Slot, '11:30:00 AM');
  const flagged = await readSA(late);
  assert.equal(flagged.Exception_Status, 'Flagged');
  assert.equal(flagged.Exception_Reason, 'Schedule Drift — Prior job finished later than planned');
  for (const untouched of [later, otherTeam, completed]) assert.notEqual((await readSA(untouched)).Exception_Status, 'Flagged');
  const rows = await exceptions();
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].Exception_Stage, rows[0].Severity, rows[0].Raised_By, rows[0].Exception_Reason], ['Scheduling', 'Medium', 'System', 'Schedule Drift — Prior job finished later than planned']);
  assert.equal(idOf(rows[0].Sales_Order_Reference), late);
});

test('mirrors Zoho: an appointment of another sales order is flagged High, completion is not applied, and every save raises it again', async () => {
  const sa = await appointment({ Sales_Order: 'SO-OTHER', ...team() });
  const id = await store.addRecord(FW, finished({ Service_Appointment_ID: sa }));
  let r = await readSA(sa);
  assert.equal(r.Appointment_Status, 'Scheduled');
  assert.equal(r.Exception_Status, 'Flagged');
  assert.match(r.Exception_Reason, /^Field Work ID Mismatch/);
  let rows = await exceptions();
  assert.deepEqual([rows.length, rows[0].Exception_Stage, rows[0].Severity], [1, 'Dispatch', 'High']);
  await store.updateRecord(FW, id, { Installation_Status: 'Complete' }, { byForm: true });
  rows = await exceptions();
  assert.equal(rows.length, 2); // the script has no duplicate check here
});

test('nothing happens when it is not Complete, has no end time, no appointment id, or the appointment is already finished', async () => {
  const sa = await appointment(team());
  await store.addRecord(FW, finished({ Service_Appointment_ID: sa, Installation_Status: 'Started' }));
  await store.addRecord(FW, finished({ Service_Appointment_ID: sa, Schedule_End_Date_and_Time: '' }));
  await store.addRecord(FW, finished({ Service_Appointment_ID: '' }));
  assert.equal((await readSA(sa)).Appointment_Status, 'Scheduled');
  const done = await appointment({ ...team(), Appointment_Status: 'Failed', Calendar_Event_Summary: 'x' });
  await store.addRecord(FW, finished({ Service_Appointment_ID: done }));
  assert.equal((await readSA(done)).Calendar_Event_Summary, 'x');
});
