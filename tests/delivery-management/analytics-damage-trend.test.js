// Delivery Analytics #3 (damage rate by category) and the backlog weekly trend:
// server/modules/delivery-management/damage-by-category.mjs and backlog-calculator.mjs's getBacklogTrend.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { getDamageByCategory, damageRate } from '../../server/modules/delivery-management/damage-by-category.mjs';
import { getBacklogTrend } from '../../server/modules/delivery-management/backlog-calculator.mjs';

const SA = 'Service_Appointment_Form';
const RET = 'Sales_Returns_Form';
const ITEMS = 'Items';
const TEAMS = 'Daily_Team_Availability';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SA, RET, ITEMS, TEAMS, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

const NOW = new Date(2026, 10, 19, 12, 0, 0); // 2026-11-19 noon
const stamp = (table, id, col, value) => db.query(`UPDATE "${table}" SET "${col}" = $1 WHERE "ID"::text = $2`, [value, String(id)]);

async function item(sku, category) { await raw.addRecord(ITEMS, { SKU: sku, item_name: sku, category }); }
async function job(fields, lines, doneAt) {
  const id = await raw.addRecord(SA, { Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Completed', Item_Details: lines, Job_Done_At: doneAt, ...fields });
  return id;
}

test('damageRate: percent with one decimal, blank when nothing was handled', () => {
  assert.equal(damageRate(1, 8), 12.5);
  assert.equal(damageRate(0, 5), 0);
  assert.equal(damageRate(3, 0), null);
});

test('handled quantity comes from finished delivery jobs by category; a damaged_in_transit job counts all its lines as damaged', async () => {
  await item('LAMP-1', 'Lamps'); await item('FAN-1', 'Fans');
  await job({}, [{ SKU: 'LAMP-1', Quantity: 8 }, { SKU: 'FAN-1', Quantity: 2 }], '2026-11-10 10:00:00 AM');
  await job({ Appointment_Status: 'Failed', Failure_Reason_Code: 'damaged_in_transit' }, [{ SKU: 'LAMP-1', Quantity: 2 }], '2026-11-12 10:00:00 AM');
  await job({ Appointment_Status: 'Failed', Failure_Reason_Code: 'not_home' }, [{ SKU: 'FAN-1', Quantity: 1 }], '2026-11-12 11:00:00 AM'); // failed, not damaged

  const r = await getDamageByCategory(raw, { now: NOW });
  const lamps = r.categories.find((c) => c.category === 'Lamps');
  const fans = r.categories.find((c) => c.category === 'Fans');
  assert.deepEqual([lamps.handled, lamps.damaged, lamps.ratePct], [10, 2, 20]);
  assert.deepEqual([fans.handled, fans.damaged, fans.ratePct], [3, 0, 0]);
  assert.equal(r.categories[0].category, 'Lamps', 'highest rate first');
  assert.equal(r.overallPct, 15.4); // 2 of 13
});

test('a return received Damaged adds its Return_Quantity, but not twice for a job already counted as damaged', async () => {
  await item('LAMP-1', 'Lamps');
  const bad = await job({ Appointment_Status: 'Failed', Failure_Reason_Code: 'damaged_in_transit' }, [{ SKU: 'LAMP-1', Quantity: 2 }], '2026-11-12 10:00:00 AM');
  await job({}, [{ SKU: 'LAMP-1', Quantity: 8 }], '2026-11-10 10:00:00 AM');
  // return from the job already counted: skipped
  await raw.addRecord(RET, { Received_Condition: 'Damaged', Received_At: '2026-11-13 09:00:00 AM', Source_SA_ID: String(bad), Items: [{ SKU: 'LAMP-1', Return_Quantity: 2 }] });
  // a manual return, no source job: counted
  await raw.addRecord(RET, { Received_Condition: 'Damaged', Received_At: '2026-11-14 09:00:00 AM', Items: [{ SKU: 'LAMP-1', Return_Quantity: 1 }] });
  // received Good: not damage
  await raw.addRecord(RET, { Received_Condition: 'Good', Received_At: '2026-11-14 09:00:00 AM', Items: [{ SKU: 'LAMP-1', Return_Quantity: 5 }] });

  const r = await getDamageByCategory(raw, { now: NOW });
  assert.deepEqual([r.handled, r.damaged, r.returnsCounted], [10, 3, 1]);
});

test('jobs and returns outside the window, pickups/pull-outs, unfinished jobs are left out; unknown SKUs are "Uncategorized"', async () => {
  await item('LAMP-1', 'Lamps');
  await job({}, [{ SKU: 'LAMP-1', Quantity: 4 }], '2026-11-10 10:00:00 AM');
  await job({}, [{ SKU: 'LAMP-1', Quantity: 99 }], '2026-05-01 10:00:00 AM'); // older than 90 days
  await job({ Type_of_Delivery: 'Pick Up' }, [{ SKU: 'LAMP-1', Quantity: 99 }], '2026-11-10 10:00:00 AM');
  await job({ If_Pull_Out: 'Yes' }, [{ SKU: 'LAMP-1', Quantity: 99 }], '2026-11-10 10:00:00 AM');
  await job({ Appointment_Status: 'Scheduled' }, [{ SKU: 'LAMP-1', Quantity: 99 }], null);
  await job({}, [{ SKU: 'MYSTERY', Quantity: 2 }], '2026-11-11 10:00:00 AM');
  await raw.addRecord(RET, { Received_Condition: 'Damaged', Received_At: '2026-04-01 09:00:00 AM', Items: [{ SKU: 'LAMP-1', Return_Quantity: 7 }] }); // too old

  const r = await getDamageByCategory(raw, { now: NOW });
  assert.equal(r.handled, 6);
  assert.equal(r.damaged, 0);
  assert.deepEqual(r.categories.map((c) => c.category).sort(), ['Lamps', 'Uncategorized']);
});

test('a job with no Job_Done_At uses Actual_Delivery_Date; Modified_Time is NOT used (it is the migration time on migrated jobs); no date = counted as undated', async () => {
  await item('LAMP-1', 'Lamps');
  await job({ Actual_Delivery_Date: '2026-11-15' }, [{ SKU: 'LAMP-1', Quantity: 3 }], null);
  const migrated = await job({}, [{ SKU: 'LAMP-1', Quantity: 50 }], null);
  await stamp(SA, migrated, 'Modified_Time', '2026-11-15 10:00:00 AM');
  const r = await getDamageByCategory(raw, { now: NOW });
  assert.equal(r.handled, 3);
  assert.equal(r.undated, 1);
});

test('the Zoho-era status "Delivered" counts as done: in the damage numbers and not as an open job in the backlog and trend', async () => {
  await item('LAMP-1', 'Lamps');
  await job({ Appointment_Status: 'Delivered' }, [{ SKU: 'LAMP-1', Quantity: 4 }], '2026-11-10 10:00:00 AM');
  assert.equal((await getDamageByCategory(raw, { now: NOW })).handled, 4);

  const id = await raw.addRecord(SA, { Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Delivered', Actual_Delivery_Date: '2026-11-11' });
  await stamp(SA, id, 'Added_Time', '2026-11-01 09:00:00 AM');
  await team('2026-11-19', 'A');
  const { getDeliveryBacklog } = await import('../../server/modules/delivery-management/backlog-calculator.mjs');
  assert.equal((await getDeliveryBacklog(raw, { now: NOW })).openJobs, 0);
  assert.equal((await getBacklogTrend(raw, { now: NOW })).points.at(-1).openJobs, 0);
});

test('nothing at all: empty list, blank overall, no crash', async () => {
  const r = await getDamageByCategory(raw, { now: NOW });
  assert.deepEqual([r.categories.length, r.handled, r.damaged, r.overallPct], [0, 0, 0, null]);
});

// ---------- weekly backlog trend ----------
async function siteJob(addedDay, doneDay, extra = {}) {
  const id = await raw.addRecord(SA, { Type_of_Delivery: 'Delivery Only', Appointment_Status: doneDay ? 'Completed' : 'Scheduled', ...extra });
  await stamp(SA, id, 'Added_Time', `${addedDay} 09:00:00 AM`);
  if (doneDay) await stamp(SA, id, 'Job_Done_At', `${doneDay} 03:00:00 PM`);
  return id;
}
const team = (date, name) => raw.addRecord(TEAMS, { Availability_Date: date, Installer: name, Availability_Status: 'Full Day' });

test('trend: a job is open on a past day if created by then and not finished by the end of it; 8 weekly points ending today', async () => {
  await siteJob('2026-11-01', '2026-11-12');   // open on 11-05, finished before 11-19
  await siteJob('2026-11-10', null);           // still open
  await siteJob('2026-11-17', '2026-11-18');   // created and finished between the points
  await team('2026-11-05', 'A'); await team('2026-11-19', 'A'); await team('2026-11-19', 'B');

  const t = await getBacklogTrend(raw, { now: NOW });
  assert.equal(t.points.length, 8);
  assert.equal(t.points.at(-1).date, '2026-11-19');
  assert.equal(t.points.at(0).date, '2026-10-01'); // 7 weeks (49 days) before the last point
  const nov5 = t.points.find((p) => p.date === '2026-11-05');
  assert.deepEqual([nov5.openJobs, nov5.teamsPerDay, nov5.backlogDays], [1, 1, 1 / 3]);
  const nov12 = t.points.find((p) => p.date === '2026-11-12'); // the first job finished on 11-12, so it is not open at the end of that day
  assert.equal(nov12.openJobs, 1);
  const today = t.points.at(-1);
  assert.deepEqual([today.openJobs, today.teamsPerDay, today.backlogDays], [1, 2, 1 / 6]);
});

test('trend: migrated jobs (no Added_Time) are counted in today\'s point and reported as noCreatedDate; a finished job with no finish date is noDoneDate; Actual_Delivery_Date places a finished job; Modified_Time is ignored', async () => {
  const migratedOpen = await raw.addRecord(SA, { Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled' });          // no Added_Time
  const migratedDone = await raw.addRecord(SA, { Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Completed' });          // no Added_Time, no finish date
  await stamp(SA, migratedDone, 'Modified_Time', '2026-11-18 01:00:00 AM');
  await db.query(`UPDATE "${SA}" SET "Added_Time" = NULL WHERE "ID"::text IN ($1, $2)`, [String(migratedOpen), String(migratedDone)]);
  const legacy = await siteJob('2026-10-01', null, { Appointment_Status: 'Completed', Actual_Delivery_Date: '2026-11-10' });      // finished 11-10 by its Zoho date
  await team('2026-11-05', 'A'); await team('2026-11-19', 'A');

  const t = await getBacklogTrend(raw, { now: NOW });
  assert.equal(t.noCreatedDate, 2);
  assert.equal(t.noDoneDate, 1);
  assert.equal(t.points.at(-1).openJobs, 1, 'today = every job open right now, including the one with no Added_Time');
  assert.equal(t.points.find((p) => p.date === '2026-11-05').openJobs, 1, 'only the legacy job (created 10-01, delivered 11-10) is open on 11-05');
  assert.equal(t.points.find((p) => p.date === '2026-11-12').openJobs, 0, 'the legacy job was delivered 11-10');
  void legacy;
});

test('trend: no availability rows = no number (null), not a guess; third-party jobs are excluded', async () => {
  await siteJob('2026-11-01', null);
  await siteJob('2026-11-01', null, { Fleet_Decision: '3rd Party' });
  const t = await getBacklogTrend(raw, { now: NOW, weeks: 2 });
  assert.equal(t.points.length, 2);
  assert.deepEqual([t.points[1].openJobs, t.points[1].teamsPerDay, t.points[1].backlogDays], [1, null, null]);
});
