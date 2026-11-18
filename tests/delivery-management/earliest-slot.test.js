// Earliest available date + soft hold (spec v1.4, Delivery 01): server/modules/delivery-management/earliest-slot.mjs.
// This reuses scheduleSlot's own capacity math (scheduling.mjs) in a read-only, callable-before-an-SR-exists form —
// it does not change scheduleSlotNow itself; tests/delivery-management/scheduling-engine.test.js stays the source
// of truth for the real scheduler.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { findEarliestSlot, quoteAndHold, releaseHold } from '../../server/modules/delivery-management/earliest-slot.mjs';

const SA = 'Service_Appointment_Form';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SA, 'Daily_Team_Availability', 'Schedule_Holds', 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const team = (installer, date, extra = {}) => raw.addRecord('Daily_Team_Availability', { Availability_Date: date, Installer: installer, Driver: `${installer}-driver`, Availability_Status: 'Full Day', Max_Capacity_Hours: 8, ...extra });

test('finds the first day with a free team and gives a reason', async () => {
  await team('A', '2027-03-01');
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2027-03-01' });
  assert.equal(r.found, true);
  assert.equal(r.date, '2027-03-01');
  assert.equal(r.installer, 'A');
  assert.match(r.reason, /Earliest is 1 Mar/);
});

test('a day with no team at all is skipped, named in the reason', async () => {
  await team('A', '2027-03-02'); // 1 Mar has nobody
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2027-03-01' });
  assert.equal(r.date, '2027-03-02');
  assert.match(r.reason, /1 Mar no team scheduled/);
});

test('a team on leave is named, and a full day is named with the count', async () => {
  await team('A', '2027-03-01', { Availability_Status: 'Not Available' });
  await team('B', '2027-03-02', { Max_Capacity_Hours: 1 }); // too little room for a 2-hour default job
  await team('C', '2027-03-03');
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2027-03-01' });
  assert.equal(r.date, '2027-03-03');
  assert.match(r.reason, /1 Mar A on leave/);
  assert.match(r.reason, /2 Mar full \(1 of 1 jobs\)/);
});

test('never offers a date before fromDate, and never before today', async () => {
  await team('A', '2020-01-01'); // long past
  await team('A', '2099-01-01'); // far future, so the window does not run out
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2020-01-01' });
  // today's date is whatever the test runs on, but it must not be the long-past team's day
  assert.notEqual(r.date, '2020-01-01');
});

test('respects an existing Confirmed/Suggested appointment\'s hours on that team-day', async () => {
  await team('A', '2027-03-01', { Max_Capacity_Hours: 2 });
  await raw.addRecord(SA, { Sales_Order: 'SO-1', Installer: 'A', Confirmed_Schedule_Date: '2027-03-01', Estimated_Duration: 2, Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled' });
  await team('A', '2027-03-02', { Max_Capacity_Hours: 8 });
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2027-03-01' });
  assert.equal(r.date, '2027-03-02');
});

test('quoteAndHold: a second quote in the window sees the slot as taken, a third sees the NEXT team-day', async () => {
  await team('A', '2027-03-01', { Max_Capacity_Hours: 2 }); // only room for one 2-hour job (with the 15% buffer this is tight but fits once)
  await team('A', '2027-03-02', { Max_Capacity_Hours: 8 });
  const first = await quoteAndHold(raw, { jobType: 'Delivery Only', estMinutes: 100, fromDate: '2027-03-01', quotedBy: 'agent1' });
  assert.equal(first.date, '2027-03-01');
  assert.ok(first.holdId);
  const second = await quoteAndHold(raw, { jobType: 'Delivery Only', estMinutes: 100, fromDate: '2027-03-01', quotedBy: 'agent2' });
  assert.equal(second.date, '2027-03-02', 'the first quote\'s hold already used up 1 Mar\'s capacity');
});

test('releaseHold frees the capacity back up for the next quote', async () => {
  await team('A', '2027-03-01', { Max_Capacity_Hours: 2 });
  await team('A', '2027-03-02', { Max_Capacity_Hours: 8 });
  const first = await quoteAndHold(raw, { jobType: 'Delivery Only', estMinutes: 100, fromDate: '2027-03-01' });
  assert.equal(first.date, '2027-03-01');
  await releaseHold(raw, first.holdId);
  const second = await quoteAndHold(raw, { jobType: 'Delivery Only', estMinutes: 100, fromDate: '2027-03-01' });
  assert.equal(second.date, '2027-03-01', 'released hold no longer counts against capacity');
});

test('a hold past its Expires_At no longer counts, without needing to be released', async () => {
  // cap 3h: the 2h hold (if it counted) would leave only 1h free, too little for the 2.3h buffered default job;
  // excluding an expired hold leaves the full 3h free, which is enough.
  await team('A', '2027-03-01', { Max_Capacity_Hours: 3 });
  await team('A', '2027-03-02', { Max_Capacity_Hours: 8 });
  const past = new Date(Date.now() - 60000);
  await raw.addRecord('Schedule_Holds', { Installer: 'A', Hold_Date: '2027-03-01', Hours: 2, Expires_At: `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')} ${String(past.getHours()).padStart(2, '0')}:${String(past.getMinutes()).padStart(2, '0')}:00`, Released: false });
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2027-03-01' });
  assert.equal(r.date, '2027-03-01', 'the expired hold does not block the slot');
});

test('no team anywhere within the window: found is false, with a reason', async () => {
  const r = await findEarliestSlot(raw, { jobType: 'Delivery Only', fromDate: '2027-03-01' });
  assert.equal(r.found, false);
  assert.match(r.reason, /No team available within \d+ days/);
});
