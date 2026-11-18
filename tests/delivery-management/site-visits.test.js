// Field Service Site Visits (spec v1.4, Delivery 08 §1, SV-R2/R3): server/modules/delivery-management/site-visits.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';

const SA = 'Service_Appointment_Form';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { await db.query(`DELETE FROM "${SA}"`); });

const CHECKLIST_NO_WIRING = [1, 2, 5, 7, 8, 9, 10].map((id) => ({ Line: id, Status: id === 1 ? 'No' : 'Yes' })).concat([
  { Line: 3, Detail: { Required: 'No' } }, { Line: 4, Detail: { Restricted: 'No' } },
  { Line: 6, Detail: { Meters: '2.4' } }, { Line: 11, Detail: { Start: '8:00 AM', End: '6:00 PM' } },
]);
const CHECKLIST_WIRING_READY = CHECKLIST_NO_WIRING.map((r) => (r.Line === 1 ? { ...r, Status: 'Yes' } : r));

test('SV-R2: an installation appointment for the same SO inherits the site visit\'s checklist', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Site Visit', Site_Checklist: CHECKLIST_WIRING_READY });
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.deepEqual(r.Site_Checklist.map((x) => x.Line).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.ok(!r.Site_Visit_Blocking_Findings);
});

test('SV-R3: wiring not ready at the site visit is carried over as a blocking finding for the sales agent', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Site Visit', Site_Checklist: CHECKLIST_NO_WIRING });
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.match(r.Site_Visit_Blocking_Findings, /[Ww]iring not ready/);
});

test('never overwrites an installation appointment that already has its own checklist answers', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Site Visit', Site_Checklist: CHECKLIST_NO_WIRING });
  const ownAnswers = [{ Line: 1, Status: 'Yes' }];
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation', Site_Checklist: ownAnswers });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.deepEqual(r.Site_Checklist.map((x) => ({ Line: x.Line, Status: x.Status })), ownAnswers);
});

test('a drop-off (not an installation type) never gets the carry-over', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Site Visit', Site_Checklist: CHECKLIST_WIRING_READY });
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.deepEqual(r.Site_Checklist, []);
});

test('no matching site visit for that Sales Order: nothing happens', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-NEW', Type_of_Delivery: 'With Installation' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.deepEqual(r.Site_Checklist, []);
  assert.ok(!r.Site_Visit_Blocking_Findings);
});

test('two site visits for the same SO: the most recent one\'s checklist is carried over', async () => {
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Site Visit', Site_Checklist: CHECKLIST_NO_WIRING });
  await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Site Visit', Site_Checklist: CHECKLIST_WIRING_READY });
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.ok(!r.Site_Visit_Blocking_Findings, 'the later visit (wiring ready) wins over the earlier one');
});
