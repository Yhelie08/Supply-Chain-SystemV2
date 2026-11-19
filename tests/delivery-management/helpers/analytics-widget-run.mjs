// Helper for analytics-sample.test.js: builds the sample data set in an in-memory database, runs the REAL Delivery
// Analytics widget in jsdom with its SDK calls going to the real server code, and prints what the dashboard shows as JSON.
// Run as a child process so the test can try several time zones (TZ is read when node starts).
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../../server/pg/schema.mjs';
import { createStore } from '../../../server/pg/store.mjs';
import { createHookedStore } from '../../../server/workflows/index.mjs';
import { workflows } from '../../../server/workflows/all.mjs';
import { apis } from '../../../server/modules/delivery-management/apis.mjs';
import { seedDeliverySample } from '../../../tools/delivery-sample-data.mjs';

const db = new PGlite(); await ensureSchema(db);
const raw = createStore({ query: (s, p) => db.query(s, p), transaction: (f) => db.transaction(f) });
const store = createHookedStore(raw, workflows);
await seedDeliverySample({ db, raw, store, doneHour: Number(process.env.DONE_HOUR) || 15 });

const MAP = { Service_Appointment: 'Service_Appointment_Form', Field_Work_Report: 'Field_Work', All_DMS_Exception_Queue: 'DMS_Exception_Queue' };
const html = fs.readFileSync('modules/Delivery Management/Delivery Analytics/app/index.html', 'utf8')
  .replace(/<script src="https:\/\/js\.zohostatic[^>]*><\/script>/, '').replace(/<link rel="stylesheet" href="[^"]*">/g, '');
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
  beforeParse(w) {
    w.console.error = (...a) => errors.push(a.map(String).join(' ').slice(0, 200));
    w.ZOHO = { CREATOR: { DATA: {
      getRecords: async ({ report_name }) => ({ code: 3000, data: await raw.find(MAP[report_name] || report_name) }),
      invokeCustomApi: async ({ api_name, payload }) => ({ code: 3000, result: await apis[api_name](payload, raw) }),
    } }, UTIL: {} };
  },
});
await new Promise((r) => setTimeout(r, 4500));
const doc = dom.window.document;
const text = (id) => (doc.getElementById(id)?.textContent || '').replace(/\s+/g, ' ').trim();
const tiles = (id) => [...doc.querySelectorAll(`#${id} .kpi`)].map((k) => [k.querySelector('.lbl, .k, .label')?.textContent?.trim() || '', k.querySelector('.val')?.textContent?.trim() || '']);
console.log(JSON.stringify({
  tz: process.env.TZ || '', errors,
  keyNumbers: tiles('statsKeyNumbers'), teamDay: tiles('statsKeyNumbersTeamDay'), fleet: tiles('statsKeyNumbersFleet'),
  keyNumbersNote: text('keyNumbersNote'), shipToSr: tiles('statsShipToSr'), shipToSrNote: text('shipToSrNote'),
  damageChart: text('chDamageCategory'), damageNote: text('damageNote'), backlogTrend: text('chBacklogTrend'), backlog: tiles('statsBacklog'),
}));
process.exit(0);
