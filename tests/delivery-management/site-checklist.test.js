// Site Requirements Checklist (spec v1.4, Delivery 01): server/modules/delivery-management/site-checklist.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { checklistStatus, wiringBlocksInstall, permitPending, siteHoursWarning, crewSizeHint } from '../../server/modules/delivery-management/site-checklist.mjs';

const SA = 'Service_Appointment_Form';

// ---------- pure functions ----------
const row = (line, extra) => ({ Line: line, ...extra });

test('checklistStatus: empty checklist is missing all 11 gated lines, by name', () => {
  const { complete, missing } = checklistStatus([]);
  assert.equal(complete, false);
  assert.equal(missing.length, 11);
  assert.match(missing[0], /^1\. Electrical wiring ready/);
});

test('checklistStatus: a simple Yes/No/N/A line counts as answered with any of the three, not with anything else', () => {
  assert.equal(checklistStatus([row(1, { Status: 'Yes' })]).missing.some((m) => m.startsWith('1.')), false);
  assert.equal(checklistStatus([row(1, { Status: 'No' })]).missing.some((m) => m.startsWith('1.')), false);
  assert.equal(checklistStatus([row(1, { Status: 'N/A' })]).missing.some((m) => m.startsWith('1.')), false);
  assert.equal(checklistStatus([row(1, { Status: 'Maybe' })]).missing.some((m) => m.startsWith('1.')), true);
});

test('checklistStatus: permit (line 3) is answered by "No" alone, but "Yes" also needs the obtained status', () => {
  assert.equal(checklistStatus([row(3, { Detail: { Required: 'No' } })]).missing.some((m) => m.startsWith('3.')), false);
  assert.equal(checklistStatus([row(3, { Detail: { Required: 'Yes' } })]).missing.some((m) => m.startsWith('3.')), true);
  assert.equal(checklistStatus([row(3, { Detail: { Required: 'Yes', ObtainedStatus: 'Pending' } })]).missing.some((m) => m.startsWith('3.')), false);
});

test('checklistStatus: noisy hours (line 4) follows the same Required-then-detail shape', () => {
  assert.equal(checklistStatus([row(4, { Detail: { Restricted: 'No' } })]).missing.some((m) => m.startsWith('4.')), false);
  assert.equal(checklistStatus([row(4, { Detail: { Restricted: 'Yes', From: '10:00 PM', To: '6:00 AM' } })]).missing.some((m) => m.startsWith('4.')), false);
  assert.equal(checklistStatus([row(4, { Detail: { Restricted: 'Yes' } })]).missing.some((m) => m.startsWith('4.')), true);
});

test('checklistStatus: ceiling height (line 6) needs a number, not a Status', () => {
  assert.equal(checklistStatus([row(6, { Status: 'Yes' })]).missing.some((m) => m.startsWith('6.')), true);
  assert.equal(checklistStatus([row(6, { Detail: { Meters: '2.4' } })]).missing.some((m) => m.startsWith('6.')), false);
});

test('checklistStatus: site working hours (line 11) needs both a start and an end', () => {
  assert.equal(checklistStatus([row(11, { Detail: { Start: '8:00 AM' } })]).missing.some((m) => m.startsWith('11.')), true);
  assert.equal(checklistStatus([row(11, { Detail: { Start: '8:00 AM', End: '6:00 PM' } })]).missing.some((m) => m.startsWith('11.')), false);
});

test('checklistStatus: line 12 (boxes/lift) is never in the missing list — the gate is lines 1-11 only', () => {
  const { missing } = checklistStatus([]);
  assert.ok(!missing.some((m) => m.startsWith('12.')));
});

test('checklistStatus: complete once all 11 gated lines are answered, line 12 still unanswered', () => {
  const rows = [1, 2, 5, 7, 8, 9, 10].map((id) => row(id, { Status: 'Yes' }))
    .concat([row(3, { Detail: { Required: 'No' } }), row(4, { Detail: { Restricted: 'No' } }), row(6, { Detail: { Meters: '2.4' } }), row(11, { Detail: { Start: '8:00 AM', End: '6:00 PM' } })]);
  assert.equal(checklistStatus(rows).complete, true);
});

test('wiringBlocksInstall: blocks an installation when line 1 is No, never a Drop-off', () => {
  const notReady = [row(1, { Status: 'No' })];
  assert.equal(wiringBlocksInstall(notReady, 'With Installation'), true);
  assert.equal(wiringBlocksInstall(notReady, 'Full-Day Install'), true);
  assert.equal(wiringBlocksInstall(notReady, 'Multi-Day Install'), true);
  assert.equal(wiringBlocksInstall(notReady, 'Delivery Only'), false, 'a drop-off can still go ahead (SR-R1b)');
  assert.equal(wiringBlocksInstall([row(1, { Status: 'Yes' })], 'With Installation'), false);
  assert.equal(wiringBlocksInstall([], 'With Installation'), false, 'unanswered is caught by SR-R2, not this rule');
});

test('permitPending (SR-R4): true only when Required is Yes and ObtainedStatus is still Pending', () => {
  assert.equal(permitPending([row(3, { Detail: { Required: 'No' } })]), false);
  assert.equal(permitPending([row(3, { Detail: { Required: 'Yes', ObtainedStatus: 'Obtained' } })]), false);
  assert.equal(permitPending([row(3, { Detail: { Required: 'Yes', ObtainedStatus: 'Pending' } })]), true);
  assert.equal(permitPending([]), false);
});

test('siteHoursWarning (SR-R5): blank when the window fits or line 11 is unanswered, a message when it is too short', () => {
  assert.equal(siteHoursWarning([], 'With Installation'), '');
  assert.equal(siteHoursWarning([row(11, { Detail: { Start: '8:00 AM' } })], 'With Installation'), '', 'no End yet: nothing to compare');
  // With Installation needs 4h (defaultDuration): an 8am-11am window (3h) is too short.
  assert.match(siteHoursWarning([row(11, { Detail: { Start: '8:00 AM', End: '11:00 AM' } })], 'With Installation'), /shorter than this job's 4h/);
  // An 8am-6pm window (10h) comfortably fits.
  assert.equal(siteHoursWarning([row(11, { Detail: { Start: '8:00 AM', End: '6:00 PM' } })], 'With Installation'), '');
});

test('crewSizeHint (SR-R6): 4-person when nobody is on site to help, or when there is no lift and boxes pass the threshold', () => {
  const policy = () => null; // every default
  assert.equal(crewSizeHint([row(8, { Status: 'Yes' }), row(12, { Detail: { Lift: 'Yes', BoxCount: '20' } })], policy), '2-person');
  assert.equal(crewSizeHint([row(8, { Status: 'No' }), row(12, { Detail: { Lift: 'Yes', BoxCount: '1' } })], policy), '4-person', 'nobody on site, even with a lift');
  assert.equal(crewSizeHint([row(8, { Status: 'Yes' }), row(12, { Detail: { Lift: 'No', BoxCount: '10' } })], policy), '4-person', 'no lift, at the default threshold');
  assert.equal(crewSizeHint([row(8, { Status: 'Yes' }), row(12, { Detail: { Lift: 'No', BoxCount: '9' } })], policy), '2-person', 'no lift, under the threshold');
  const lowThreshold = (k) => (k === 'delivery_heavy_box_threshold' ? '3' : null);
  assert.equal(crewSizeHint([row(8, { Status: 'Yes' }), row(12, { Detail: { Lift: 'No', BoxCount: '5' } })], lowThreshold), '4-person', 'policy override honoured');
});

// ---------- integration: the hook on Service_Appointment_Form ----------
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { await db.query(`DELETE FROM "${SA}"`); });

const complete11 = [1, 2, 5, 7, 8, 9, 10].map((id) => row(id, { Status: 'Yes' }))
  .concat([row(3, { Detail: { Required: 'No' } }), row(4, { Detail: { Restricted: 'No' } }), row(6, { Detail: { Meters: '2.4' } }), row(11, { Detail: { Start: '8:00 AM', End: '6:00 PM' } })]);

test('Checklist_Complete and Checklist_Missing_Lines are computed on every save, even without touching Site_Confirmation_Status', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(r.Checklist_Complete, false);
  assert.match(r.Checklist_Missing_Lines, /1\. Electrical wiring/);
});

test('SR-R2: confirming the site is refused while the checklist is incomplete, naming the missing lines', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await assert.rejects(
    () => store.updateRecord(SA, id, { Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'Spoke to customer' }, { byForm: true }),
    (e) => /checklist is not complete/.test(e.message) && /Electrical wiring/.test(e.message),
  );
});

test('SR-R2: confirming goes through once lines 1-11 are all answered', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Site_Checklist: complete11 });
  await store.updateRecord(SA, id, { Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'Spoke to customer' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Site_Confirmation_Status, 'Confirmed');
});

test('SR-R1b: an installation with wiring not ready cannot be confirmed, even with every other line answered', async () => {
  const notReady = complete11.map((r2) => (r2.Line === 1 ? { ...r2, Status: 'No' } : r2));
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation', Site_Checklist: notReady });
  await assert.rejects(
    () => store.updateRecord(SA, id, { Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'Spoke to customer' }, { byForm: true }),
    /Wiring is not ready/,
  );
});

test('SR-R1b: a drop-off is NOT blocked by wiring not ready — only installation jobs are', async () => {
  const notReady = complete11.map((r2) => (r2.Line === 1 ? { ...r2, Status: 'No' } : r2));
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Site_Checklist: notReady });
  await store.updateRecord(SA, id, { Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'Spoke to customer' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Site_Confirmation_Status, 'Confirmed');
});

test('SR-R4: a permit still Pending does NOT block site confirmation (only a warning at this stage, per the spec)', async () => {
  const pendingPermit = complete11.map((r2) => (r2.Line === 3 ? { ...r2, Detail: { Required: 'Yes', ObtainedStatus: 'Pending' } } : r2));
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Site_Checklist: pendingPermit });
  await store.updateRecord(SA, id, { Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Call', Site_Confirmation_Notes: 'Spoke to customer' }, { byForm: true });
  assert.equal((await raw.getRecordById(SA, id, { raw: true })).Site_Confirmation_Status, 'Confirmed');
});

test('Site_Hours_Warning and Suggested_Crew_Size are stamped on every save', async () => {
  const rows = complete11.map((r2) => (r2.Line === 8 ? { ...r2, Status: 'No' } : r2)).concat([row(12, { Detail: { Lift: 'No', BoxCount: '1' } })]);
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'With Installation', Site_Checklist: rows });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(r.Site_Hours_Warning, ''); // 8am-6pm fits a 4h installation
  assert.equal(r.Suggested_Crew_Size, '4-person'); // nobody on site to help
});

test('a widget cannot type Checklist_Complete directly; it always follows the real checklist', async () => {
  const id = await store.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  await store.updateRecord(SA, id, { Checklist_Complete: true, Checklist_Missing_Lines: '' }, { byForm: true });
  const r = await raw.getRecordById(SA, id, { raw: true });
  assert.equal(r.Checklist_Complete, false, 'the server recomputed it from the (still empty) checklist, not the typed value');
});
