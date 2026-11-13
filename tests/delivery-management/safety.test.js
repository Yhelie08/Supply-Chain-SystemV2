// Two safety rules the owner asked for (2026-11-13): a request is confirmed ONCE (a double click used to make two
// appointments), and two people working on the same day's schedule at the same moment cannot both take the same room.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { customApis } from '../../server/modules/index.mjs';
import { scheduleSlot } from '../../server/modules/delivery-management/scheduling.mjs';
import { withLock } from '../../server/modules/delivery-management/locks.mjs';
import { ymd, todayDate } from '../../server/workflows/deluge.mjs';

const SA = 'Service_Appointment_Form';
const REQ = 'DMS_Schedule_Request';
const today = ymd(todayDate());
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, REQ, 'Daily_Team_Availability', 'DMS_Exception_Queue', 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const request = (extra = {}) => raw.addRecord(REQ, { CMS_Schedule_Request_ID: 'CMS-1', Sales_Order_Number: 'SO-1', Customer_Name: 'Maria Santos', Requested_Date: today, Status: 'Pending Review', ...extra });
const confirm = (id) => customApis.confirm_dms_schedule_request({ dmsRecordId: id }, raw);

test('confirm once: the second confirm of the same request is refused and makes no second appointment', async () => {
  const id = await request();
  const first = await confirm(id);
  assert.equal(first.status, 'success');
  const second = await confirm(id);
  assert.equal(second.status, 'error');
  assert.equal(second.message, `Already confirmed — Service Appointment ${first.serviceAppointmentId} was already created.`);
  assert.equal((await raw.find(SA)).length, 1);
});

test('confirm once: two clicks at the same moment make exactly one appointment', async () => {
  const id = await request();
  const results = await Promise.all([confirm(id), confirm(id), confirm(id)]);
  assert.equal(results.filter((r) => r.status === 'success').length, 1);
  assert.equal(results.filter((r) => r.status === 'error').length, 2);
  assert.equal((await raw.find(SA)).length, 1);
});

test('confirm once: a request that already has its appointment is refused even if its status was not updated', async () => {
  const id = await request({ Service_Appointment_Record_ID: '4662244000099999999' });
  const out = await confirm(id);
  assert.equal(out.status, 'error');
  assert.match(out.message, /Already confirmed/);
  assert.equal((await raw.find(SA)).length, 0);
});

test('confirm once: different requests do not wait for each other and both confirm', async () => {
  const a = await request({ CMS_Schedule_Request_ID: 'CMS-A', Sales_Order_Number: 'SO-A' });
  const b = await request({ CMS_Schedule_Request_ID: 'CMS-B', Sales_Order_Number: 'SO-B' });
  const results = await Promise.all([confirm(a), confirm(b)]);
  assert.deepEqual(results.map((r) => r.status), ['success', 'success']);
  assert.equal((await raw.find(SA)).length, 2);
});

test('declining is unchanged: a declined request can still be declined again without an error', async () => {
  const id = await request();
  assert.equal((await customApis.decline_dms_schedule_request({ dmsRecordId: id }, raw)).status, 'success');
});

// ----- the schedule -----
const team = () => raw.addRecord('Daily_Team_Availability', { Availability_Date: today, Installer: 'CJ', Driver: 'Judy', Availability_Status: 'Full Day', Max_Capacity_Hours: 8 });
const job = (so, extra = {}) => raw.addRecord(SA, { Sales_Order: so, Type_of_Delivery: 'Delivery Only', Customer_Name: { first_name: 'Test', last_name: so }, Appointment_Status: 'Queued', Estimated_Duration: 4, ...extra });
const read = (id) => raw.getRecordById(SA, id, { raw: true });

test('two dispatchers confirming at the same moment: the second one sees the first and gets a Calendar Conflict', async () => {
  await team();
  const mine = { Installer: 'CJ', Suggested_Schedule_Date: today, Suggested_Time_Slot: '08:00:00 AM' };
  const a = await job('SO-A', mine);
  const b = await job('SO-B', mine);
  // two 4-hour jobs are 4.60 + 4.60 = 9.20 hours: more than the 8-hour day
  const confirmIt = (id) => store.updateRecord(SA, id, { Confirmed_Schedule_Date: today, Confirmed_Time_Slot: '08:00:00 AM' }, { byForm: true });
  await Promise.all([confirmIt(a), confirmIt(b)]);
  const [ra, rb] = [await read(a), await read(b)];
  const scheduled = [ra, rb].filter((r) => r.Appointment_Status === 'Scheduled');
  const blocked = [ra, rb].filter((r) => r.Exception_Reason === 'Calendar Conflict');
  assert.equal(scheduled.length, 1);
  assert.equal(blocked.length, 1);
  assert.equal((await raw.find('DMS_Exception_Queue')).length, 1);
});

test('two Re-Schedule clicks at the same moment do not give both jobs the same start time', async () => {
  await team();
  const a = await job('SO-C', { Estimated_Duration: 3 });
  const b = await job('SO-D', { Estimated_Duration: 3 });
  const [ra, rb] = await Promise.all([scheduleSlot(raw, a, true), scheduleSlot(raw, b, true)]);
  assert.equal(ra.status, 'success');
  assert.equal(rb.status, 'success');
  assert.notEqual(ra.time, rb.time);
});

// ----- the queue itself -----
test('the queue runs work with the same key one after the other, and a failure does not block the next', async () => {
  const order = [];
  const slow = withLock('k', async () => { order.push('a-start'); await new Promise((r) => setTimeout(r, 30)); order.push('a-end'); });
  const fails = withLock('k', async () => { order.push('b'); throw new Error('boom'); });
  const after = withLock('k', async () => { order.push('c'); return 'ok'; });
  await slow;
  await assert.rejects(fails, /boom/);
  assert.equal(await after, 'ok');
  assert.deepEqual(order, ['a-start', 'a-end', 'b', 'c']);
});

test('work with different keys does not wait for each other', async () => {
  const order = [];
  const slow = withLock('x', async () => { await new Promise((r) => setTimeout(r, 40)); order.push('slow'); });
  const fast = withLock('y', async () => { order.push('fast'); });
  await Promise.all([slow, fast]);
  assert.deepEqual(order, ['fast', 'slow']);
});
