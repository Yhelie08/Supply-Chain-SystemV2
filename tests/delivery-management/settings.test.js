// Control Panel, Delivery group (spec 05/08) and the editable team roster (Delivery 02, TM-R4):
// server/modules/delivery-management/settings.mjs, settings-defs.mjs, rotation.mjs's rosterFrom.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { SETTING_DEFS, DEFS, problemWith, workdayProblem } from '../../server/modules/delivery-management/settings-defs.mjs';
import { getSettings, previewSetting, getRoster, seedRoster } from '../../server/modules/delivery-management/settings.mjs';
import { ROSTER, rosterFrom, generateRotation } from '../../server/modules/delivery-management/rotation.mjs';
import { createAccess } from '../../server/access.mjs';

const POLICY = 'Policy_Settings';
const HISTORY = 'Delivery_Settings_History';
const ROSTER_FORM = 'Delivery_Roster';
const SA = 'Service_Appointment_Form';
const TEAMS = 'Daily_Team_Availability';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [POLICY, HISTORY, ROSTER_FORM, SA, TEAMS]) await db.query(`DELETE FROM "${f}"`); });

const history = () => raw.find(HISTORY);
const rejects = (promise, re) => assert.rejects(promise, (e) => re.test(String(e.message)));
const ymdLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ---------- the catalogue ----------
test('drift guard: every policy key the Delivery code reads is in the catalogue', () => {
  const dir = path.resolve('server/modules/delivery-management');
  const read = new Set();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.mjs') && n !== 'settings-defs.mjs')) {
    for (const m of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/policy\('([a-z_0-9]+)'\)/g)) read.add(m[1]);
  }
  assert.ok(read.size >= 15, 'the scan found the keys');
  const missing = [...read].filter((k) => !(k in DEFS));
  assert.deepEqual(missing, [], `these keys are read by the code but have no Control Panel entry: ${missing.join(', ')}`);
});

test('every catalogue entry has a label, an "affects" sentence, a group and a default that passes its own limits', () => {
  for (const d of SETTING_DEFS) {
    assert.ok(d.label && d.affects && d.group, d.key);
    assert.equal(problemWith(d.key, d.default), null, `${d.key} default ${d.default}`);
  }
  assert.equal(new Set(SETTING_DEFS.map((d) => d.key)).size, SETTING_DEFS.length, 'no duplicate keys');
});

test('problemWith: limits, whole numbers, times, optional blank', () => {
  assert.match(problemWith('traffic_buffer_percent', '200'), /outside the allowed range \(0 to 100\)/);
  assert.match(problemWith('traffic_buffer_percent', '-1'), /outside/);
  assert.match(problemWith('traffic_buffer_percent', '12.5'), /whole numbers/);
  assert.match(problemWith('traffic_buffer_percent', 'abc'), /enter a number/);
  assert.match(problemWith('traffic_buffer_percent', ''), /enter a number/);
  assert.equal(problemWith('traffic_buffer_percent', '0'), null);
  assert.equal(problemWith('rotation_max_so_capacity', ''), null, 'optional: blank = no limit');
  assert.equal(problemWith('workday_start_time', '7:30 AM'), null);
  assert.match(problemWith('workday_start_time', '25:00'), /enter a time/);
  assert.match(problemWith('workday_start_time', '8 AM'), /enter a time/);
  assert.match(problemWith('at_risk_slack_days', '0'), /outside/, 'the sorter reads 0 as the default 3, so 0 is not offered');
  assert.match(problemWith('nope', '1'), /not a Delivery setting/);
});

test('workdayProblem: the day must be at least one hour long', () => {
  const v = { workday_start_time: '8:00 AM', workday_end_time: '5:00 PM' };
  assert.equal(workdayProblem('workday_end_time', '6:00 PM', v), null);
  assert.match(workdayProblem('workday_end_time', '8:30 AM', v), /at least one hour/);
  assert.match(workdayProblem('workday_start_time', '5:30 PM', v), /at least one hour/);
  assert.equal(workdayProblem('traffic_buffer_percent', '10', v), null);
});

// ---------- saving: validation and history ----------
test('a bad value for a catalogue key is refused; a good one is stored normalised with Description/Type filled and a history row', async () => {
  await rejects(store.addRecord(POLICY, { Policy_Key: 'traffic_buffer_percent', Value: '500' }), /outside the allowed range/);
  assert.equal((await raw.find(POLICY)).length, 0);

  const id = await store.addRecord(POLICY, { Policy_Key: 'traffic_buffer_percent', Value: ' 20 ', Change_Reason: 'rainy season' }, 'admin@x.com');
  const row = await raw.getRecordById(POLICY, id, { raw: true });
  assert.equal(row.Value, '20');
  assert.equal(row.Description, 'Traffic buffer');
  assert.equal(row.Type_field, 'Percentage');
  const [h] = await history();
  assert.deepEqual([h.Setting_Key, h.Old_Value, h.New_Value, h.Reason], ['traffic_buffer_percent', '15', '20', 'rainy season']);
});

test('a second row for the same key is refused; an update is validated and logged old -> new; a no-op update logs nothing', async () => {
  const id = await store.addRecord(POLICY, { Policy_Key: 'soft_hold_minutes', Value: '30' });
  await rejects(store.addRecord(POLICY, { Policy_Key: 'soft_hold_minutes', Value: '40' }), /already has a row/);
  await rejects(store.updateRecord(POLICY, id, { Value: '0' }, { byForm: true }), /outside the allowed range/);
  await store.updateRecord(POLICY, id, { Value: '45' }, { byForm: true });
  await store.updateRecord(POLICY, id, { Value: '45' }, { byForm: true }); // same value again
  const rows = (await history()).filter((h) => h.Setting_Key === 'soft_hold_minutes').map((h) => [h.Old_Value, h.New_Value]);
  assert.deepEqual(rows, [['20', '30'], ['30', '45']]);
});

test('a time is normalised and the workday pair is checked against the value in use', async () => {
  await store.addRecord(POLICY, { Policy_Key: 'workday_start_time', Value: '7:30 am' });
  assert.equal((await raw.find(POLICY, (r) => r.Policy_Key === 'workday_start_time'))[0].Value, '7:30 AM');
  await rejects(store.addRecord(POLICY, { Policy_Key: 'workday_end_time', Value: '8:00 AM' }), /at least one hour/);
});

test('deleting a row goes back to the default and says so in the history', async () => {
  const id = await store.addRecord(POLICY, { Policy_Key: 'archive_after_days', Value: '14' });
  await store.deleteRecord(POLICY, id);
  const last = (await history()).filter((h) => h.Setting_Key === 'archive_after_days').pop();
  assert.deepEqual([last.Old_Value, last.New_Value, last.Reason], ['14', '7', 'Back to the default']);
});

test('a key that is not in the catalogue passes through untouched, with no history', async () => {
  await store.addRecord(POLICY, { Policy_Key: 'fulfillment_boxes_per_hour', Value: 'whatever' });
  await store.addRecord(POLICY, { Policy_Key: 'some_custom_key', Value: 'abc' });
  assert.equal((await raw.find(POLICY)).length, 2);
  assert.equal((await history()).length, 0);
});

test('a ranking number re-scores the queue right away (CP-R3) and the history says how many jobs changed', async () => {
  const tenDaysAgo = ymdLocal(new Date(Date.now() - 10 * 86400000));
  const jobId = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled', Order_Date: tenDaysAgo, Contact: '09170000000', Customer_Address: 'Makati' });
  await store.addRecord(POLICY, { Policy_Key: 'default_promise_days', Value: '5' }); // target = 5 days ago -> late
  const sa = await raw.getRecordById(SA, jobId, { raw: true });
  assert.equal(sa.Category, 'late');
  const h = (await history()).find((x) => x.Setting_Key === 'default_promise_days');
  assert.match(h.Effect, /Queue re-scored: 1 of 1 open job\(s\) changed/);
});

// ---------- the effect before saving ----------
test('preview of a ranking number shows which jobs move, and writes nothing', async () => {
  const tenDaysAgo = ymdLocal(new Date(Date.now() - 10 * 86400000));
  const jobId = await raw.addRecord(SA, { Sales_Order: 'SO-9', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled', Order_Date: tenDaysAgo, Contact: '09170000000', Customer_Address: 'Makati' });
  const r = await previewSetting(raw, 'default_promise_days', '5');
  assert.equal(r.status, 'success');
  assert.match(r.message, /1 open job\(s\) would change category/);
  assert.match(r.message, /Fulfillment's own ranking reads this number too/);
  assert.deepEqual(r.moved, [{ no: 'SO-9', from: 'on_time', to: 'late' }]);
  assert.equal(r.before.on_time, 1);
  assert.equal(r.after.late, 1);
  assert.equal((await raw.find(POLICY)).length, 0, 'no setting was saved');
  assert.equal((await raw.getRecordById(SA, jobId, { raw: true })).Category ?? '', '', 'no job was re-scored');
  assert.equal((await history()).length, 0);
});

test('preview of a capacity number shows the backlog before and after; a refused value is explained', async () => {
  for (let i = 0; i < 6; i++) await raw.addRecord(SA, { Sales_Order: `SO-${i}`, Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Scheduled' });
  await raw.addRecord(TEAMS, { Availability_Date: ymdLocal(new Date()), Installer: 'A', Availability_Status: 'Full Day' });
  const r = await previewSetting(raw, 'delivery_sites_per_team_per_day', '6');
  assert.equal(r.status, 'success');
  assert.match(r.message, /2 day\(s\) now, 1 day\(s\) with this number/);
  assert.equal(r.backlog.after.sitesPerTeamPerDay, 6);

  const bad = await previewSetting(raw, 'delivery_sites_per_team_per_day', '99');
  assert.equal(bad.status, 'error');
  assert.match(bad.message, /outside the allowed range/);
  assert.equal((await previewSetting(raw, 'not_a_key', '1')).status, 'error');
});

test('preview of a number with no live effect says so and repeats what it affects', async () => {
  const r = await previewSetting(raw, 'archive_after_days', '30');
  assert.equal(r.status, 'success');
  assert.match(r.message, /No open job changes right now/);
  assert.match(r.message, /leaves the active lists/);
});

// ---------- the catalogue with values in use ----------
test('getSettings: default vs saved, the row to change, who changed it last, and a saved value that breaks the limits is flagged', async () => {
  await store.addRecord(POLICY, { Policy_Key: 'traffic_buffer_percent', Value: '25' }, 'admin@x.com');
  await raw.addRecord(POLICY, { Policy_Key: 'dropoff_max_wait_days', Value: '99' }); // saved earlier through the old page, no hook
  const { settings, groups } = await getSettings(raw);
  const by = Object.fromEntries(settings.map((s) => [s.key, s]));
  assert.equal(groups.length, 5);
  assert.deepEqual([by.traffic_buffer_percent.value, by.traffic_buffer_percent.source, !!by.traffic_buffer_percent.row_id], [25, 'saved', true]);
  assert.equal(by.traffic_buffer_percent.last_changed_by, 'admin@x.com');
  assert.deepEqual([by.max_days_scheduling_window.value, by.max_days_scheduling_window.source, by.max_days_scheduling_window.row_id], [14, 'default', null]);
  assert.match(by.dropoff_max_wait_days.problem, /outside the allowed range/);
  assert.equal(by.workday_start_time.value, '8:00 AM');
});

// ---------- the roster (TM-R4) ----------
test('rosterFrom: no rows = the built-in lists; "Make editable" copies them once', async () => {
  assert.deepEqual(await rosterFrom(raw), ROSTER);
  assert.equal((await getRoster(raw)).editable, false);
  assert.deepEqual(await seedRoster(raw), { seeded: 13 });
  assert.deepEqual(await seedRoster(raw), { seeded: 0 }, 'only once');
  assert.deepEqual(await rosterFrom(raw), ROSTER);
  assert.equal((await getRoster(raw)).editable, true);
});

test('"Make editable" through the hooked store logs ONE history row, not one per roster row; the backlog preview explains a day with no team', async () => {
  assert.deepEqual(await seedRoster(store, 'admin@x.com'), { seeded: 13 });
  const log = await history();
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].Setting_Key, log[0].New_Value, log[0].Reason], ['roster:all', '13 editable rows', 'Made the roster editable']);
  const r = await previewSetting(raw, 'delivery_max_teams', '2');
  assert.match(r.message, /No team is listed as available today/);
});

test('roster edits: add, reorder, deactivate are used by rotation; the rotation only ever uses the roster names', async () => {
  await seedRoster(raw);
  const added = await store.addRecord(ROSTER_FORM, { Role: 'installer', Name: '  Ramon ', Active: true, Sort_Order: 99 }, 'admin@x.com');
  assert.equal((await raw.getRecordById(ROSTER_FORM, added, { raw: true })).Name, 'Ramon');
  const cj = (await raw.find(ROSTER_FORM, (r) => r.Name === 'CJ'))[0];
  await store.updateRecord(ROSTER_FORM, cj.ID, { Active: false }, { byForm: true });
  const roster = await rosterFrom(raw);
  assert.deepEqual(roster.installers, ['Edmon', 'John Dave', 'Nherwin', 'Norman', 'Ramon']);

  const result = await generateRotation(raw, { today: new Date(2027, 0, 4) });
  assert.ok(result.added > 0);
  const used = new Set((await raw.find(TEAMS)).map((r) => r.Installer));
  assert.ok(!used.has('CJ'), 'a deactivated installer is not scheduled');
  for (const name of used) assert.ok(roster.installers.includes(name), `${name} is on the roster`);
  const log = (await history()).filter((h) => h.Setting_Key === 'roster:installer');
  assert.ok(log.some((h) => /Ramon \(active, order 99\)/.test(h.New_Value)));
  assert.ok(log.some((h) => /CJ \(active/.test(h.Old_Value) && /CJ \(inactive/.test(h.New_Value)));
});

test('roster rules: a duplicate name, a bad role, a blank name, and emptying a role are all refused', async () => {
  await seedRoster(raw);
  await rejects(store.addRecord(ROSTER_FORM, { Role: 'installer', Name: 'cj', Active: true }), /already on the installer roster/);
  await rejects(store.addRecord(ROSTER_FORM, { Role: 'boss', Name: 'X', Active: true }), /Role must be/);
  await rejects(store.addRecord(ROSTER_FORM, { Role: 'driver', Name: '   ', Active: true }), /Enter a name/);
  const vehicles = await raw.find(ROSTER_FORM, (r) => r.Role === 'vehicle');
  await store.updateRecord(ROSTER_FORM, vehicles[0].ID, { Active: false }, { byForm: true });
  await store.updateRecord(ROSTER_FORM, vehicles[1].ID, { Active: false }, { byForm: true });
  await rejects(store.updateRecord(ROSTER_FORM, vehicles[2].ID, { Active: false }, { byForm: true }), /At least one vehicle must stay active/);
  await rejects(store.deleteRecord(ROSTER_FORM, vehicles[2].ID), /At least one vehicle must stay active/);
  assert.deepEqual((await rosterFrom(raw)).vehicles, [vehicles[2].Name]);
});

// ---------- admin only ----------
test('writes to the settings history and the roster are admin-only, like Policy Settings', () => {
  const access = createAccess([], path.resolve('modules'));
  const user = { role: 'user' }, admin = { role: 'admin' };
  for (const form of [HISTORY, ROSTER_FORM, POLICY]) {
    for (const [op, field] of [['addRecords', 'form_name'], ['updateRecordById', 'report_name'], ['deleteRecordById', 'report_name']]) {
      assert.equal(access.checkCall(user, op, { [field]: form })?.code, 403, `${op} ${form} is refused for a normal user`);
      assert.equal(access.checkCall(admin, op, { [field]: form }), null, `${op} ${form} is allowed for an admin`);
    }
  }
});
