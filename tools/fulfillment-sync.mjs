// Carries all existing Fulfillment data on to the next module: paid + package -> Order Readiness, Released -> Pick, Marked picked -> Pack & QC,
// and brings every package's stage up to where its records show it is. Safe to run any time; it only acts where a step is missing.
//   node --env-file=.env tools/fulfillment-sync.mjs        (BACKEND=pg, DATABASE_URL set; the Railway tunnel must be open)
import { createPool } from '../server/pg/pool.mjs';
import { createStore } from '../server/pg/store.mjs';
import { reconcileFulfillment } from '../server/modules/fulfillment/pipeline.mjs';

const pool = createPool();
try {
  const done = await reconcileFulfillment(createStore(pool), { user: 'fulfillment-sync' });
  console.log(`Fulfillment catch-up: ${done.gate} package(s) sent to Readiness, ${done.pick} to Pick, ${done.qc} to Pack & QC, ${done.stage} stage change(s).`);
} finally { await pool.end(); }
