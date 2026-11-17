// Supplier portal of the spec v1.4 (02 Procurement / 07): SP-R1 / review C11, the supplier never sees our selling price.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';
import { SUPPLIERS } from '../server/workflows/suppliers.mjs';
import { ymd, addDays, todayDate } from '../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Request1', 'Tony_Fan_Purchase_Request', 'Fenteng_Lighting_Purchase_Request', 'Suppliers', 'Items', 'Inquiry_Form'];
const [TONY, FENTENG] = SUPPLIERS;
let db, raw, store, item;
const pr = (extra = {}) => ({ sku: 'S-1', quantity: 2, category: 'Pendant Light', Items: item, Target_Delivery: ymd(addDays(todayDate(), 60)), PR_Date: ymd(todayDate()), Description1: 'd1', description: 'd', unit: 'pcs', ...extra });
const read = (id) => raw.getRecordById('Purchase_Request1', id, { raw: true });
const copiesOf = async (no) => [
  ...(await raw.find('Tony_Fan_Purchase_Request', (r) => r.PR_No_Supplier2 === no)),
  ...(await raw.find('Fenteng_Lighting_Purchase_Request', (r) => r.PR_No_Supplier1 === no)),
];

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  await raw.addRecord('Suppliers', { Supplier_ID: TONY.booksId, Supplier_Name: { first_name: 'Tony', last_name: 'Fan' }, Handles_All: true, Max_Capacity: 10 });
  await raw.addRecord('Suppliers', { Supplier_ID: FENTENG.booksId, Supplier_Name: { first_name: 'Fenteng' }, Handles_All: true, Max_Capacity: 10 });
  item = await raw.addRecord('Items', { ID1: 'B1', item_name: 'Lamp', SKU: 'S-1', Rate: '0' });
});

test('SP-R1: the supplier copy of a PR carries a yes / no flag, never the selling price', async () => {
  const id = await store.addRecord('Purchase_Request1', pr({ SRP_Rate_PR: 777 }));
  const no = (await read(id)).PR_No;
  const copies = await copiesOf(no);
  assert.equal(copies.length, 2);
  for (const c of copies) {
    assert.ok(Object.entries(c).filter(([k]) => /^SRP_Rate_PR/.test(k)).every(([, v]) => v === null || v === '' || v === undefined), 'no SRP amount on the supplier copy');
    assert.ok(!JSON.stringify(c).includes('777'), 'the amount appears nowhere on the copy');
  }
  const flag = (c) => c.Ref_Price_Known_Supplier1 ?? c.Ref_Price_Known_Supplier2;
  assert.deepEqual(copies.map(flag), ['Yes', 'Yes']);
});

test('SP-R1: no reference price = No, and a later edit of the PR still never copies the amount', async () => {
  const id = await store.addRecord('Purchase_Request1', pr());
  const no = (await read(id)).PR_No;
  assert.deepEqual((await copiesOf(no)).map((c) => c.Ref_Price_Known_Supplier1 ?? c.Ref_Price_Known_Supplier2), ['No', 'No']);
  await store.updateRecord('Purchase_Request1', id, { SRP_Rate_PR: 555, description: 'edited' });
  const after = await copiesOf(no);
  assert.ok(!JSON.stringify(after).includes('555'));
});

// ---------- SP-R4 / SP-R5: a delay report ----------
import { reportShipmentDelay } from '../server/modules/procurement/ship-track.mjs';

const SHIP_FORMS = ['Shipments', 'Purchase_Order', 'Sales_Order_Fulfillment', 'Stage_Events', 'Ladder_Events', 'Approval_Queue', 'App_Notifications', 'Procurement_Settings', 'Tony_Shipment'];
const day = (n) => ymd(addDays(todayDate(), n));
async function aShipment() {
  for (const f of SHIP_FORMS) await db.query(`DELETE FROM "${f}"`);
  await raw.addRecord('Suppliers', { Supplier_ID: 'X', Supplier_Name: { first_name: 'Tony', last_name: 'Fan' } });
  const line = { PR_No: 'PR-1', SKU: 'L-1', Item: 'Lamp', QTY: 2, Supplier: 'Tony Fan', Line_Total: 10, Shipping_Mode: 'LCL' };
  await raw.addRecord('Sales_Order_Fulfillment', { SO_No: 'SO-1', SO_Created_Date: day(-10) });
  const poId = await store.addRecord('Purchase_Order', { Customer: 'C', PO_Date: day(0), PO_Line_Items: [line] });
  return store.addRecord('Shipments', { PO_No: poId, Sales_Order: 'SO-1', Supplier: 'Tony Fan', Target_Date: day(90),
    PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Ordered_QTY: 2, Shipment_QTY: 2, Shipping_Mode: 'LCL' }] });
}
const ship = (id) => raw.getRecordById('Shipments', id, { raw: true });
const logOf = async (id) => (await raw.find('Stage_Events', (e) => String(e.Record_Id) === String(id))).filter((e) => e.Event === 'shipment.delay_reported');

test('SP-R5: a delay in Production moves the planned ship out, arrival and receive to the supplier\'s new date, never the target', async () => {
  const id = await aShipment();
  const before = await ship(id);
  await store.updateRecord('Shipments', id, { Report_Delay_Date: day(40), Report_Delay_Reason: 'Mould broke', Report_Source: 'supplier' });
  const s = await ship(id);
  assert.equal(s.Shipout_Planned, day(40));
  assert.ok(s.Arrival_Planned > before.Arrival_Planned && s.Receive_Planned > before.Receive_Planned, 'the stages after it follow');
  assert.equal(s.Target_Date, before.Target_Date, 'a delay never changes the promise to the customer (DT-5)');
  assert.equal(s.Supplier_Expected_Date, day(40));
  assert.ok(s.Last_Supplier_Update_At, 'a supplier report counts as a supplier update');
  assert.equal(s.Report_Delay_Date, '', 'the transient field is cleared');
  const [e] = await logOf(id);
  assert.match(e.Note, /Mould broke/);
  assert.match(e.Note, new RegExp(`new expected date ${day(40)}`));
  assert.equal(e.Source, 'supplier');
});

test('SP-R5: a delay needs a reason and a real future date, and is refused after the goods arrived', async () => {
  const id = await aShipment();
  const bad = (patch, re) => assert.rejects(() => store.updateRecord('Shipments', id, patch), (e) => re.test(e.message));
  await bad({ Report_Delay_Date: day(10), Report_Delay_Reason: '  ' }, /reason/);
  await bad({ Report_Delay_Date: '', Report_Delay_Reason: 'x' }, /new expected date/);
  await bad({ Report_Delay_Date: day(-1), Report_Delay_Reason: 'x' }, /past/);
  await store.updateRecord('Shipments', id, { Report_Event: 'arrived_warehouse', Report_Occurred_At: day(0) }).catch(() => {});
  await raw.updateRecord('Shipments', id, { Stage: 'arrived_warehouse' }, { byForm: true });
  await bad({ Report_Delay_Date: day(10), Report_Delay_Reason: 'x' }, /already arrived/);
  assert.equal((await logOf(id)).length, 0, 'nothing was logged by the refused reports');
});

test('SP-R5: a stage that happens replaces the old promise', async () => {
  const id = await aShipment();
  await store.updateRecord('Shipments', id, { Report_Delay_Date: day(20), Report_Delay_Reason: 'Waiting for parts' });
  assert.equal((await ship(id)).Supplier_Expected_Date, day(20));
  await raw.updateRecord('Shipments', id, { Production_Photos: ['p.jpg'] }, { byForm: true });
  await store.updateRecord('Shipments', id, { Report_Event: 'shipped_out', Report_Occurred_At: day(0) });
  assert.equal((await ship(id)).Supplier_Expected_Date, '');
});

test('SP-R5: the supplier reports on its own copy; the parent shipment is re-planned and the copy is cleared', async () => {
  const id = await aShipment();
  const copy = await raw.addRecord('Tony_Shipment', { Parent_Shipment_ID: String(id) });
  await assert.rejects(() => store.updateRecord('Tony_Shipment', copy, { Delay_New_Date: day(15) }), (e) => /date and a reason/.test(e.message));
  await store.updateRecord('Tony_Shipment', copy, { Delay_New_Date: day(15), Delay_Reason: 'Typhoon' });
  const s = await ship(id);
  assert.equal(s.Supplier_Expected_Date, day(15));
  assert.equal(s.Delay_Reason, 'Typhoon');
  const c = await raw.getRecordById('Tony_Shipment', copy, { raw: true });
  assert.ok(!c.Delay_New_Date && !c.Delay_Reason, 'the supplier copy is cleared');
  assert.equal((await logOf(id)).length, 1);
});

test('SP-R5: the server-side reportShipmentDelay follows the same rules', async () => {
  const id = await aShipment();
  await assert.rejects(() => reportShipmentDelay(raw, id, { date: day(5), reason: '' }), (e) => /reason/.test(e.message));
  assert.equal(await reportShipmentDelay(raw, id, { date: day(5), reason: 'Forwarder strike', source: 'forwarder' }), true);
  assert.equal((await logOf(id))[0].Source, 'forwarder');
});

// ---------- the Production screen of the portal ----------
async function withCopy() {
  const id = await aShipment();
  const copy = await raw.addRecord('Tony_Shipment', { Shipment_No: 'SHP-X', Parent_Shipment_ID: String(id) });
  const { refreshSupplierView } = await import('../server/modules/procurement/ship-track.mjs');
  await refreshSupplierView(raw, id);
  return { id, copy };
}
const view = (copy) => raw.getRecordById('Tony_Shipment', copy, { raw: true });

test('Production screen: the copy shows the lines and the planned production dates, and nothing about the customer or a price', async () => {
  const { id, copy } = await withCopy();
  const c = await view(copy);
  const s = await ship(id);
  assert.equal(c.Prod_Status, 'not_started');
  assert.equal(c.Prod_Planned_Start, s.Production_Start_Planned);
  assert.equal(c.Prod_Planned_End, s.Production_End_Planned);
  assert.match(c.Prod_Lines, /L-1 Lamp x2/);
  const all = JSON.stringify(c);
  assert.ok(!all.includes('SO-1'), 'no Sales Order');
  assert.ok(!/"Customer"/.test(all) && !all.includes('Line_Total'));
});

test('Production screen: "production started" on the copy stamps the shipment (source supplier, the day they enter) and refreshes the copy', async () => {
  const { id, copy } = await withCopy();
  await store.updateRecord('Tony_Shipment', copy, { Report_Prod_Event: 'production_started', Report_Prod_Date: day(-2) });
  const s = await ship(id);
  assert.equal(s.Production_Started_At, day(-2));
  assert.ok(s.Last_Supplier_Update_At);
  const [e] = (await raw.find('Stage_Events', (x) => String(x.Record_Id) === String(id) && x.Event === 'shipment.production_started'));
  assert.equal(e.Source, 'supplier');
  assert.equal(e.Occurred_At, day(-2));
  assert.ok(e.Reported_At && e.Reported_At !== e.Occurred_At, 'when it happened and when we were told are two things');
  const c = await view(copy);
  assert.equal(c.Prod_Status, 'in_production');
  assert.ok(!c.Report_Prod_Event && !c.Report_Prod_Date, 'the report fields are cleared');
});

test('Production screen: finishing needs a production photo (ST-R3); with the photo the shipment is finished and the photo is on the shipment', async () => {
  const { id, copy } = await withCopy();
  await assert.rejects(() => store.updateRecord('Tony_Shipment', copy, { Report_Prod_Event: 'production_finished', Report_Prod_Date: day(0) }), (e) => /production photo/.test(e.message));
  assert.ok(!(await ship(id)).Production_Finished_At);
  await assert.rejects(() => store.updateRecord('Tony_Shipment', copy, { Prod_Photo: '/uploads/a.exe' }), (e) => /JPG, PNG/.test(e.message));
  await store.updateRecord('Tony_Shipment', copy, { Prod_Photo: '/uploads/123_made.jpg' });
  assert.equal((await ship(id)).Production_Photos, '/uploads/123_made.jpg', 'the photo shows on the shipment (ST-R4)');
  await store.updateRecord('Tony_Shipment', copy, { Report_Prod_Event: 'production_finished', Report_Prod_Date: day(-1) });
  const s = await ship(id);
  assert.equal(s.Production_Finished_At, day(-1));
  assert.equal((await view(copy)).Prod_Status, 'finished');
});

test('Production screen: a date in the future, an unknown report, or a shipment that already left Production is refused', async () => {
  const { id, copy } = await withCopy();
  const bad = (patch, re) => assert.rejects(() => store.updateRecord('Tony_Shipment', copy, patch), (e) => re.test(e.message));
  await bad({ Report_Prod_Event: 'production_started', Report_Prod_Date: day(3) }, /future/);
  await bad({ Report_Prod_Event: 'shipped_out' }, /Unknown/);
  await bad({ Report_Prod_Date: day(0) }, /what happened/);
  await raw.updateRecord('Shipments', id, { Stage: 'shipped_out' }, { byForm: true });
  await bad({ Report_Prod_Event: 'production_started' }, /left Production/);
  assert.ok(!(await ship(id)).Production_Started_At);
});

// ---------- one supplier, one identity (owner 2026-11-17) ----------
import { portalOf } from '../server/workflows/suppliers.mjs';
import { resolveSupplier } from '../server/modules/procurement/plan.mjs';

test('"Tony" and "Tony Fan" are one supplier, "Fenteng" and "Fenteng Lighting" are one; part of a word and other names are not', () => {
  for (const n of ['Tony', 'Tony Fan', 'TONY FAN', ' tony  fan ']) assert.equal(portalOf(n)?.key, 'tony', n);
  for (const n of ['Fenteng', 'Fenteng Lighting', 'fenteng lighting']) assert.equal(portalOf(n)?.key, 'fenteng', n);
  for (const n of ['Fentengxyz', 'Antony', 'Stony Co', 'HC System', 'Steady Co', '', null, undefined]) assert.equal(portalOf(n), null, String(n));
});

test('the Suppliers record resolves from either name, never from a part of a word', () => {
  const rows = [{ ID: '1', Supplier_Name: { first_name: 'Tony', last_name: 'Fan' } }, { ID: '2', Supplier_Name: { first_name: 'Fenteng Lighting' } }];
  for (const n of ['Tony', 'Tony Fan', 'tony fan']) assert.equal(resolveSupplier(rows, n)?.row.ID, '1', n);
  for (const n of ['Fenteng', 'Fenteng Lighting']) assert.equal(resolveSupplier(rows, n)?.row.ID, '2', n);
  assert.equal(resolveSupplier(rows, 'Ton'), null);
  assert.equal(resolveSupplier(rows, 'Fent'), null);
});

// ---------- found by the whole-process run: what a supplier's portal answer must trigger at once ----------
test('a portal answer on an inquiry: a Cannot Produce line loses its price at once, and the stamps, hint and alert happen without the buyer saving', async () => {
  for (const f of ['Inquiry_Form', 'Supplier_1', 'Supplier_2', 'Stage_Events', 'App_Notifications']) await db.query(`DELETE FROM "${f}"`);
  const t = await raw.addRecord('Suppliers', { Supplier_ID: TONY.booksId, Supplier_Name: { first_name: 'Tony Fan' } });
  const f = await raw.addRecord('Suppliers', { Supplier_ID: FENTENG.booksId, Supplier_Name: { first_name: 'Fenteng Lighting' } });
  const id = await store.addRecord('Inquiry_Form', { sku: 'LAMP-1', quantity: 2, unit: 'pcs', target_date: day(40), Items: item, Suppliers: [t, f] });
  const no = (await raw.getRecordById('Inquiry_Form', id, { raw: true })).INQ_No;
  const tc = (await raw.find('Supplier_2', (c) => c.INQ_No_Supplier === no))[0], fc = (await raw.find('Supplier_1', (c) => c.INQ_No_Supplier === no))[0];
  const ans = (c, extra) => [{ ...c.Supplier_quotes[0], ...extra }];
  await store.updateRecord('Supplier_2', tc.ID, { Supplier_quotes: ans(tc, { Availability_Supplier: 'Available', Initial_Price_Supplier: '100', Final_Price_Supplier: '90', Lead_Time_Supplier: '20' }), Response_Status: 'Submit Response' }, { byForm: true });
  await store.updateRecord('Supplier_1', fc.ID, { Supplier_quotes: ans(fc, { Availability_Supplier: 'Cannot Produce', Initial_Price_Supplier: '99', Final_Price_Supplier: '99', Lead_Time_Supplier: '10' }), Response_Status: 'Submit Response' }, { byForm: true });
  const inq = await raw.getRecordById('Inquiry_Form', id, { raw: true });
  const fq = inq.Supplier_Quotes.find((q) => /Fenteng/.test(q.Suppliers));
  assert.ok(!Number(fq.Final_Price) && !Number(fq.Initial_Price) && !fq.Lead_Time, 'the price of a line that cannot be supplied is cleared');
  assert.ok(inq.First_Quote_At, 'first quote stamped without the buyer saving');
  assert.match(inq.Feasibility_Hints, /Tony Fan: Lead 20 days/);
  assert.equal((await raw.find('App_Notifications', (n) => n.Notification_Type === 'Inquiry Quotes Complete')).length, 1);
});

test('a supplier\'s answer on a PR: the buyer\'s PR gets its recommendation in words and its feasibility at once', async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  await db.query('DELETE FROM "Tony_Fan_Purchase_Request"'); await db.query('DELETE FROM "Fenteng_Lighting_Purchase_Request"');
  await raw.addRecord('Suppliers', { Supplier_ID: TONY.booksId, Supplier_Name: { first_name: 'Tony Fan' }, Handles_All: true, Max_Capacity: 10 });
  item = await raw.addRecord('Items', { ID1: 'B2', item_name: 'Lamp', SKU: 'S-1', Rate: '0' });
  const id = await store.addRecord('Purchase_Request1', pr({ Target_Delivery: day(120) }));
  const no = (await read(id)).PR_No;
  assert.match((await read(id)).Recommendation_Reason, /No supplier has quoted/);
  const [copy] = await raw.find('Tony_Fan_Purchase_Request', (c) => c.PR_No_Supplier2 === no);
  await store.updateRecord('Tony_Fan_Purchase_Request', copy.ID, { Response_Status: 'Submit Response', Supplier_Selected_Supplier2: [{ Suppliers_Supplier2: 'Tony Fan', Availability_Supplier2: 'Available', Initial_Price_Supplier2: 90, Negotiated_Supplier2: 85, Final_Price_Supplier2: 80, Lead_Time_Supplier2: 20 }] }, { byForm: true });
  const after = await read(id);
  assert.doesNotMatch(after.Recommendation_Reason, /No supplier has quoted/, 'the recommendation was worked out after the supplier answered');
  assert.match(after.Recommendation_Reason, /Tony Fan/);
});
