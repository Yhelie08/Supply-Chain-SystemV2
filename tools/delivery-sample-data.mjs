// Sample data for Delivery Analytics (2026-11-19): a small, deterministic data set whose answers were worked out BY HAND
// first (see EXPECTED below), so the dashboard's numbers can be checked against something other than themselves.
//   - 20 completed delivery jobs with a promised date and a real finish date: 14 on time, 6 late (1,1,2,2,3,4 days)
//     = 70% on time, 2.2 days late on average; 3 of them third party (all on time)
//   - 2 failed jobs (one "damaged in transit"), 1 redelivery, 1 "Delivered" and 1 completed job migrated from Zoho
//     with no dates (these two are left out of the on-time number, and the dashboard must say so)
//   - 9 Service Requests that were measured for the Ship -> Service Request gap (hours 6, 30, 2, 24, 48, 5, 72, 12 and 4,
//     the last one a request with two packages), 1 with no aggregation record, 1 migrated with no Added_Time,
//     1 created BEFORE its package was aggregated
//   - items in 4 categories, a damaged return, a return already counted through its failed job, a return received Good
//   - 3 open jobs, teams listed for today and for every one of the last 8 weekly points
// Everything is dated relative to the day it is generated.
//
// Used by tests/delivery-management/analytics-sample.test.js (in-memory) and by tools/seed-delivery-sample.mjs
// (your local dev:pg database). Rows are tagged with Sales_Order / SKU / package names that start with SMP-.
import { zohoNow } from '../server/criteria.mjs';

const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// What the dashboard must say. Worked out by hand from the lists below, not computed by the code under test.
export const EXPECTED = {
  onTimePct: 70,            // 14 of 20 (jobs with a promised date AND a finish date)
  completedMeasured: 20,
  completedAll: 23,         // 20 + the redelivery + the migrated one + the "Delivered" one
  noDeliveredDate: 2,       // the migrated one and the "Delivered" one
  noPromisedDate: 1,        // the redelivery
  daysLateAvg: 2.2,         // (1+1+2+2+3+4) / 6 = 2.1667
  firstAttemptFullPct: 91.7, // 22 of 24 first visits (the redelivery is not a first visit; the 2 failed are not full)
  forecastErrorAvg: 1,      // jobs 0..3 forecast 2 days early, 1 day late, exact, 3 days early: (2-1+0+3)/4
  jobsPerTeamDay: { install: 1, dropoff: 1.2 }, // 10 installs on 10 team-days; 7 drop-offs on 6 team-days (jobs 0 and 2 share one)
  own: { count: 22, onTimePct: 64.7, damagePct: 4.5 },     // 11 of 17 on time; 1 damaged of 22
  thirdParty: { count: 3, onTimePct: 100, damagePct: 0 },
  shipToSr: { count: 9, unmatched: 2, negative: 1, avgHours: 22.6, medianHours: 12, maxHours: 72 }, // 203/9
  damage: {                 // handled and damaged units in the last 90 days, by category
    'Pendant Light': { handled: 12, damaged: 2 },  // 10 + the damaged-in-transit job's 2 units
    'Wall Light': { handled: 10, damaged: 1 },     // + 1 unit on a return received Damaged
    'Ceiling Fan': { handled: 12, damaged: 0 },    // 10 + the failed not_home job's 1 + the redelivery's 1
    Chandelier: { handled: 10, damaged: 0 },
  },
  damageTotals: { handled: 44, damaged: 3 },
  backlogToday: { openJobs: 3, teamsPerDay: 3 },
};

// 20 completed jobs, index 0..19. `late` = days after the promised date it was finished (negative = early).
const LATE = [0, -1, 0, 2, 0, 0, 1, -2, 0, 3, 0, 0, 4, 0, -1, 1, 0, 0, 2, 0];
const DONE_AGO = [48, 46, 44, 42, 40, 38, 36, 34, 32, 30, 28, 26, 24, 22, 20, 18, 16, 14, 12, 10];
const THIRD_PARTY = new Set([4, 10, 16]);
const SKUS = [['SMP-LAMP-A', 'Pendant Light'], ['SMP-LAMP-B', 'Wall Light'], ['SMP-FAN-A', 'Ceiling Fan'], ['SMP-CHAN-A', 'Chandelier']];
const FORECAST_ERR = [2, -1, 0, 3]; // jobs 0..3: finished this many days after the forecast
export const JOB_SPEC = LATE.map((late, i) => ({ i, late, doneAgo: DONE_AGO[i], targetAgo: DONE_AGO[i] + late, thirdParty: THIRD_PARTY.has(i), install: i % 2 === 1, sku: SKUS[i % 4][0] }));

// `doneHour`: the clock hour the jobs are stamped finished at (15 = 3 PM). A late evening value (21) is the regression case
// for comparing a finish TIME with a promised DATE.
export async function seedDeliverySample({ db, raw, store, today = new Date(), doneHour = 15 }) {
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dayAgo = (n) => new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - n);
  const at = (n, h = 15, m = 0) => zohoNow(new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - n, h, m, 0));
  const set = (table, id, cols) => {
    const names = Object.keys(cols);
    return db.query(`UPDATE "${table}" SET ${names.map((c, k) => `"${c}" = $${k + 1}`).join(', ')} WHERE "ID"::text = $${names.length + 1}`, [...names.map((c) => cols[c]), String(id)]);
  };

  for (const [sku, category] of SKUS) await raw.addRecord('Items', { SKU: sku, item_name: sku, category });
  await raw.addRecord('Items', { SKU: 'SMP-MISC', item_name: 'No category item' });

  const lineFor = (sku, qty, pac) => [{ Item_Name: sku, SKU: sku, Quantity: qty, PAC: pac }];
  let n = 0;
  async function job({ type, status, targetAgo, doneAgo, createdAgo, sku, qty = 2, installer, third = false, extra = {}, migrated = false }) {
    n++;
    const target = targetAgo == null ? '' : ymd(dayAgo(targetAgo));
    const fields = {
      Sales_Order: `SMP-SO-${String(n).padStart(3, '0')}`, Type_of_Delivery: type, Appointment_Status: 'Scheduled', Contact: '09170000000',
      Customer_Address: 'Makati City', Item_Details: lineFor(sku, qty, `SMP-PAC-${n}`), Requested_Delivery_Date: target, ...extra,
    };
    if (installer) Object.assign(fields, { Installer: installer, Confirmed_Schedule_Date: target || ymd(dayAgo(doneAgo)), Suggested_Schedule_Date: target || ymd(dayAgo(doneAgo)), Calendar_Entry_Created: true });
    const id = await store.addRecord('Service_Appointment_Form', fields, 'sample-data');
    if (status !== 'Scheduled') await store.updateRecord('Service_Appointment_Form', id, { Appointment_Status: status }, { byForm: true }); // through the hooks: the Job status chain stamps Job_Done_At
    if (third) await raw.updateRecord('Service_Appointment_Form', id, { Fleet_Decision: '3rd Party' }, { byForm: true });
    const cols = {};
    if (migrated) { cols.Added_Time = null; cols.Job_Done_At = null; } // what a job migrated from Zoho looks like
    else { if (createdAgo != null) cols.Added_Time = at(createdAgo, 9); if (doneAgo != null) cols.Job_Done_At = at(doneAgo, doneHour); }
    if (Object.keys(cols).length) await set('Service_Appointment_Form', id, cols);
    return id;
  }

  // the 20 measured jobs (through the real Job status chain: Scheduled -> Completed stamps the job done)
  const ids = [];
  for (const j of JOB_SPEC) {
    const forecast = j.i < FORECAST_ERR.length ? { Forecast_Delivery: ymd(dayAgo(j.doneAgo + FORECAST_ERR[j.i])) } : {};
    const id = await job({
      type: j.install ? 'With Installation' : 'Delivery Only', status: 'Completed', targetAgo: j.targetAgo, doneAgo: j.doneAgo, createdAgo: j.doneAgo + 6,
      sku: j.sku, installer: j.thirdParty ? '' : (j.i % 4 < 2 ? 'CJ' : 'Edmon'), third: j.thirdParty, extra: forecast,
    });
    ids.push(id);
  }
  // jobs 0 and 2 are drop-offs on the SAME team-day (CJ, same date) -> 7 drop-offs on 6 team-days
  await set('Service_Appointment_Form', ids[2], { Installer: 'CJ', Confirmed_Schedule_Date: ymd(dayAgo(JOB_SPEC[0].targetAgo)) });
  // installs must be on 10 DIFFERENT team-days: CJ/Edmon alternate and every date is different already (targets differ)

  // failed jobs: one damaged in transit (all its units count as damaged), one not home; and the redelivery of the second
  const failedDamaged = await job({ type: 'Delivery Only', status: 'Failed', targetAgo: 6, doneAgo: 2, createdAgo: 9, sku: 'SMP-LAMP-A', qty: 2, extra: { Failure_Reason_Code: 'damaged_in_transit' } });
  const failedHome = await job({ type: 'Delivery Only', status: 'Failed', targetAgo: 7, doneAgo: 3, createdAgo: 10, sku: 'SMP-FAN-A', qty: 1, extra: { Failure_Reason_Code: 'not_home' } });
  await job({ type: 'Delivery Only', status: 'Completed', targetAgo: null, doneAgo: 1, createdAgo: 2, sku: 'SMP-FAN-A', qty: 1, extra: { Rescheduled_From_SA: String(failedHome) } });
  // migrated from Zoho: finished, but no created date and no finish date; "Delivered" is the Zoho-era status
  await job({ type: 'Delivery Only', status: 'Completed', targetAgo: 20, doneAgo: null, sku: 'SMP-MISC', qty: 1, migrated: true });
  await job({ type: 'Delivery Only', status: 'Delivered', targetAgo: 30, doneAgo: null, sku: 'SMP-MISC', qty: 1, migrated: true });
  // 3 open jobs
  await job({ type: 'Delivery Only', status: 'Scheduled', targetAgo: -2, createdAgo: 3, sku: 'SMP-LAMP-A', qty: 1 });
  await job({ type: 'Delivery Only', status: 'Scheduled', targetAgo: -4, createdAgo: 2, sku: 'SMP-LAMP-B', qty: 1 });
  await job({ type: 'With Installation', status: 'Scheduled', targetAgo: -6, createdAgo: 1, sku: 'SMP-CHAN-A', qty: 1 });

  // returns: damaged (counted), damaged but already counted through its failed job (skipped), received Good (ignored)
  await raw.addRecord('Sales_Returns_Form', { Sales_Order: 'SMP-SO-RET1', Received_Condition: 'Damaged', Received_At: at(5, 10), Items: [{ SKU: 'SMP-LAMP-B', Return_Quantity: 1 }] });
  await raw.addRecord('Sales_Returns_Form', { Sales_Order: 'SMP-SO-RET2', Source_SA_ID: String(failedDamaged), Received_Condition: 'Damaged', Received_At: at(1, 10), Items: [{ SKU: 'SMP-LAMP-A', Return_Quantity: 2 }] });
  await raw.addRecord('Sales_Returns_Form', { Sales_Order: 'SMP-SO-RET3', Received_Condition: 'Good', Received_At: at(4, 10), Items: [{ SKU: 'SMP-CHAN-A', Return_Quantity: 3 }] });

  // teams: today and each of the last 8 weekly points, 3 teams each
  for (let k = 0; k < 8; k++) {
    for (const [inst, drv, veh] of [['CJ', 'Judy', 'Traviz (NIB-3823)'], ['Edmon', 'Norman', 'Hino (NBX-1446)'], ['John Dave', 'Petz', 'Traviz (NKI-4969)']]) {
      await raw.addRecord('Daily_Team_Availability', { Availability_Date: ymd(dayAgo(k * 7)), Installer: inst, Driver: drv, Vehicle: veh, Availability_Status: 'Full Day', Max_Capacity_Hours: 8 });
    }
  }

  // Ship -> Service Request: package aggregated, then the SR created `gap` hours later
  const when = (daysAgo, hours) => { const d = new Date(t0.getFullYear(), t0.getMonth(), t0.getDate() - daysAgo, 9, 0, 0); d.setHours(d.getHours() + hours); return d; };
  async function pkg(so, pac, aggregatedAt) {
    const id = await raw.addRecord('Sales_Order_Fulfillment', { SO_No: so, Package: pac });
    if (aggregatedAt) await raw.addRecord('Stage_Events', { Record_Type: 'package', Record_Id: String(id), Event: 'package.order_aggregation', Occurred_At: zohoNow(aggregatedAt), Reported_At: zohoNow(aggregatedAt), Source: 'system' });
    return id;
  }
  async function sr(so, pacs, createdAt) {
    const id = await raw.addRecord('Service_Request1', { Sales_Order: so, Package_Number: pacs, SR_Status: 'New' });
    await set('Service_Request1', id, { Added_Time: createdAt ? zohoNow(createdAt) : null });
    return id;
  }
  const GAPS = [6, 30, 2, 24, 48, 5, 72, 12];
  for (const [k, gap] of GAPS.entries()) {
    const so = `SMP-SR-${k + 1}`, a = when(20 + k, 0);
    await pkg(so, `SMP-P${k + 1}`, a);
    await sr(so, `SMP-P${k + 1}`, when(20 + k, gap));
  }
  // one request with two packages: aggregated 10 h and 4 h before the request, so the gap counts from the LAST one (4 h)
  { const created = when(12, 0); await pkg('SMP-SR-M', 'SMP-PM1', when(12, -10)); await pkg('SMP-SR-M', 'SMP-PM2', when(12, -4)); await sr('SMP-SR-M', 'SMP-PM1, SMP-PM2', created); }
  await pkg('SMP-SR-NOEVENT', 'SMP-PN', null); await sr('SMP-SR-NOEVENT', 'SMP-PN', when(11, 0));            // package never logged as aggregated
  await pkg('SMP-SR-OLD', 'SMP-PO', when(30, 0)); await sr('SMP-SR-OLD', 'SMP-PO', null);                    // migrated: no Added_Time
  await pkg('SMP-SR-EARLY', 'SMP-PE', when(10, 0)); await sr('SMP-SR-EARLY', 'SMP-PE', when(10, -3));        // created before it was aggregated
  return { ids, failedDamaged, failedHome };
}
