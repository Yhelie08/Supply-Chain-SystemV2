// Delivery Management, D1: the small workflows (server/modules/delivery-management/{service-appointment,field-work,
// delivery-scheduling}.mjs), run on PGlite. Tests marked "mirrors Zoho" follow the Deluge script; they are to be
// confirmed against Zoho Development.
import { test, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { ZohoError } from '../../server/criteria.mjs';

const FORMS = ['Service_Appointment_Form', 'Field_Work', 'Delivery_Scheduling', 'Daily_Team_Availability'];
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

const refused = (promise, message) => assert.rejects(promise, (e) => e instanceof ZohoError && e.code === 2001 && message.test(e.message));
const read = (form, id) => raw.getRecordById(form, id, { raw: true });

// ----- Service_Appointment_Form -----
const SA = 'Service_Appointment_Form';
const sa = (extra = {}) => ({
  Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only',
  Suggested_Schedule_Date: '2026-09-17', Confirmed_Schedule_Date: '2026-09-17',
  Suggested_Time_Slot: '08:00:00 AM', Confirmed_Time_Slot: '08:00:00 AM', ...extra,
});

test('site confirmation: a confirmed site needs the method and the notes', async () => {
  await refused(store.addRecord(SA, sa({ Site_Confirmation_Status: 'Confirmed' })), /Confirmation Method is required/);
  await refused(store.addRecord(SA, sa({ Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call' })), /Site Confirmation Notes is required/);
  const id = await store.addRecord(SA, sa({ Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'Gate open' }));
  assert.equal((await read(SA, id)).Site_Confirmation_Status, 'Confirmed');
});

test('site confirmation: other statuses need neither, and a blank "" counts as missing', async () => {
  await store.addRecord(SA, sa({ Site_Confirmation_Status: 'Pending', Confirmation_Method: '', Site_Confirmation_Notes: '' }));
  await refused(store.addRecord(SA, sa({ Site_Confirmation_Status: 'Confirmed', Confirmation_Method: '', Site_Confirmation_Notes: 'x' })), /Confirmation Method is required/);
});

test('mirrors Zoho: when the site check and the override check would both refuse, the site check message wins', async () => {
  await refused(store.addRecord(SA, sa({ Site_Confirmation_Status: 'Confirmed', Confirmed_Schedule_Date: '2026-09-18' })), /Confirmation Method is required/);
});

test('override: a date or slot other than the suggestion needs Override By and Override Reason', async () => {
  await refused(store.addRecord(SA, sa({ Confirmed_Schedule_Date: '2026-09-18' })), /Override By is required/);
  await refused(store.addRecord(SA, sa({ Confirmed_Schedule_Date: '2026-09-18', Override_By: 'Maria' })), /Override Reason is required/);
  await refused(store.addRecord(SA, sa({ Confirmed_Time_Slot: '09:00:00 AM' })), /Override By is required/);
  const id = await store.addRecord(SA, sa({ Confirmed_Schedule_Date: '2026-09-18', Override_By: 'Maria', Override_Reason: 'Customer asked' }));
  assert.equal((await read(SA, id)).Override_By, 'Maria');
});

test('override: no mismatch when the confirmed values equal the suggestion, or both are blank', async () => {
  await store.addRecord(SA, sa());
  await store.addRecord(SA, { Sales_Order: 'SO-2', Suggested_Schedule_Date: '', Confirmed_Schedule_Date: '', Suggested_Time_Slot: '', Confirmed_Time_Slot: '' });
  await store.addRecord(SA, { Sales_Order: 'SO-3' });
});

test('override: an appointment that only has a suggestion (nothing confirmed) can be saved and edited freely', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-9', Suggested_Schedule_Date: '2026-09-17', Suggested_Time_Slot: '08:00:00 AM' });
  await store.updateRecord(SA, id, { Estimated_Duration: 3 }, { byForm: true });
  await refused(store.updateRecord(SA, id, { Confirmed_Time_Slot: '09:00:00 AM' }, { byForm: true }), /Override By is required/);
});

test('override: a confirmed date with no suggestion is a mismatch', async () => {
  await refused(store.addRecord(SA, { Sales_Order: 'SO-4', Confirmed_Schedule_Date: '2026-09-18' }), /Override By is required/);
});

test('override: exempt for Pick Up and for 3rd Party fleet, and once a calendar entry exists', async () => {
  const off = { Confirmed_Schedule_Date: '2026-09-18' };
  await store.addRecord(SA, sa({ ...off, Type_of_Delivery: 'Pick Up' }));
  await store.addRecord(SA, sa({ ...off, Fleet_Decision: '3rd Party' }));
  await store.addRecord(SA, sa({ ...off, Calendar_Entry_Created: 'true' }));
  await refused(store.addRecord(SA, sa({ ...off, Calendar_Entry_Created: 'false' })), /Override By is required/);
});

test('an edit sends only the changed fields: the rules see the saved record plus the change', async () => {
  // saved without the hooks: through the hooks the scheduling engine would already have written the calendar entry
  // (see scheduling-engine.test.js), and with a calendar entry the override check no longer applies
  const id = await raw.addRecord(SA, sa({ Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'ok' }));
  await refused(store.updateRecord(SA, id, { Confirmed_Time_Slot: '09:00:00 AM' }, { byForm: true }), /Override By is required/);
  await store.updateRecord(SA, id, { Confirmed_Time_Slot: '09:00:00 AM', Override_By: 'Maria', Override_Reason: 'Truck delay' }, { byForm: true });
  assert.equal((await read(SA, id)).Confirmed_Time_Slot, '09:00:00 AM');
  // changing an unrelated field later does not trip over the saved override
  await store.updateRecord(SA, id, { Site_Confirmation_Notes: 'ok, gate code 1234' }, { byForm: true });
  await refused(store.updateRecord(SA, id, { Confirmation_Method: '' }, { byForm: true }), /Confirmation Method is required/);
});

test('sales order display: follows Sales_Order on add and on edit, and a blank Sales_Order leaves it alone', async () => {
  const id = await store.addRecord(SA, sa({ Sales_Order: 'SO-10' }));
  assert.equal((await read(SA, id)).Sales_Order_Display, 'SO-10');
  await store.updateRecord(SA, id, { Sales_Order: 'SO-11' }, { byForm: true });
  assert.equal((await read(SA, id)).Sales_Order_Display, 'SO-11');
  await store.updateRecord(SA, id, { Sales_Order: '' }, { byForm: true });
  assert.equal((await read(SA, id)).Sales_Order_Display, 'SO-11');
});

// ----- Field_Work -----
const FW = 'Field_Work';

test('field work: Reschedule Requested needs a reason', async () => {
  await refused(store.addRecord(FW, { Status: 'Reschedule Requested' }), /Reschedule Reason is required/);
  await refused(store.addRecord(FW, { Status: 'Reschedule Requested', Reschedule_Reason: '' }), /Reschedule Reason is required/);
  const id = await store.addRecord(FW, { Status: 'Reschedule Requested', Reschedule_Reason: 'Site closed' });
  assert.equal((await read(FW, id)).Reschedule_Reason, 'Site closed');
});

test('field work: other statuses save with a blank reason (the Deluge "|| Reschedule_Reason == \\"\\"" part would refuse them, but never fires in Zoho because a blank is null there)', async () => {
  for (const Status of ['Started', 'Completed', 'Scheduled']) {
    const id = await store.addRecord(FW, { Status, Reschedule_Reason: '' });
    await store.updateRecord(FW, id, { Status }, { byForm: true });
  }
});

test('field work: an edit to Reschedule Requested is checked against the saved reason', async () => {
  const id = await store.addRecord(FW, { Status: 'Started', Reschedule_Reason: '' });
  await refused(store.updateRecord(FW, id, { Status: 'Reschedule Requested' }, { byForm: true }), /Reschedule Reason is required/);
  await store.updateRecord(FW, id, { Status: 'Reschedule Requested', Reschedule_Reason: 'Rain' }, { byForm: true });
  await store.updateRecord(FW, id, { Status: 'Completed' }, { byForm: true });
});

// ----- Delivery_Scheduling -----
const DS = 'Delivery_Scheduling';

test('team capacity: warns (log only) about installers with no availability that day, and never refuses the save', async () => {
  await raw.addRecord('Daily_Team_Availability', { Availability_Date: '2026-09-17', Installer: 'CJ', Availability_Status: 'Full Day' });
  await raw.addRecord('Daily_Team_Availability', { Availability_Date: '2026-09-17', Installer: 'Edmon', Availability_Status: 'Not Available' });
  const warn = mock.method(console, 'warn', () => {});
  try {
    await store.addRecord(DS, { Date_field: '2026-09-17', Installer: ['CJ'] });
    assert.equal(warn.mock.callCount(), 0);
    const id = await store.addRecord(DS, { Date_field: '2026-09-17', Installer: ['CJ', 'Edmon', 'Cinco'] });
    assert.equal(warn.mock.callCount(), 1);
    assert.match(String(warn.mock.calls[0].arguments[0]), /Edmon, Cinco on 2026-09-17/);
    assert.ok(id);
    await store.addRecord(DS, { Installer: ['Cinco'] });
    await store.addRecord(DS, { Date_field: '2026-09-17' });
    assert.equal(warn.mock.callCount(), 1);
  } finally { warn.mock.restore(); }
});
