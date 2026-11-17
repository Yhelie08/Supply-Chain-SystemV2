// The Procurement Dashboard of the spec v1.4 (server/modules/procurement/dashboard.mjs), on PGlite with the raw store.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { get_procurement_dashboard } from '../server/modules/procurement/dashboard.mjs';
import { loadSettings, plannedChain } from '../server/modules/procurement/plan.mjs';
import { addDays, ymd, todayDate, parseDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Shipments', 'Purchase_Order', 'Purchase_Request1', 'Approval_Queue', 'Ladder_Events', 'Stage_Events', 'Receiving', 'Exceptions', 'Replacement_Request',
  'Package_Shipments', 'Exception_Control1', 'Procurement_Settings', 'Suppliers'];
let db, raw;
const day = (n) => ymd(addDays(todayDate(), n));
const dash = async () => (await get_procurement_dashboard({}, raw)).data;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });
const ship = (extra) => raw.addRecord('Shipments', { Supplier: 'Tony Fan', Shipment_Mode: 'LCL', Required_Days_Lead: 20, Stage: 'production', PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Shipment_QTY: 1 }], ...extra });

test('Today: the counts of Act now, Tell the customer and Broken, the decisions waiting, PRs needing a manual quote, POs not acknowledged, each with its link', async () => {
  await ship({ Shipment_No: 'S1', Category: 'act_now', Queue_Rank: 2, Priority_Reason: 'late', Suggested_Action: 'Call' });
  await ship({ Shipment_No: 'S2', Category: 'act_now', Queue_Rank: 3 });
  await ship({ Shipment_No: 'S3', Category: 'tell_customer', Queue_Rank: 4 });
  await ship({ Shipment_No: 'S4', Category: 'broken', Queue_Rank: 1 });
  await ship({ Shipment_No: 'S5', Category: 'act_now', Stage: 'received' }); // received: not counted
  for (const kind of ['air_upgrade', 'air_upgrade', 'ladder_day3']) await raw.addRecord('Approval_Queue', { Kind: kind, Status: 'pending' });
  await raw.addRecord('Approval_Queue', { Kind: 'air_upgrade', Status: 'decided' });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-1', Pricing_Status: 'needs_manual_quote', Pr_State: 'open' });
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-2', Pricing_Status: 'needs_manual_quote', Pr_State: 'cancelled' });
  await raw.addRecord('Purchase_Order', { PO_No: 'PO-1', Po_State: 'sent' });
  await raw.addRecord('Purchase_Order', { PO_No: 'PO-2', Po_State: 'acknowledged' });
  const t = (await dash()).today;
  assert.deepEqual([t.act_now.count, t.tell_customer.count, t.broken.count], [2, 1, 1]);
  assert.deepEqual([t.decisions.count, t.decisions.air_upgrade, t.decisions.ladder_day3], [3, 2, 1]);
  assert.equal(t.manual_quote.count, 1);
  assert.equal(t.pos_not_acknowledged.count, 1);
  assert.deepEqual(t.top.map((x) => x.no), ['S4', 'S1', 'S2'], 'Broken first, then Act now by rank');
  assert.deepEqual(t.act_now.link, { page: 'Shipments1', query: 'cat=act_now' });
  assert.deepEqual(t.manual_quote.link, { page: 'Purchase_Request', query: 'pricing=needs_manual_quote' });
  assert.deepEqual(t.pos_not_acknowledged.link, { page: 'Purchase_Order1', query: 'status=sent' });
  assert.equal(t.decisions.link.page, 'Decisions');
});

test('Born-late rate (acceptance): matches a manual count for one week of POs', async () => {
  const po = (no, date, raised, late, status = 'sent') => raw.addRecord('Purchase_Order', { PO_No: no, PO_Date: date, Lines_Raised: raised, Lines_Born_Late: late, PO_Status: status });
  await po('PO-1', day(0), 2, 1);
  await po('PO-2', day(0), 3, 0);
  await po('PO-3', day(0), 1, 1);
  await po('PO-4', day(0), 5, 5, 'Cancelled'); // cancelled: not counted
  await po('PO-5', day(-60), 4, 4);             // far outside the weeks shown
  const b = (await dash()).born_late;
  assert.deepEqual([b.raised, b.born_late, b.rate], [6, 2, 33.3], 'manual count: 2 of 6 lines = 33.3 %');
  assert.equal(b.weeks[0].rate, 33.3);
  assert.deepEqual(b.link, { page: 'Purchase_Order1', query: 'born=late' });
});

test('On-time arrival: against the PLANNED arrival worked out from the PO date and the settings, overall and by supplier', async () => {
  const settings = await loadSettings(raw);
  const poDate = day(-100);
  const planned = plannedChain(settings, { poDate: parseDate(poDate), productionDays: 20, mode: 'LCL' }).arrival;
  const at = (offset) => ymd(addDays(planned, offset));
  await ship({ Shipment_No: 'A', PO_Date: poDate, Stage: 'arrived_port', Arrived_Port_At: at(-2) });
  await ship({ Shipment_No: 'B', PO_Date: poDate, Stage: 'arrived_port', Arrived_Port_At: at(5), Arrival_Planned: at(5) }); // the stored plan was moved by a delay report: still late
  await ship({ Shipment_No: 'C', PO_Date: poDate, Stage: 'production' }); // not arrived: not counted
  await ship({ Shipment_No: 'D', PO_Date: poDate, Supplier: 'Fenteng Lighting', Stage: 'arrived_warehouse', Arrived_Warehouse_At: at(0), PO_Shipments: [{ SKU: 'a' }, { SKU: 'b' }] });
  const o = (await dash()).on_time;
  assert.deepEqual([o.lines, o.on_time, o.rate], [4, 3, 75]);
  assert.deepEqual(o.by_supplier.map((x) => [x.supplier, x.lines, x.on_time, x.rate]), [['Fenteng Lighting', 2, 2, 100], ['Tony Fan', 2, 1, 50]]);
});

test('Supplier scorecard: lead time planned vs actual, late starts, ladder rungs, reporting lag, damage rate of supplier faults', async () => {
  const poDate = day(-40);
  const settings = await loadSettings(raw);
  const planned = plannedChain(settings, { poDate: parseDate(poDate), productionDays: 20, mode: 'LCL' }).arrival;
  const arrived = ymd(addDays(planned, 3));
  const a = await ship({ Shipment_No: 'A', PO_Date: poDate, Stage: 'arrived_port', Arrived_Port_At: arrived, Production_Started_At: ymd(addDays(parseDate(poDate), 4)) }); // started 3 days late
  await ship({ Shipment_No: 'B', PO_Date: day(-5), Stage: 'production' }); // not started by PO + 1: a late start
  for (let i = 1; i <= 2; i++) await raw.addRecord('Ladder_Events', { Record_Id: String(a), Rung: i });
  await raw.addRecord('Stage_Events', { Record_Type: 'shipment', Record_Id: String(a), Event: 'shipment.production_started', Source: 'supplier', Occurred_At: day(-10), Reported_At: day(-7) });
  await raw.addRecord('Stage_Events', { Record_Type: 'shipment', Record_Id: String(a), Event: 'shipment.shipped_out', Source: 'user', Occurred_At: day(-10), Reported_At: day(0) }); // not the supplier: not counted
  await raw.addRecord('Receiving', { Supplier: 'Tony Fan', Total_Expected_Qty: 40 });
  await raw.addRecord('Exceptions', { Exception_No: 'E1', Fault_Origin: 'supplier', Affected_Qty: 2, Product_Context1: [{ Supplier: 'Tony Fan' }] });
  await raw.addRecord('Exceptions', { Exception_No: 'E2', Fault_Origin: 'transit', Affected_Qty: 9, Product_Context1: [{ Supplier: 'Tony Fan' }] });
  const [t] = (await dash()).scorecard.filter((x) => x.supplier === 'Tony Fan');
  assert.equal(t.late_starts, 2);
  assert.equal(t.ladder_rungs, 2);
  assert.equal(t.reporting_lag_days, 3);
  assert.equal(t.lead_actual_days - t.lead_planned_days, 3, 'arrived 3 days after the plan');
  assert.deepEqual([t.damage_qty, t.received_qty, t.damage_rate_supplier_fault], [2, 40, 5]);
});

test('Pipeline: lines by stage with the oldest Order Date; Replacements: open RRs, oldest first, with the rework rate', async () => {
  await ship({ Shipment_No: 'P1', Stage: 'production', Order_Date: day(-9), PO_Shipments: [{ SKU: 'a' }, { SKU: 'b' }] });
  await ship({ Shipment_No: 'P2', Stage: 'production', Order_Date: day(-20) });
  await ship({ Shipment_No: 'S1', Stage: 'shipped_out', Order_Date: day(-3) });
  await ship({ Shipment_No: 'T1', Stage: 'customs_cleared', Order_Date: day(-30) });
  await ship({ Shipment_No: 'W1', Stage: 'arrived_warehouse' });
  await ship({ Shipment_No: 'R1', Stage: 'received', Order_Date: day(-99) });
  const p = Object.fromEntries((await dash()).pipeline.map((x) => [x.stage, x]));
  assert.deepEqual([p.production.lines, p.production.oldest_order_date], [3, day(-20)]);
  assert.deepEqual([p.shipout.lines, p.transit.lines, p.transit.oldest_order_date, p.receive.lines], [1, 1, day(-30), 1]);
  assert.deepEqual(p.production.link, { page: 'Shipments1', query: 'stage=production' });
  await raw.addRecord('Replacement_Request', { RR_No: 'RR-2', RR_Status: 'Open', Order_Date: day(-5), RR_Supplier: 'Tony Fan' });
  await raw.addRecord('Replacement_Request', { RR_No: 'RR-1', RR_Status: 'Acknowledged', Order_Date: day(-50), RR_Supplier: 'HC System' });
  await raw.addRecord('Replacement_Request', { RR_No: 'RR-0', RR_Status: 'Closed', Order_Date: day(-90) });
  const r = (await dash()).replacements;
  assert.equal(r.open, 2);
  assert.deepEqual(r.oldest.map((x) => x.no), ['RR-1', 'RR-2']);
  assert.ok('rate' in r.rework);
});

test('an empty system gives empty blocks, not errors', async () => {
  const d = await dash();
  assert.equal(d.today.act_now.count, 0);
  assert.equal(d.born_late.rate, null);
  assert.equal(d.on_time.rate, null);
  assert.deepEqual(d.scorecard, []);
  assert.equal(d.pipeline.length, 4);
  assert.equal(d.replacements.open, 0);
});
