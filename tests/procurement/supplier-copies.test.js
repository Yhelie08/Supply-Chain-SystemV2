// Supplier_1 / Supplier_2 (the suppliers' copies of an inquiry), Projects and Warehouse_Request workflows, run on PGlite:
//   Stage_Supplier_Changed / Mandatory_Supplier_Fields  server/modules/procurement/inquiry.mjs
//   Proj_Code_AutoNumber                                server/modules/procurement/projects.mjs
//   Warehouse_Request_Item_Im                           server/modules/fulfillment/workflows.mjs
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { SUPPLIERS } from '../../server/workflows/suppliers.mjs';

let db, raw, store, tony, fenteng, project, item;
const FORMS = ['Inquiry_Form', 'Supplier_1', 'Supplier_2', 'Tony_Notifications', 'Fenteng_Notifications', 'Suppliers', 'Projects', 'Items', 'Warehouse_Request'];
const inquiry = (id) => raw.getRecordById('Inquiry_Form', id, { raw: true });
const tonyCopy = async (no) => (await raw.find('Supplier_2', (r) => r.INQ_No_Supplier === no))[0];

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  await db.query('DELETE FROM _number_series');
  tony = await raw.addRecord('Suppliers', { Supplier_ID: SUPPLIERS[0].booksId, Supplier_Name: { first_name: 'Tony', last_name: 'Fan' } });
  fenteng = await raw.addRecord('Suppliers', { Supplier_ID: SUPPLIERS[1].booksId, Supplier_Name: { first_name: 'Fenteng' } });
  project = await raw.addRecord('Projects', { Project_Code: 'PRJ-00007', Project_Name: 'Mall' });
  item = await raw.addRecord('Items', { SKU: 'LAMP-1', item_name: 'Lamp', Image: '/api/v2.1/lamp.png' });
});

async function newInquiry() {
  const id = await store.addRecord('Inquiry_Form', { sku: 'LAMP-1', quantity: 3, unit: 'pcs', Items: item, Projects: project, Suppliers: [tony, fenteng] });
  const { INQ_No } = await inquiry(id);
  return { id, INQ_No, copy: await tonyCopy(INQ_No) };
}
const answer = (copy, extra = {}) => [{ ...copy.Supplier_quotes[0], Availability_Supplier: 'Available', Initial_Price_Supplier: '100', Final_Price_Supplier: '90', Lead_Time_Supplier: '15', ...extra }];

test('a supplier answers: its row gets a Stage, the copy stays open on "Submit Response", and the buyer\'s inquiry gets the answer, Stage and last-edited row', async () => {
  const { id, INQ_No, copy } = await newInquiry();
  await store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy, { Negotiated_Supplier: '95' }), Response_Status: 'Submit Response' }, { byForm: true });
  const after = await tonyCopy(INQ_No);
  assert.equal(after.Supplier_quotes[0].Stage_Supplier, 'Final');
  assert.equal(after.Response_Status, 'Submit Response');
  assert.equal(after.edit_counter, '1');
  const inq = await inquiry(id);
  const t = inq.Supplier_Quotes.find((q) => q.Suppliers === 'Tony');
  assert.deepEqual([t.Availability, t.Initial_Price, t.Final_Price, t.Lead_Time, t.Stage], ['Available', '100', '90', '15', 'Final']);
  const le = inq.Supplier_Quotes_Last_Edited.find((r) => r.Suppliers_Last_Edited === 'Tony');
  assert.deepEqual([le.Availability_Last_Edited, le.Final_Price_Last_Edited], ['Available', '90']);
  assert.equal(inq.Supplier_Quotes.find((q) => q.Suppliers === 'Fenteng').Availability ?? null, null, 'the other supplier\'s row is untouched');
});

test('Stage: one of Negotiated / Final Price is "Negotiating", none is "Not Selected"', async () => {
  const { INQ_No, copy } = await newInquiry();
  await store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy), Response_Status: 'Submit Response' }, { byForm: true });
  assert.equal((await tonyCopy(INQ_No)).Supplier_quotes[0].Stage_Supplier, 'Negotiating');
  await store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy, { Availability_Supplier: 'Unavailable', Final_Price_Supplier: '' }) }, { byForm: true });
  assert.equal((await tonyCopy(INQ_No)).Supplier_quotes[0].Stage_Supplier, 'Not Selected');
});

test('Mandatory fields: a missing price or lead time is refused; Unavailable / Cannot Produce need no price', async () => {
  const { INQ_No, copy } = await newInquiry();
  await assert.rejects(store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy, { Final_Price_Supplier: '0', Lead_Time_Supplier: '' }) }, { byForm: true }),
    /Required fields missing: Final Price, Lead Time/);
  await assert.rejects(store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy, { Availability_Supplier: '' }) }, { byForm: true }), /Availability/);
  await store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy, { Availability_Supplier: 'Cannot Produce', Initial_Price_Supplier: '', Final_Price_Supplier: '', Lead_Time_Supplier: '' }), Response_Status: 'Submit Response' }, { byForm: true });
  assert.equal((await tonyCopy(INQ_No)).Supplier_quotes[0].Availability_Supplier, 'Cannot Produce');
});

test('mirrors Zoho: a copy that is not Selected / Submit Response is locked (edit_counter 0), and a locked copy refuses an edit', async () => {
  const { INQ_No, copy } = await newInquiry();
  await store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy) }, { byForm: true }); // still "Waiting"
  assert.equal((await tonyCopy(INQ_No)).edit_counter, '0');
  await assert.rejects(store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy) }, { byForm: true }), /Editing is locked/);
});

test('a Selected copy with every collateral Completed and specification details becomes Completed and locked', async () => {
  const { INQ_No, copy } = await newInquiry();
  const done = { Product_Sample_Supplier: 'Completed', D_Image_Supplier: 'Completed', Specification_Supplier: 'Completed', Technical_Drawing_Supplier: 'Completed' };
  await store.updateRecord('Supplier_2', copy.ID, { Supplier_quotes: answer(copy), Response_Status: 'Selected', ...done }, { byForm: true });
  assert.equal((await tonyCopy(INQ_No)).Response_Status, 'Selected', 'no specification details yet');
  await store.updateRecord('Supplier_2', copy.ID, { Specification_Details_Supplier: '220V, 3000K' }, { byForm: true });
  const after = await tonyCopy(INQ_No);
  assert.deepEqual([after.Response_Status, after.edit_counter], ['Completed', '0']);
});

test('Projects: a new project gets PRJ-nnnnn after the highest code, even when the widget sent one', async () => {
  const a = await store.addRecord('Projects', { Project_Name: 'Hotel', Project_Code: 'X' });
  const b = await store.addRecord('Projects', { Project_Name: 'Office' });
  const code = async (id) => (await raw.getRecordById('Projects', id, { raw: true })).Project_Code;
  assert.deepEqual([await code(a), await code(b)], ['PRJ-00008', 'PRJ-00009']);
});

test('Warehouse Request: an item row without an image takes the item\'s image; a row with one keeps it', async () => {
  const id = await store.addRecord('Warehouse_Request', { Item: [{ Items: item, SKU: 'LAMP-1' }, { Items: item, SKU: 'LAMP-1', Image: '/api/v2.1/own.png' }] });
  const rec = await raw.getRecordById('Warehouse_Request', id, { raw: true });
  assert.deepEqual(rec.Item.map((r) => r.Image), ['/api/v2.1/lamp.png', '/api/v2.1/own.png']);
});

// ---------------- the daily shipment schedules (server/modules/procurement/shipment-schedules.mjs) ----------------
import { runShipment10DayCheck, runShipmentDelayStatus } from '../../server/modules/procurement/shipment-schedules.mjs';

test('10-day check: a shipment with 10 days or less is notified once; more days, a blank count, or already notified is not', async () => {
  await db.query('DELETE FROM "Shipments"'); await db.query('DELETE FROM "App_Notifications"');
  const near = await raw.addRecord('Shipments', { Shipment_No: 'SHP-00001', Remaining_Days: 6 });
  await raw.addRecord('Shipments', { Shipment_No: 'SHP-00002', Remaining_Days: 30 });
  await raw.addRecord('Shipments', { Shipment_No: 'SHP-00003' });
  await raw.addRecord('Shipments', { Shipment_No: 'SHP-00004', Remaining_Days: 2, Notified_10d: true });
  assert.deepEqual(await runShipment10DayCheck(raw), { notified: 1 });
  const [n] = await raw.find('App_Notifications');
  assert.equal(n.Message, 'Shipment SHP-00001 has 6 day(s) left on its timeline.');
  assert.equal(String(n.Source_Record_ID), String(near));
  assert.deepEqual(await runShipment10DayCheck(raw), { notified: 0 }, 'told once');
});

test('delay status: past the arrival date is Delayed, within 7 days is "Arriving in 1 Week"; Delivered and far-off shipments are left alone', async () => {
  await db.query('DELETE FROM "Shipments"'); await db.query('DELETE FROM "Schedule_Test_Settings"');
  const mk = (no, eta, status = 'In Transit') => raw.addRecord('Shipments', { Shipment_No: no, Estimated_Warehouse_Arrival: eta, Shipment_Status: status });
  await mk('A', '2026-11-10'); await mk('B', '2026-11-20'); await mk('C', '2026-12-30'); await mk('D', '2026-11-01', 'Delivered'); await mk('E', '');
  const counts = await runShipmentDelayStatus(raw, { today: new Date(2026, 10, 17) });
  assert.deepEqual(counts, { delayed: 1, arriving: 1, skippedDelivered: 1, checked: 3, changed: 2 });
  const status = Object.fromEntries((await raw.find('Shipments')).map((s) => [s.Shipment_No, s.Shipment_Status]));
  assert.deepEqual(status, { A: 'Delayed', B: 'Arriving in 1 Week', C: 'In Transit', D: 'Delivered', E: 'In Transit' });
  // the test date in Schedule_Test_Settings wins over today
  await raw.addRecord('Schedule_Test_Settings', { Test_Current_Date: '2027-01-05' });
  await runShipmentDelayStatus(raw, { today: new Date(2026, 10, 17) });
  assert.equal((await raw.find('Shipments')).find((s) => s.Shipment_No === 'C').Shipment_Status, 'Delayed');
});

test('Fenteng PO added by hand: PO_No_Supplier1 is one more than the highest main PO number; a number already given is kept', async () => {
  await db.query('DELETE FROM "Purchase_Order"'); await db.query('DELETE FROM "Fenteng_Lighting_Purchase_Order"');
  await raw.addRecord('Purchase_Order', { PO_No: 'PO-00004' });
  const a = await store.addRecord('Fenteng_Lighting_Purchase_Order', {});
  const b = await store.addRecord('Fenteng_Lighting_Purchase_Order', { PO_No_Supplier1: 'PO-00002' });
  const no = async (id) => (await raw.getRecordById('Fenteng_Lighting_Purchase_Order', id, { raw: true })).PO_No_Supplier1;
  assert.deepEqual([await no(a), await no(b)], ['PO-00005', 'PO-00002']);
});
