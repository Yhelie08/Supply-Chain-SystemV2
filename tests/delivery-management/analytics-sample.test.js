// Delivery Analytics checked against a data set whose answers were worked out by hand (tools/delivery-sample-data.mjs).
// The on-time %, first-attempt %, fleet split, forecast error, jobs per team-day, damage by category, the Ship -> Service
// Request gap and the backlog trend are compared with EXPECTED, not with the code's own arithmetic.
// The widget half runs the real Delivery Analytics widget in jsdom (SDK calls go to the real server code) in several time
// zones, because the widget compares finish TIMES with promised DATES: in UTC it once read 15% on-time instead of 70%.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { seedDeliverySample, EXPECTED, JOB_SPEC, ymd } from '../../tools/delivery-sample-data.mjs';
import { getShipToSrGap } from '../../server/modules/delivery-management/ship-to-sr-gap.mjs';
import { getDamageByCategory } from '../../server/modules/delivery-management/damage-by-category.mjs';
import { getDeliveryBacklog, getBacklogTrend } from '../../server/modules/delivery-management/backlog-calculator.mjs';

let raw;

before(async () => {
  const db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  const store = createHookedStore(raw, workflows);
  await seedDeliverySample({ db, raw, store });
});

test('the sample data is what the hand count assumed: 20 measured jobs, 14 on time', () => {
  assert.equal(JOB_SPEC.length, 20);
  const onTime = JOB_SPEC.filter((j) => j.late <= 0).length;
  const late = JOB_SPEC.filter((j) => j.late > 0).map((j) => j.late);
  assert.equal(onTime, 14);
  assert.deepEqual(late.sort(), [1, 1, 2, 2, 3, 4]);
});

test('the Job status chain stamped the jobs done (the sample goes through the real hooks)', async () => {
  const done = await raw.find('Service_Appointment_Form', (r) => r.Appointment_Status === 'Completed');
  assert.equal(done.length, 22);
  assert.ok(done.filter((r) => r.Job_Status === 'done').length === 22);
  const eventsForJobs = await raw.find('Stage_Events', (e) => e.Record_Type === 'service_appointment' && e.Event === 'job.done');
  assert.ok(eventsForJobs.length >= 22, 'one job.done event per finished job');
});

test('#7 Ship -> Service Request gap: count, average, median, longest, and what was left out', async () => {
  const g = await getShipToSrGap(raw);
  assert.deepEqual({ count: g.count, unmatched: g.unmatched, negative: g.negative, avgHours: g.avgHours, medianHours: g.medianHours, maxHours: g.maxHours }, EXPECTED.shipToSr);
});

test('#3 damage by category: handled and damaged units match the hand count, a return is not counted twice, Good returns are ignored', async () => {
  const d = await getDamageByCategory(raw);
  for (const [category, want] of Object.entries(EXPECTED.damage)) {
    const got = d.categories.find((c) => c.category === category);
    assert.deepEqual([got.handled, got.damaged], [want.handled, want.damaged], category);
  }
  assert.deepEqual([d.handled, d.damaged], [EXPECTED.damageTotals.handled, EXPECTED.damageTotals.damaged]);
  assert.equal(d.undated, 2, 'the migrated job and the "Delivered" one have no finish date');
  assert.equal(d.returnsCounted, 1);
});

test('backlog today: 3 open jobs, 3 teams, 3 sites per team = 1/3 of a day', async () => {
  const b = await getDeliveryBacklog(raw);
  assert.deepEqual([b.openJobs, b.teamsPerDay], [EXPECTED.backlogToday.openJobs, EXPECTED.backlogToday.teamsPerDay]);
  assert.ok(Math.abs(b.backlogDays - 3 / 9) < 1e-9);
});

test('backlog trend: every weekly point equals an independent count of the jobs open that day', async () => {
  const t = await getBacklogTrend(raw);
  const jobs = await raw.find('Service_Appointment_Form', (r) => ['With Installation', 'Delivery Only'].includes(r.Type_of_Delivery) && r.Fleet_Decision !== '3rd Party');
  const day = (v) => String(v || '').slice(0, 10);
  assert.equal(t.points.length, 8);
  t.points.forEach((p, i) => {
    const isToday = i === t.points.length - 1;
    const open = jobs.filter((r) => {
      const done = ['Completed', 'Delivered', 'Failed'].includes(r.Appointment_Status);
      if (isToday) return !done;
      if (!day(r.Added_Time) || day(r.Added_Time) > p.date) return false;
      if (!done) return true;
      const fin = day(r.Job_Done_At) || day(r.Actual_Delivery_Date);
      return !!fin && fin > p.date;
    }).length;
    assert.equal(p.openJobs, open, `open jobs on ${p.date}`);
    assert.equal(p.teamsPerDay, 3);
  });
  assert.equal(t.points.at(-1).date, ymd(new Date()));
  assert.deepEqual([t.noCreatedDate, t.noDoneDate], [2, 2]);
});

// ---------- the widget, in several time zones ----------
function runWidget(TZ, doneHour) {
  const r = spawnSync(process.execPath, ['tests/delivery-management/helpers/analytics-widget-run.mjs'], { env: { ...process.env, TZ, DONE_HOUR: String(doneHour) }, encoding: 'utf8', timeout: 180000 });
  assert.equal(r.status, 0, `the widget run failed in ${TZ}: ${r.stderr.slice(0, 300)}`);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}
const val = (tiles, start) => (tiles.find(([label]) => label.startsWith(start)) || [])[1];
const pct = (n) => `${n}%`;

for (const [TZ, hour] of [['Asia/Manila', 15], ['UTC', 15], ['America/New_York', 21], ['Pacific/Auckland', 21]]) {
  test(`the dashboard shows the hand-counted numbers in ${TZ}, jobs finished at ${hour}:00`, () => {
    const w = runWidget(TZ, hour);
    assert.deepEqual(w.errors, []);
    assert.equal(val(w.keyNumbers, '#1'), pct(EXPECTED.onTimePct), '#1 on-time');
    assert.equal(val(w.keyNumbers, '#2'), pct(EXPECTED.firstAttemptFullPct), '#2 first attempt full');
    assert.equal(val(w.keyNumbers, '#8'), `+${EXPECTED.forecastErrorAvg}d`, '#8 forecast error');
    assert.equal(val(w.keyNumbers, '#9'), `${EXPECTED.daysLateAvg}d`, '#9 days late');
    assert.equal(val(w.teamDay, '#5 Avg Jobs/Team-Day — Installation'), String(EXPECTED.jobsPerTeamDay.install));
    assert.equal(val(w.teamDay, '#5 Avg Jobs/Team-Day — Drop-off'), String(EXPECTED.jobsPerTeamDay.dropoff));
    assert.equal(val(w.fleet, '#6 Own Team — Count'), String(EXPECTED.own.count));
    assert.equal(val(w.fleet, '#6 Own Team — On-Time'), pct(EXPECTED.own.onTimePct));
    assert.equal(val(w.fleet, '#6 Own Team — Damage'), pct(EXPECTED.own.damagePct));
    assert.equal(val(w.fleet, '#6 3rd Party — Count'), String(EXPECTED.thirdParty.count));
    assert.equal(val(w.fleet, '#6 3rd Party — On-Time'), pct(EXPECTED.thirdParty.onTimePct));
    assert.match(w.keyNumbersNote, /Based on 20 of 23 Completed jobs\. Left out: 2 with no delivered date and 1 with no promised date/);
    assert.equal(val(w.shipToSr, '#7 Ship'), '22.6h');
    assert.equal(val(w.shipToSr, '#7 Median'), '12h');
    assert.equal(val(w.shipToSr, '#7 Longest'), '3d');
    assert.equal(val(w.shipToSr, '#7 Service Requests Measured'), '9');
    assert.match(w.shipToSrNote, /Left out: 2 with no matching aggregation record .* and 1 created before their package was aggregated/);
    assert.match(w.damageChart, /Pendant Light \(2\/12\)16\.7%Wall Light \(1\/10\)10%Ceiling Fan \(0\/12\)0%Chandelier \(0\/10\)0%/);
    assert.match(w.damageNote, /Overall 6\.8% \(3 of 44 units\)/);
    assert.match(w.backlogTrend, /\(3 open, 3 teams\)0\.3d/);
    assert.match(w.backlogTrend, /Earlier weeks undercount: 2 job\(s\) have no created date and 2 finished job\(s\) have no finish date/);
  });
}
