// The Decisions list (Approval Queue), the Procurement settings (Control Panel) and the target-date reason (spec v1.4), on PGlite.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { runShipmentLadder, rescoreShipments } from '../server/modules/procurement/ship-track.mjs';
import { preview_procurement_setting, recalculate_shipments } from '../server/modules/procurement/settings-hooks.mjs';
import { escalateOverdue } from '../server/modules/procurement/decisions-core.mjs';
import { loadSettings } from '../server/modules/procurement/plan.mjs';
import { DEFS, SETTING_DEFS } from '../server/modules/procurement/settings-defs.mjs';
import { addDays, ymd, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Order', 'Shipments', 'Receiving', 'Sales_Order', 'Sales_Order_Fulfillment', 'Purchase_Request1', 'Stage_Events', 'Ladder_Events', 'Approval_Queue', 'App_Notifications', 'Procurement_Settings', 'Procurement_Settings_History', 'Target_Date_Changes', 'Suppliers', 'Forecast_Settings'];
let db, raw, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); await db.query('DELETE FROM _number_series'); await useSpecNumbers(raw); });
// The spec's worked numbers (LCL 30, Air 14, fulfillment 3, delivery 2) as saved Procurement Settings rows, so the arithmetic of these tests is the spec's.
const SPEC_ROWS = { transit_lcl_min_days: 30, transit_lcl_max_days: 30, transit_fcl_min_days: 30, transit_fcl_max_days: 30, transit_air_min_days: 14, transit_air_max_days: 14,
  customs_lcl_min_days: 0, customs_lcl_max_days: 0, customs_fcl_min_days: 0, customs_fcl_max_days: 0, customs_air_min_days: 0, customs_air_max_days: 0, fulfillment_days: 3, delivery_days: 2 };
async function useSpecNumbers(rawStore) { for (const [k, v] of Object.entries(SPEC_ROWS)) await rawStore.addRecord('Procurement_Settings', { Setting_Key: k, Value: String(v) }); }
const rowOf = async (rawStore, key) => (await rawStore.find('Procurement_Settings', (r) => r.Setting_Key === key))[0];


const today = todayDate();
const day = (n) => ymd(addDays(today, n));
const rejects = (fn, re) => assert.rejects(fn, (e) => re.test(e.message));
const line = { PR_No: 'PR-1', SKU: 'L-1', Item: 'Lamp', QTY: 2, Supplier: 'Tony Fan', Line_Total: 10, Shipping_Mode: 'LCL' };
async function shipment({ poDays = -2, soDays = -60, target = 30, so = 'SO-1' } = {}) {
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: so, SO_Created_Date: day(soDays) });
  const poId = await store.addRecord('Purchase_Order', { Customer: 'C', PO_Date: day(poDays), PO_Line_Items: [line] });
  return store.addRecord('Shipments', { PO_No: poId, Sales_Order: so, Supplier: 'Tony Fan', Target_Date: day(target), PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Ordered_QTY: 2, Shipment_QTY: 2, Shipping_Mode: 'LCL' }] });
}
const get = (id) => raw.getRecordById('Shipments', id, { raw: true });
const items = (kind) => raw.find('Approval_Queue', (i) => !kind || i.Kind === kind);
const as = (user) => ({ user });

// ---------- the Procurement settings ----------
test('every setting in the catalogue has a label, a default inside its limits and a sentence on what it affects', () => {
  for (const d of SETTING_DEFS) {
    assert.ok(d.label && d.group && d.affects, d.key);
    if (d.type === 'days' || d.type === 'hours') { assert.ok(d.default >= d.min && d.default <= d.max, `${d.key} default is inside its limits`); }
  }
  assert.equal(new Set(SETTING_DEFS.map((d) => d.key)).size, SETTING_DEFS.length);
});

test('a setting row is validated: a typo outside the limits is refused with a plain message (CP-R6)', async () => {
  await db.query('DELETE FROM "Procurement_Settings"');
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'transit_lcl_max_days', Value: '800' }), /outside the allowed range \(1 to 200\)/);
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'transit_lcl_max_days', Value: 'abc' }), /enter a number/);
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'nonsense', Value: '3' }), /not a Procurement setting/);
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'forecast_reanchor', Value: 'maybe' }), /choose yes or no/);
  assert.equal((await raw.find('Procurement_Settings')).length, 0);
});

test('the ladder days must keep going up (rung 1 < rung 2 < rung 3)', async () => {
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'ladder_rung1_days', Value: '5' }), /must go up/);
});

test('a change is written to the history with who, old, new, and what it did; a second row for the same key is refused', async () => {
  const sh = await shipment({ poDays: -1 });
  const before = (await get(sh)).Arrival_Planned;
  const row = await rowOf(raw, 'transit_lcl_max_days'); // the spec rows set it to 30
  await rejects(() => store.addRecord('Procurement_Settings', { Setting_Key: 'transit_lcl_max_days', Value: '40' }), /already has a row/);
  await store.updateRecord('Procurement_Settings', row.ID, { Value: '45', Change_Reason: 'new forwarder' }, as('admin@x'));
  await store.updateRecord('Procurement_Settings', row.ID, { Value: '40' }, as('admin@x'));
  const h = (await raw.find('Procurement_Settings_History')).sort((a, b) => Number(a.ID) - Number(b.ID));
  assert.deepEqual(h.map((x) => [x.Setting_Key, x.Old_Value, x.New_Value]), [['transit_lcl_max_days', '30', '45'], ['transit_lcl_max_days', '45', '40']]);
  assert.equal(h[0].Changed_By, 'admin@x');
  assert.equal(h[0].Reason, 'new forwarder');
  assert.match(h[0].Effect, /re-scored/);
  // the new number is used by the plan the next time it is made: the middle of 30 and 40 days
  await store.updateRecord('Shipments', sh, { Notes: 'x' });
  assert.notEqual((await get(sh)).Arrival_Planned, before);
  assert.equal((await loadSettings(raw)).transit_lcl_days, 35);
});

test('the shortest transit cannot be more than the longest', async () => {
  const min = await rowOf(raw, 'transit_lcl_min_days');
  await rejects(() => store.updateRecord('Procurement_Settings', min.ID, { Value: '40' }), /shortest \(40\) cannot be more than the longest \(30\)/);
});

test('deleting a row means the default again, and that is in the history too', async () => {
  const id = await store.addRecord('Procurement_Settings', { Setting_Key: 'receiving_days', Value: '5' });
  await store.deleteRecord('Procurement_Settings', id, { user: 'admin@x' });
  assert.equal((await loadSettings(raw)).receiving_days, 2);
  const h = await raw.find('Procurement_Settings_History', (x) => x.Reason === 'Back to the default');
  assert.equal(h.length, 1);
  assert.equal(h[0].New_Value, '2');
});

test('preview: shows how many open shipments would change category before anything is saved (CP-R4)', async () => {
  await shipment({ poDays: -2, target: 70 }); // 11 days of slack at 30 days of LCL
  await rescoreShipments(raw);
  const r = await preview_procurement_setting({ key: 'transit_lcl_max_days', value: 120 }, raw);
  assert.equal(r.status, 'success');
  assert.equal(r.moved_count, 1);
  assert.equal(r.after.act_now, 1);
  assert.equal((await rowOf(raw, 'transit_lcl_max_days')).Value, '30', 'nothing was saved');
  assert.equal((await preview_procurement_setting({ key: 'transit_lcl_max_days', value: 900 }, raw)).status, 'error');
  assert.match(r.message, /Fulfillment and Delivery too/);
});

test('Recalculate now re-reads the dates and ranks everything', async () => {
  await shipment();
  const r = await recalculate_shipments({}, raw);
  assert.equal(r.status, 'success');
  assert.equal(r.scored, 1);
});

test('a supplier\'s own production days (Suppliers form) are used when the shipment has no quoted lead time, matched by exact name', async () => {
  await raw.addRecord('Suppliers', { Supplier_Name: { first_name: 'Tony Fan', last_name: '' }, Default_Production_Days: 35, Is_Main_Supplier: true });
  const id = await shipment({ poDays: 0 });
  assert.equal((await get(id)).Production_End_Planned, day(1 + 35));
  await raw.addRecord('Suppliers', { Supplier_Name: { first_name: 'Tony', last_name: '' }, Default_Production_Days: 10 });
  await store.updateRecord('Shipments', id, { Notes: 'again' });
  assert.equal((await get(id)).Production_End_Planned, day(1 + 35), 'Tony is not Tony Fan: no substring matching');
});

test('ladder rung days come from the settings', async () => {
  await raw.addRecord('Procurement_Settings', { Setting_Key: 'ladder_rung1_days', Value: '2' });
  await raw.addRecord('Procurement_Settings', { Setting_Key: 'ladder_rung2_days', Value: '4' });
  await raw.addRecord('Procurement_Settings', { Setting_Key: 'ladder_rung3_days', Value: '6' });
  await shipment({ poDays: -2 }); // 1 day late: below rung 1 now
  await runShipmentLadder(raw, { today });
  assert.equal((await raw.find('Ladder_Events')).length, 0);
  await runShipmentLadder(raw, { today: addDays(today, 1) }); // 2 days late
  assert.deepEqual((await raw.find('Ladder_Events')).map((l) => Number(l.Rung)), [1]);
});

// ---------- the Decisions list ----------
test('an Act now shipment still in production gets one air_upgrade decision, with the numbers, once', async () => {
  const id = await shipment({ target: 30 });
  assert.equal((await get(id)).Category, 'act_now');
  const [it] = await items('air_upgrade');
  assert.equal(it.Status, 'pending');
  assert.deepEqual(JSON.parse(it.Options), ['upgrade_air', 'move_target', 'tell_customer']);
  assert.match(it.Summary, /By air it would save 16 days/);
  assert.ok(it.Due_At);
  await rescoreShipments(raw);
  assert.equal((await items('air_upgrade')).length, 1, 'not asked again');
});

test('deciding "upgrade_air" changes the mode, plans the dates again, stamps who decided, and cannot be decided twice', async () => {
  const id = await shipment({ target: 30 });
  const [it] = await items('air_upgrade');
  const before = (await get(id)).Arrival_Planned;
  await store.updateRecord('Approval_Queue', it.ID, { Decision: 'upgrade_air' }, as('buyer@x'));
  const s = await get(id);
  assert.equal(s.Shipment_Mode, 'Airfreight');
  assert.notEqual(s.Arrival_Planned, before);
  const d = (await items('air_upgrade'))[0];
  assert.equal(d.Status, 'decided');
  assert.equal(d.Decided_By, 'buyer@x');
  assert.equal(d.Decided_By_Type, 'human');
  assert.ok(d.Decided_At);
  assert.match(d.Result, /Changed to air/);
  await rejects(() => store.updateRecord('Approval_Queue', it.ID, { Decision: 'tell_customer' }), /already been decided/);
  assert.ok((await raw.find('Stage_Events', (e) => e.Event === 'shipment.mode_upgraded')).length === 1);
});

test('a decision cannot be typed, forged or deleted, and only the listed options are accepted', async () => {
  await shipment({ target: 30 });
  const [it] = await items('air_upgrade');
  await rejects(() => store.addRecord('Approval_Queue', { Kind: 'air_upgrade' }), /prepared by the system/);
  await rejects(() => store.deleteRecord('Approval_Queue', it.ID), /cannot be deleted/);
  await rejects(() => store.updateRecord('Approval_Queue', it.ID, { Decision: 'cancel_everything' }), /not one of the options/);
  await store.updateRecord('Approval_Queue', it.ID, { Status: 'decided', Decided_By: 'someone else', Result: 'fake' });
  const after = (await items('air_upgrade'))[0];
  assert.equal(after.Status, 'pending');
  assert.ok(!after.Decided_By && !after.Result);
});

test('"move the target" sends a forecast_promise_change; accepting it changes the target, logs why, and never happens by itself', async () => {
  const id = await shipment({ target: 30 });
  const oldTarget = (await get(id)).Target_Date;
  const [air] = await items('air_upgrade');
  await store.updateRecord('Approval_Queue', air.ID, { Decision: 'move_target' }, as('buyer@x'));
  assert.equal((await get(id)).Target_Date, oldTarget, 'the forecast alone does not move the promise (DT-5)');
  const [fp] = await items('forecast_promise_change');
  assert.equal(fp.Status, 'pending');
  const proposed = JSON.parse(fp.Payload).proposed_target;
  await store.updateRecord('Approval_Queue', fp.ID, { Decision: 'accept_target' }, as('sales@x'));
  assert.equal((await get(id)).Target_Date, proposed);
  const [ch] = await raw.find('Target_Date_Changes');
  assert.deepEqual([ch.Old_Date, ch.New_Date, ch.Changed_By, ch.Via], [oldTarget, proposed, 'sales@x', 'approval_queue']);
});

test('ladder day 3: the decision is recorded on the rung; "cancel and re-source" cancels nothing by itself', async () => {
  const id = await shipment({ poDays: -2 });
  await runShipmentLadder(raw, { today: addDays(today, 2) });
  const [it] = await items('ladder_day3');
  await store.updateRecord('Approval_Queue', it.ID, { Decision: 'cancel_resource' }, as('buyer@x'));
  const rung3 = (await raw.find('Ladder_Events', (l) => Number(l.Rung) === 3))[0];
  assert.deepEqual([rung3.Decision, rung3.Decided_By], ['cancel_resource', 'buyer@x']);
  assert.match((await items('ladder_day3'))[0].Result, /Nothing was cancelled by the system/);
  assert.equal((await get(id)).Stage, 'production');
});

test('AQ-4: when the record changes the item goes stale by itself (production started, or the supplier shipped)', async () => {
  const id = await shipment({ poDays: -2 });
  await runShipmentLadder(raw, { today: addDays(today, 2) });
  assert.equal((await items('ladder_day3'))[0].Status, 'pending');
  await store.updateRecord('Shipments', id, { Report_Event: 'production_started', Report_Occurred_At: day(-1) });
  assert.equal((await items('ladder_day3'))[0].Status, 'stale');
  assert.match((await items('ladder_day3'))[0].Result, /production has started/);
  const staleId = (await items('ladder_day3'))[0].ID;
  await rejects(() => store.updateRecord('Approval_Queue', staleId, { Decision: 'hold' }), /stale/);
  // shipped out: the air_upgrade item (if one was made) is stale too, none is left pending
  await store.updateRecord('Shipments', id, { Production_Photos: ['p.jpg'] });
  await store.updateRecord('Shipments', id, { Report_Event: 'shipped_out', Report_Occurred_At: day(-1) });
  assert.ok((await items('air_upgrade')).every((i) => i.Status !== 'pending'));
});

test('AQ-3: not decided within the hours it escalates once, with an alert', async () => {
  await shipment({ target: 30 });
  assert.equal(await escalateOverdue(raw, await loadSettings(raw), new Date()), 0);
  const later = new Date(Date.now() + 25 * 3600000);
  assert.equal(await escalateOverdue(raw, await loadSettings(raw), later), 1);
  assert.equal(await escalateOverdue(raw, await loadSettings(raw), later), 0, 'once');
  const [it] = await items('air_upgrade');
  assert.ok(it.Escalated_At);
  assert.equal((await raw.find('App_Notifications', (n) => n.Notification_Type === 'Decision Escalated')).length, 1);
});

test('the alert goes to the setting, not to a hard-coded address', async () => {
  await raw.addRecord('Procurement_Settings', { Setting_Key: 'procurement_alert_email', Value: 'buyer@example.test' });
  await shipment({ poDays: -2 });
  await runShipmentLadder(raw, { today });
  const n = await raw.find('App_Notifications', (x) => x.Notification_Type === 'Supplier Ladder');
  assert.ok(n.length >= 1 && n.every((x) => x.Recipient_Email === 'buyer@example.test'));
  assert.ok(DEFS.procurement_alert_email);
});

// ---------- DT-4: changing a promise ----------
test('changing the target date needs a reason, and is logged with the old and the new date (DT-4)', async () => {
  const id = await shipment({ target: 60 });
  const old = (await get(id)).Target_Date;
  await rejects(() => store.updateRecord('Shipments', id, { Target_Date: day(70) }), /reason for changing the target/);
  await store.updateRecord('Shipments', id, { Target_Date: day(70), Target_Change_Reason: 'Customer asked for later' }, as('agent@x'));
  assert.equal((await get(id)).Target_Date, day(70));
  const [ch] = await raw.find('Target_Date_Changes');
  assert.deepEqual([ch.Old_Date, ch.New_Date, ch.Reason, ch.Changed_By, ch.Via], [old, day(70), 'Customer asked for later', 'agent@x', 'person']);
  // saving the same date again needs no reason
  await store.updateRecord('Shipments', id, { Target_Date: day(70), Notes: 'same' });
  assert.equal((await raw.find('Target_Date_Changes')).length, 1);
});
