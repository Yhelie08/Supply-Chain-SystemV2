// Truck Maintenance (spec v1.4, Delivery 08 §2, TK-R2-R4): server/modules/delivery-management/truck-maintenance.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { recordMaintenance, markVehicleDown, markVehicleFixed, checkMaintenanceDue } from '../../server/modules/delivery-management/truck-maintenance.mjs';

const SA = 'Service_Appointment_Form';
const AVAIL = 'Daily_Team_Availability';
const STATUS = 'Vehicle_Status';
const LOG = 'Vehicle_Maintenance_Log';
const EXC = 'DMS_Exception_Queue';
let db, raw;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of [SA, AVAIL, STATUS, LOG, EXC, 'Policy_Settings']) await db.query(`DELETE FROM "${f}"`); });

test('recordMaintenance (TK-R4): logs the entry and advances Last_Service_KM/Date on a new Vehicle_Status row', async () => {
  await recordMaintenance(raw, { vehicle: 'Hino (NBX-1446)', type: 'Oil change', date: '2027-01-01', km: 40000, shop: 'Shop A', cost: 1500, receipts: '/r/1.jpg' });
  const [log] = await raw.find(LOG);
  assert.equal(log.Type, 'Oil change');
  assert.equal(Number(log.Cost), 1500);
  const [v] = await raw.find(STATUS, (r) => r.Vehicle === 'Hino (NBX-1446)');
  assert.equal(Number(v.Last_Service_KM), 40000);
  assert.equal(v.Last_Service_Date, '2027-01-01');
  assert.equal(v.Status, 'Active');
});

test('recordMaintenance: an older backfilled entry never overwrites a newer Last_Service already on file', async () => {
  await recordMaintenance(raw, { vehicle: 'Hino (NBX-1446)', type: 'Oil change', date: '2027-02-01', km: 45000 });
  await recordMaintenance(raw, { vehicle: 'Hino (NBX-1446)', type: 'Backfilled old receipt', date: '2027-01-01', km: 40000 });
  const [v] = await raw.find(STATUS, (r) => r.Vehicle === 'Hino (NBX-1446)');
  assert.equal(Number(v.Last_Service_KM), 45000);
  assert.equal(v.Last_Service_Date, '2027-02-01');
});

test('markVehicleDown (TK-R3): removes only future team-days for that vehicle, flags open jobs on those days, past days untouched', async () => {
  await raw.addRecord(AVAIL, { Availability_Date: '2020-01-01', Installer: 'CJ', Vehicle: 'Hino (NBX-1446)', Availability_Status: 'Full Day' }); // long past
  const futureId = await raw.addRecord(AVAIL, { Availability_Date: '2099-01-01', Installer: 'CJ', Vehicle: 'Hino (NBX-1446)', Availability_Status: 'Full Day' });
  const otherVehicleId = await raw.addRecord(AVAIL, { Availability_Date: '2099-01-01', Installer: 'Edmon', Vehicle: 'Traviz (NIB-3823)', Availability_Status: 'Full Day' });
  const job = await raw.addRecord(SA, { Sales_Order: 'SO-1', Installer: 'CJ', Confirmed_Schedule_Date: '2099-01-01', Appointment_Status: 'Scheduled' });

  const result = await markVehicleDown(raw, 'Hino (NBX-1446)', { reason: 'Flat tire' });
  assert.equal(result.affectedTeamDays, 1);
  assert.deepEqual(result.affectedJobs.map(String), [String(job)]);

  assert.equal((await raw.getRecordById(AVAIL, futureId, { raw: true })).Availability_Status, 'Not Available');
  const pastRow = (await raw.find(AVAIL, (r) => r.Availability_Date === '2020-01-01'))[0];
  assert.equal(pastRow.Availability_Status, 'Full Day', 'a day already in the past is never touched');
  assert.equal((await raw.getRecordById(AVAIL, otherVehicleId, { raw: true })).Availability_Status, 'Full Day', 'another vehicle is unaffected');

  const [exc] = await raw.find(EXC, (r) => String(r.Sales_Order_Reference) === String(job));
  assert.equal(exc.Exception_Stage, 'Fleet');
  assert.match(exc.Exception_Reason, /Flat tire/);

  const [status] = await raw.find(STATUS, (r) => r.Vehicle === 'Hino (NBX-1446)');
  assert.equal(status.Status, 'Down');
  assert.equal(status.Down_Reason, 'Flat tire');
});

test('markVehicleFixed: restores only the rows markVehicleDown itself changed, not a day marked unavailable for an unrelated reason', async () => {
  const taggedId = await raw.addRecord(AVAIL, { Availability_Date: '2099-01-01', Installer: 'CJ', Vehicle: 'Hino (NBX-1446)', Availability_Status: 'Full Day' });
  const handEditedId = await raw.addRecord(AVAIL, { Availability_Date: '2099-01-02', Installer: 'CJ', Vehicle: 'Hino (NBX-1446)', Availability_Status: 'Not Available', Notes: 'CJ on leave' });
  await markVehicleDown(raw, 'Hino (NBX-1446)', { reason: 'Engine trouble' });

  const result = await markVehicleFixed(raw, 'Hino (NBX-1446)');
  assert.equal(result.restoredTeamDays, 1);
  assert.equal((await raw.getRecordById(AVAIL, taggedId, { raw: true })).Availability_Status, 'Full Day');
  assert.equal((await raw.getRecordById(AVAIL, handEditedId, { raw: true })).Availability_Status, 'Not Available', 'untagged row is left alone');
  const [status] = await raw.find(STATUS, (r) => r.Vehicle === 'Hino (NBX-1446)');
  assert.equal(status.Status, 'Active');
});

test('markVehicleDown: refuses with no reason', async () => {
  await assert.rejects(markVehicleDown(raw, 'Hino (NBX-1446)', {}), /reason is required/);
});

test('checkMaintenanceDue (TK-R2): warns by date within maintenance_warn_days, and by km within the buffer of the interval', async () => {
  await raw.addRecord(STATUS, { Vehicle: 'Due-By-Date', Next_Service_Due_Date: '2027-01-03' });
  await raw.addRecord(STATUS, { Vehicle: 'Due-By-KM', Current_KM: 44800, Last_Service_KM: 40000, Interval_KM: 5000 }); // 200 short of due, within the 300 buffer
  await raw.addRecord(STATUS, { Vehicle: 'Not-Due', Current_KM: 41000, Last_Service_KM: 40000, Interval_KM: 5000 });

  const now = new Date(2027, 0, 1); // 1 Jan 2027, warnDays default 7 -> warnBy 8 Jan
  const result = await checkMaintenanceDue(raw, { now });
  assert.equal(result.warned, 2);
  const reasons = (await raw.find(EXC)).map((e) => e.Exception_Reason);
  assert.ok(reasons.some((r) => r.includes('Due-By-Date') && r.includes('due by date')));
  assert.ok(reasons.some((r) => r.includes('Due-By-KM') && r.includes('due by km')));
  assert.ok(!reasons.some((r) => r.includes('Not-Due')));

  const again = await checkMaintenanceDue(raw, { now });
  assert.equal(again.warned, 0, 'the same open warnings are not raised twice');
});
