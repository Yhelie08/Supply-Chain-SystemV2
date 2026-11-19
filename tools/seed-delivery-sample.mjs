// Loads the Delivery Analytics sample data (tools/delivery-sample-data.mjs) into the local dev:pg database, so
// Delivery Analytics, the backlog trend and the Ship -> Service Request gap have something to show.
//
//   1. stop `npm run dev:pg` (the local database can only be opened by one program at a time)
//   2. node tools/seed-delivery-sample.mjs            (uses ./data, or DATA_DIR, or --data-dir=<folder>)
//   3. npm run dev:pg
//
// It only runs on a database that has NO Service Appointments yet, and it never touches Railway: it opens
// <data dir>/pglite directly. Every row it adds starts with SMP- (sales orders, SKUs, packages), so it is easy to spot.
import path from 'node:path';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { seedDeliverySample, EXPECTED } from './delivery-sample-data.mjs';

const arg = process.argv.find((a) => a.startsWith('--data-dir='));
const dataDir = path.resolve(arg ? arg.slice('--data-dir='.length) : (process.env.DATA_DIR || 'data'));
const dbDir = path.join(dataDir, 'pglite');
fs.mkdirSync(dataDir, { recursive: true });
console.log(`[sample] using ${dbDir}`);

const db = await PGlite.create({ dataDir: dbDir });
await ensureSchema(db);
const { rows } = await db.query('SELECT count(*)::int AS n FROM "Service_Appointment_Form"');
if (rows[0].n > 0) {
  console.log(`[sample] this database already has ${rows[0].n} Service Appointment(s); nothing was added. Use an empty data folder (--data-dir=...).`);
  await db.close();
  process.exit(1);
}
const raw = createStore({ query: (s, p) => db.query(s, p), transaction: (f) => db.transaction(f) });
const store = createHookedStore(raw, workflows);
await seedDeliverySample({ db, raw, store });
await db.close();
console.log('[sample] done. Delivery Analytics should now show, as worked out by hand:');
console.log(`  #1 on-time ${EXPECTED.onTimePct}% (of ${EXPECTED.completedMeasured} measurable jobs), #9 ${EXPECTED.daysLateAvg} days late, #2 first-attempt full ${EXPECTED.firstAttemptFullPct}%`);
console.log(`  #6 own team ${EXPECTED.own.count} jobs / third party ${EXPECTED.thirdParty.count}; #7 ship->SR gap: ${EXPECTED.shipToSr.count} measured, average ${EXPECTED.shipToSr.avgHours} h, longest ${EXPECTED.shipToSr.maxHours} h`);
console.log(`  #3 damage: ${EXPECTED.damageTotals.damaged} of ${EXPECTED.damageTotals.handled} units; backlog today ${EXPECTED.backlogToday.openJobs} open jobs`);
process.exit(0);
