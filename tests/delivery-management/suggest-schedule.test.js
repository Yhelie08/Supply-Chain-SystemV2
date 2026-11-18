// Suggesting a schedule (spec v1.4, Delivery 02 §3): server/modules/delivery-management/suggest-schedule.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { suggestSchedule } from '../../server/modules/delivery-management/suggest-schedule.mjs';
import { ymd, addDays, todayDate } from '../../server/workflows/deluge.mjs';

const SA = 'Service_Appointment_Form';
const AQ = 'Approval_Queue';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SA, AQ, 'Daily_Team_Availability', 'Schedule_Holds', 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const team = (installer, date, extra = {}) => raw.addRecord('Daily_Team_Availability', { Availability_Date: date, Installer: installer, Driver: `${installer}-driver`, Availability_Status: 'Full Day', Max_Capacity_Hours: 8, ...extra });
const tomorrow = () => ymd(addDays(todayDate(), 1));
const inDays = (n) => ymd(addDays(todayDate(), n));

test('Pick Up needs no team, so there is nothing to suggest', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-PU', Type_of_Delivery: 'Pick Up' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'no_team_needed');
});

test('a normal drop-off within the wait window is just suggested, no approval item', async () => {
  await team('A', tomorrow());
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', City: 'Pasig' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'suggested');
  assert.equal(r.date, tomorrow());
  assert.equal(r.installer, 'A');
  assert.equal((await raw.find(AQ)).length, 0);
});

test('city tie-break: a team already going to the same city is preferred over one with more raw capacity', async () => {
  await team('A', tomorrow(), { Max_Capacity_Hours: 8 }); // no other jobs: full 8h free
  await team('B', tomorrow(), { Max_Capacity_Hours: 8 });
  await raw.addRecord(SA, { Sales_Order: 'SO-OTHER', Installer: 'B', City: 'Pasig', Confirmed_Schedule_Date: tomorrow(), Estimated_Duration: 2, Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled' });
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', City: 'Pasig' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'suggested');
  assert.equal(r.installer, 'B', 'B is already going to Pasig, even though A has more free hours');
});

test('a drop-off whose own-team slot is past its target gets a "Book third party" approval item', async () => {
  await team('A', inDays(5));
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Requested_Delivery_Date: inDays(2) });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'third_party_suggested');
  assert.equal(r.date, inDays(5));
  const [item] = await raw.find(AQ);
  assert.equal(item.Kind, 'third_party_booking');
  assert.equal(item.Status, 'pending');
  assert.deepEqual(JSON.parse(item.Options), ['Book third party', `Keep own team on ${inDays(5)}`]);
  const again = await suggestSchedule(raw, id); // AQ-1/AQ-2: does not duplicate the pending item
  assert.equal(again.approvalId, r.approvalId);
  assert.equal((await raw.find(AQ)).length, 1);
});

test('a drop-off past dropoff_max_wait_days (default 2) is also sent to third party, even with no target set', async () => {
  await team('A', inDays(5));
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'third_party_suggested');
});

test('an installation is NEVER sent to a third party, even far past the drop-off wait window', async () => {
  await team('A', inDays(5));
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'suggested');
  assert.equal(r.date, inDays(5));
  assert.equal((await raw.find(AQ)).length, 0);
});

test('an installation with no team-day anywhere in the window escalates to the supervisor', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'escalated');
  const [item] = await raw.find(AQ);
  assert.equal(item.Kind, 'schedule_shortfall');
  assert.deepEqual(JSON.parse(item.Options), ['Add a team-day (overtime, extra installer)', 'Tell the customer (proposed new date)']);
  const again = await suggestSchedule(raw, id);
  assert.equal((await raw.find(AQ)).length, 1, 'a second call does not duplicate the pending escalation');
  assert.equal(again.approvalId, r.approvalId);
});

test('a drop-off with no team-day anywhere just reports no_slot — it never escalates (that is installation-only)', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  const r = await suggestSchedule(raw, id);
  assert.equal(r.status, 'no_slot');
  assert.equal((await raw.find(AQ)).length, 0);
});
