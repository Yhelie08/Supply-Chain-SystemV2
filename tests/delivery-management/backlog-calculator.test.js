// Delivery backlog calculator (spec v1.4, 05 Shared Engines / 02 Calculators §2): server/modules/delivery-management/backlog-calculator.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { backlogDays, teamsNeeded, teamsPerDayFor, getDeliveryBacklog } from '../../server/modules/delivery-management/backlog-calculator.mjs';
import { policyReader } from '../../server/modules/delivery-management/scheduling.mjs';

const SA = 'Service_Appointment_Form';
const TEAMS = 'Daily_Team_Availability';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SA, TEAMS, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

test('backlogDays: the spec\'s own formula, zero jobs and zero capacity as edge cases', () => {
  assert.equal(backlogDays(9, 3, 3), 1);
  assert.equal(backlogDays(0, 3, 3), 0);
  assert.equal(backlogDays(9, 0, 3), Infinity);
});

test('teamsNeeded: the spec\'s own formula', () => {
  assert.equal(teamsNeeded(18, 3, 3), 2);
  assert.equal(teamsNeeded(0, 3, 3), 0);
  assert.equal(teamsNeeded(9, 0, 3), Infinity);
});

test('teamsPerDayFor: counts active teams for the date, excludes Not Available, caps at delivery_max_teams', async () => {
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'A', Availability_Status: 'Full Day' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'B', Availability_Status: 'Full Day' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'C', Availability_Status: 'Not Available' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-19', Installer: 'D', Availability_Status: 'Full Day' }); // a different date
  const policy = await policyReader(raw);
  assert.equal(await teamsPerDayFor(raw, '2026-11-18', policy), 2);

  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'E', Availability_Status: 'Full Day' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'F', Availability_Status: 'Full Day' });
  assert.equal(await teamsPerDayFor(raw, '2026-11-18', policy), 3, 'capped at the default 3 field vehicles even with 4 active teams');
});

const job = (extra = {}) => raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled', ...extra });

test('getDeliveryBacklog: open_jobs excludes done jobs, third-party jobs, and non-site types (Pick Up/Pull Out/Site Visit)', async () => {
  await job({ Sales_Order: 'SO-OPEN' });
  await job({ Sales_Order: 'SO-DONE', Appointment_Status: 'Completed' });
  await job({ Sales_Order: 'SO-3P', Fleet_Decision: '3rd Party' });
  await job({ Sales_Order: 'SO-PICKUP', Type_of_Delivery: 'Pick Up' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'A', Availability_Status: 'Full Day' });

  const r = await getDeliveryBacklog(raw, { now: new Date(2026, 10, 18) });
  assert.equal(r.openJobs, 1);
  assert.equal(r.teamsPerDay, 1);
  assert.equal(r.sitesPerTeamPerDay, 3);
  assert.equal(r.backlogDays, 1 / 3);
});

test('getDeliveryBacklog: drop-off share, the "if outsourced" backlog, and open_jobs_due reuse the sorter\'s own late/at_risk categories', async () => {
  await job({ Sales_Order: 'SO-DROP-1', Type_of_Delivery: 'Delivery Only', Category: 'late' });
  await job({ Sales_Order: 'SO-DROP-2', Type_of_Delivery: 'Delivery Only', Category: 'on_time' });
  await job({ Sales_Order: 'SO-INSTALL', Type_of_Delivery: 'With Installation', Category: 'at_risk' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'A', Availability_Status: 'Full Day' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'B', Availability_Status: 'Full Day' });

  const r = await getDeliveryBacklog(raw, { now: new Date(2026, 10, 18), daysAvailable: 3 });
  assert.equal(r.openJobs, 3);
  assert.equal(r.openDropoffs, 2);
  assert.equal(r.dropoffShare, 2 / 3);
  assert.equal(r.openJobsDue, 2); // SO-DROP-1 (late) + SO-INSTALL (at_risk); SO-DROP-2 (on_time) does not count
  assert.equal(r.teamsPerDay, 2);
  assert.equal(r.backlogDays, 3 / (2 * 3));
  assert.equal(r.backlogDaysIfDropoffsOutsourced, (3 - 2) / (2 * 3));
  assert.equal(r.teamsNeeded, teamsNeeded(2, 3, 3));
});

test('getDeliveryBacklog: delivery_sites_per_team_per_day and delivery_max_teams policy settings are honoured', async () => {
  await raw.addRecord('Policy_Settings', { Policy_Key: 'delivery_sites_per_team_per_day', Value: '4' });
  await raw.addRecord('Policy_Settings', { Policy_Key: 'delivery_max_teams', Value: '1' });
  await job({ Sales_Order: 'SO-A' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'A', Availability_Status: 'Full Day' });
  await raw.addRecord(TEAMS, { Availability_Date: '2026-11-18', Installer: 'B', Availability_Status: 'Full Day' });

  const r = await getDeliveryBacklog(raw, { now: new Date(2026, 10, 18) });
  assert.equal(r.sitesPerTeamPerDay, 4);
  assert.equal(r.teamsPerDay, 1, 'capped at the policy override, not the 2 teams actually available');
});
