// Team Rotation (spec v1.4, Delivery 02 §1, TM-R1): server/modules/delivery-management/rotation.mjs. The pairing
// formula is ported 1:1 from the Daily Team Availability widget's own "Generate Month" button — these tests prove
// the port preserves the exact properties that widget's own comments claim (no lock-step, 24/25 pairings, 30/30
// vehicle pairings over 120 days).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { teamsForDate, plannedRows, generateRotation, AUTO_TAG, ROSTER } from '../../server/modules/delivery-management/rotation.mjs';

const FORM = 'Daily_Team_Availability';

test('teamsForDate: never doubles a person as both installer and driver on the same day', () => {
  for (let i = 0; i < 365; i++) {
    const d = new Date(2027, 0, 1 + i);
    const teams = teamsForDate(d, 3);
    const installers = teams.map((t) => t.installer);
    for (const t of teams) assert.ok(!installers.includes(t.driver) || t.driver === '', `day ${i}: ${t.driver} is both driving and installing`);
  }
});

test('teamsForDate: never reuses a driver or a vehicle twice on the same day', () => {
  for (let i = 0; i < 365; i++) {
    const teams = teamsForDate(new Date(2027, 0, 1 + i), 3);
    const drivers = teams.map((t) => t.driver).filter(Boolean);
    const vehicles = teams.map((t) => t.vehicle).filter(Boolean);
    assert.equal(new Set(drivers).size, drivers.length);
    assert.equal(new Set(vehicles).size, vehicles.length);
  }
});

test('teamsForDate: no lock-step — at least 20 of the 25 possible installer/driver pairings appear over 120 days (same claim the widget makes: 24/25)', () => {
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    for (const t of teamsForDate(new Date(2027, 0, 1 + i), 3)) if (t.driver) seen.add(`${t.installer}|${t.driver}`);
  }
  assert.ok(seen.size >= 20, `only ${seen.size} distinct pairings in 120 days — the mod 7/11 offsets may have been lost`);
});

test('teamsForDate: every vehicle pairs with every installer at least once over 120 days (30/30 in the widget)', () => {
  const seen = new Set();
  for (let i = 0; i < 120; i++) {
    for (const t of teamsForDate(new Date(2027, 0, 1 + i), 3)) if (t.vehicle) seen.add(`${t.installer}|${t.vehicle}`);
  }
  assert.equal(seen.size, ROSTER.installers.length * ROSTER.vehicles.length);
});

test('teamsForDate: the same date always gives the same answer (deterministic, no randomness)', () => {
  const d = new Date(2027, 3, 15);
  assert.deepEqual(teamsForDate(d, 3), teamsForDate(d, 3));
});

test('plannedRows: Mon-Sat only, teams per working day', () => {
  const rows = plannedRows(new Date(2027, 0, 1), 14, 2); // Jan 2027: Fri 1 .. 14 days
  const sundays = rows.filter((r) => new Date(`${r.date}T00:00:00`).getDay() === 0);
  assert.equal(sundays.length, 0);
  const days = new Set(rows.map((r) => r.date));
  assert.equal(rows.length, days.size * 2);
});

// ---------- integration: generateRotation against the store ----------
let db, raw;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [FORM, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

test('generateRotation: fills 14 work days ahead by default, tagged as auto rotation', async () => {
  const result = await generateRotation(raw, { today: new Date(2027, 0, 4) }); // a Monday
  assert.equal(result.added, result.planned);
  assert.ok(result.added > 0);
  const rows = await raw.find(FORM);
  assert.equal(rows.length, result.added);
  assert.ok(rows.every((r) => String(r.Notes).startsWith(AUTO_TAG)));
});

test('generateRotation: running it again adds nothing more (idempotent, TM-R1 "ahead of time" never duplicates)', async () => {
  await generateRotation(raw, { today: new Date(2027, 0, 4) });
  const before = (await raw.find(FORM)).length;
  const second = await generateRotation(raw, { today: new Date(2027, 0, 4) });
  assert.equal(second.added, 0);
  assert.equal((await raw.find(FORM)).length, before);
});

test('generateRotation: never overwrites an existing row for that (date, installer) slot, auto or hand-edited (TM-R3)', async () => {
  const today = new Date(2027, 0, 4);
  const [first] = plannedRows(today, 1, 1);
  await raw.addRecord(FORM, { Availability_Date: first.date, Installer: first.installer, Driver: 'Someone Else', Availability_Status: 'Full Day', Notes: 'Edited by the dispatcher' });
  await generateRotation(raw, { today, days: 1, teamsPerDay: 1 });
  const rows = await raw.find(FORM, (r) => r.Availability_Date === first.date);
  assert.equal(rows.length, 1, 'no duplicate row for the same slot');
  assert.equal(rows[0].Driver, 'Someone Else', 'the hand-edited row was not touched');
});

test('generateRotation: respects rotation_days_ahead and rotation_teams_per_day from Policy_Settings', async () => {
  await raw.addRecord('Policy_Settings', { Policy_Key: 'rotation_days_ahead', Value: '6' });
  await raw.addRecord('Policy_Settings', { Policy_Key: 'rotation_teams_per_day', Value: '1' });
  const result = await generateRotation(raw, { today: new Date(2027, 0, 4) }); // Mon 4 .. Sat 9: 6 work days, 6 teams total
  assert.equal(result.planned, 6);
});
