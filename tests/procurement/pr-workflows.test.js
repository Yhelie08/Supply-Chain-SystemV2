// Purchase_Request1 workflows ported from Zoho (server/modules/procurement/purchase-request.mjs), run on PGlite.
// Tests marked "mirrors Zoho" follow the Deluge script literally, quirks included; they are to be confirmed
// against Zoho Development.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import { SUPPLIERS } from '../../server/workflows/suppliers.mjs';
import { ymd, addDays, todayDate } from '../../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Request1', 'Tony_Fan_Purchase_Request', 'Fenteng_Lighting_Purchase_Request', 'Suppliers', 'Items', 'Inquiry_Form', 'Purchase_Order'];
const [TONY, FENTENG] = SUPPLIERS;
const today = todayDate();
const inDays = (n) => ymd(addDays(today, n));
let db, raw, store, tony, fenteng, item;

const pr = (extra = {}) => ({ sku: 'S-1', quantity: 2, category: 'Pendant Light', Items: item, Target_Delivery: inDays(60), PR_Date: inDays(0), Description1: 'd1', description: 'd', unit: 'pcs', ...extra });
const read = (id) => raw.getRecordById('Purchase_Request1', id, { raw: true });
const copies = (form, field, no) => raw.find(form, (r) => r[field] === no);
const tonyCopies = (no) => copies('Tony_Fan_Purchase_Request', 'PR_No_Supplier2', no);
const fentengCopies = (no) => copies('Fenteng_Lighting_Purchase_Request', 'PR_No_Supplier1', no);

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});

beforeEach(async () => {
  for (const f of FORMS) await db.query(`DELETE FROM "${f}"`);
  tony = await raw.addRecord('Suppliers', { Supplier_ID: TONY.booksId, Supplier_Name: { first_name: 'Tony', last_name: 'Fan' }, Handles_All: true, Max_Capacity: 10 });
  fenteng = await raw.addRecord('Suppliers', { Supplier_ID: FENTENG.booksId, Supplier_Name: { first_name: 'Fenteng' }, Handles_All: false, Supported_Categories: ['Pendant Light', 'Wall Light'], Max_Capacity: 4 });
  item = await raw.addRecord('Items', { ID1: 'B1', item_name: 'Lamp', SKU: 'S-1', Image: '/img/lamp.png', Rate: '0' });
});

test('numbering: the next PR number follows the highest one that exists', async () => {
  const a = await store.addRecord('Purchase_Request1', pr());
  const b = await store.addRecord('Purchase_Request1', pr());
  assert.deepEqual([(await read(a)).PR_No, (await read(b)).PR_No], ['PR-00001', 'PR-00002']);
  await raw.addRecord('Purchase_Request1', { PR_No: 'PR-00009' });
  assert.equal((await read(await store.addRecord('Purchase_Request1', pr()))).PR_No, 'PR-00010');
});

test('status: Open until a PO is linked, then Converted to PO', async () => {
  assert.equal((await read(await store.addRecord('Purchase_Request1', pr()))).PR_Status, 'Open');
  assert.equal((await read(await store.addRecord('Purchase_Request1', pr({ Link_PO_No: 'PO-1' })))).PR_Status, 'Converted to PO');
});

test('load balancing: only suppliers that can do the category get a row, with their live load', async () => {
  const floor = await read(await store.addRecord('Purchase_Request1', pr({ category: 'Floor Lamp' })));
  assert.deepEqual(floor.Supplier_Load_Balancing.map((r) => r.Suppliers.ID), [tony], 'Handles_All Tony only; Fenteng does not do Floor Lamp');

  await raw.addRecord('Purchase_Order', { PO_Status: 'Open', PO_Line_Items: [{ Supplier: 'Tony' }, { Supplier: 'Tony' }] });
  await raw.addRecord('Purchase_Order', { PO_Status: 'Completed', PO_Line_Items: [{ Supplier: 'Tony' }] });
  await raw.addRecord('Purchase_Order', { PO_Status: 'Open', PO_Line_Items: [{ Supplier: 'Fenteng' }, { Supplier: 'Fenteng' }, { Supplier: 'Fenteng' }, { Supplier: 'Fenteng' }] });
  const both = await read(await store.addRecord('Purchase_Request1', pr()));
  const row = (id) => both.Supplier_Load_Balancing.find((r) => r.Suppliers.ID === id);
  assert.deepEqual([row(tony).Active_POs, row(tony).Percent, row(tony).Load_Status], ['2', '20.00', 'Normal'], 'a completed PO does not count');
  assert.deepEqual([row(fenteng).Active_POs, row(fenteng).Percent, row(fenteng).Load_Status], ['4', '100.00', 'Overloaded']);
});

test('recommended supplier: the lowest price, then the shortest lead time', async () => {
  const id = await store.addRecord('Purchase_Request1', pr());
  const quotes = (a, b) => (rows) => rows.map((r) => ({ ...r, ...(r.Suppliers === 'Tony' ? a : b) }));
  const set = async (a, b) => {
    const rec = await read(id);
    await store.updateRecord('Purchase_Request1', id, { Supplier_Selected: quotes(a, b)(rec.Supplier_Selected) }, { byForm: true });
    return (await read(id)).Supplier_Load_Balancing.find((r) => r.Eligible_Supplier === 'Recommended')?.Suppliers.ID;
  };
  assert.equal(await set({ Initial_Price: 120 }, { Initial_Price: 100 }), fenteng, 'cheaper wins');
  assert.equal(await set({ Initial_Price: 120, Negotiated: 80 }, { Initial_Price: 100 }), tony, 'a negotiated price replaces the initial one');
  assert.equal(await set({ Initial_Price: 100, Negotiated: 0, Lead_Time: 5 }, { Initial_Price: 100, Lead_Time: 9 }), tony, 'equal price: shorter lead time');
});

test('supplier selection: one row per matched supplier, one winner, copied up to the PR', async () => {
  const id = await store.addRecord('Purchase_Request1', pr());
  let rec = await read(id);
  assert.deepEqual(rec.Supplier_Selected.map((r) => [r.Suppliers, r.Status, r.Selected]).sort(), [['Fenteng', 'Active', false], ['Tony', 'Active', false]]);
  assert.equal(rec.Selected_Supplier, '');
  const tonyRow = rec.Supplier_Selected.find((r) => r.Suppliers === 'Tony');
  await store.updateRecord('Purchase_Request1', id, { Supplier_Selected: rec.Supplier_Selected.map((r) => (r === tonyRow ? { ...r, Selected: true, Final_Price: '500', Lead_Time: '12' } : r)) }, { byForm: true });
  rec = await read(id);
  assert.deepEqual([rec.Selected_Supplier, rec.Selcted_Final_Cost, rec.Required_Days_Lead], ['Tony', '500', '12']);
  await store.updateRecord('Purchase_Request1', id, { Supplier_Selected: rec.Supplier_Selected.map((r) => ({ ...r, Selected: false })) }, { byForm: true });
  rec = await read(id);
  assert.deepEqual([rec.Selected_Supplier, rec.Selcted_Final_Cost, rec.Required_Days_Lead], ['', '0', '0']);
});

test('a Local PR uses HC System, with no lead time and no freight', async () => {
  const rec = await read(await store.addRecord('Purchase_Request1', pr({ Sourcing_Type: 'Local' })));
  assert.deepEqual([rec.Selected_Supplier, rec.Required_Days_Lead, rec.Shipping_mode_selected], ['HC System', '0', true]);
});

test('mirrors Zoho: readiness is worked out before the shipment mode is set, so a new PR is ready one save later', async () => {
  const id = await store.addRecord('Purchase_Request1', pr({ SRP_Approved_PR: 100, Supplier_Selected: [{ Supplier_ID: tony, Suppliers: 'Tony', Selected: true, Final_Price: 90, Lead_Time: 5 }] }));
  let rec = await read(id);
  assert.deepEqual([rec.Selected_Supplier1, rec.Final_price_confirmed, rec.Target_date_exists], [true, true, true]);
  assert.equal(rec.Shipment_Mode, 'LCL', 'the mode was set in this save');
  assert.equal(rec.Shipping_mode_selected, false, 'but readiness looked at it before');
  assert.equal(rec.PR_READY_FOR_PO, false);
  await store.updateRecord('Purchase_Request1', id, { description: 'touched' }, { byForm: true });
  rec = await read(id);
  assert.deepEqual([rec.Shipping_mode_selected, rec.PR_READY_FOR_PO], [true, true]);
});

test('price confirmed: approved SRP, SRP rate, an inquiry, the catalog rate, or a supplier cost', async () => {
  const confirmed = async (extra) => (await read(await store.addRecord('Purchase_Request1', pr({ sku: 'NOPE', ...extra })))).Final_price_confirmed;
  assert.equal(await confirmed({}), false);
  assert.equal(await confirmed({ SRP_Approved_PR: 5 }), true);
  assert.equal(await confirmed({ SRP_Rate_PR: 5 }), true);
  assert.equal(await confirmed({ inquiry_reference: 'INQ-1' }), true);
  await raw.addRecord('Items', { SKU: 'PRICED', Rate: '250' });
  assert.equal(await confirmed({ sku: 'PRICED' }), true);
});

test('shipment mode and dates: LCL when the supplier date is 30+ days away, airfreight when closer', async () => {
  const far = await read(await store.addRecord('Purchase_Request1', pr({ Target_Delivery: inDays(60) })));
  assert.deepEqual([far.supplier_target_date, far.Shipment_Mode, far.Shipment_Days], [inDays(56), 'LCL', '30']);
  const near = await read(await store.addRecord('Purchase_Request1', pr({ Target_Delivery: inDays(10) })));
  assert.deepEqual([near.supplier_target_date, near.Shipment_Mode, near.Shipment_Days], [inDays(6), 'Airfreight', '14']);
});

test('timeline: remaining days to the end of production, and the delay status', async () => {
  const id = await store.addRecord('Purchase_Request1', pr());
  let rec = await read(id);
  assert.equal(rec.Production_Date, inDays(0), 'not converted yet: production starts today');
  const sel = (lead) => rec.Supplier_Selected.map((r) => (r.Suppliers === 'Tony' ? { ...r, Selected: true, Final_Price: '10', Lead_Time: String(lead) } : r));
  await store.updateRecord('Purchase_Request1', id, { Supplier_Selected: sel(20) }, { byForm: true });
  rec = await read(id);
  assert.deepEqual([rec.Remaining_Days, rec.Delay_Status], ['20', 'On Track']);
  await store.updateRecord('Purchase_Request1', id, { Supplier_Selected: sel(2) }, { byForm: true });
  rec = await read(id);
  assert.deepEqual([rec.Remaining_Days, rec.Delay_Status], ['2', 'At Risk']);
});

test('priority: delivery urgency, big orders and idle time add up to High, Medium or Low', async () => {
  const high = await read(await store.addRecord('Purchase_Request1', pr({ Target_Delivery: inDays(2), Order_Value: 600000 })));
  assert.deepEqual([high.Priority, high.Priority_Score], ['High', '70']);
  const low = await read(await store.addRecord('Purchase_Request1', pr({ Target_Delivery: inDays(30) })));
  assert.deepEqual([low.Priority, low.Priority_Score], ['Low', '0']);
  const medium = await read(await store.addRecord('Purchase_Request1', pr({ Target_Delivery: inDays(5), Order_Value: 500000 })));
  assert.deepEqual([medium.Priority, medium.Priority_Score], ['Medium', '50']);
});

test('a PR converted to a PO is locked: its terms cannot change, other fields can', async () => {
  const id = await store.addRecord('Purchase_Request1', pr({ Link_PO_No: 'PO-1', category: 'Floor Lamp', Supplier_Selected: [{ Supplier_ID: tony, Suppliers: 'Tony', Selected: true, Final_Price: 500, Lead_Time: 10 }] }));
  await store.updateRecord('Purchase_Request1', id, { description: 'a note' }, { byForm: true });
  assert.equal((await read(id)).description, 'a note');
  await assert.rejects(() => store.updateRecord('Purchase_Request1', id, { quantity: 99 }, { byForm: true }), (e) => e.code === 2001 && /already locked/.test(e.message));
  assert.notEqual((await read(id)).quantity, '99');
});

test('a new PR is copied to each supplier portal that should quote it', async () => {
  const id = await store.addRecord('Purchase_Request1', pr(), 'staff@example.test');
  const rec = await read(id);
  const [t] = await tonyCopies(rec.PR_No);
  const [f] = await fentengCopies(rec.PR_No);
  assert.deepEqual([t.Response_Status, t.edit_counter, t.sku_Supplier2, t.quantity_Supplier2, t.Product_Image_Supplier2_PR], ['Waiting', '1', 'S-1', '2', '/img/lamp.png']);
  assert.deepEqual([f.Response_Status, f.sku_Supplier1, f.Priority_PR_Supplier1], ['Waiting', 'S-1', rec.Priority]);
  assert.deepEqual(t.Supplier_Selected_Supplier2.map((r) => r.Suppliers_Supplier2), ['Tony']);
  assert.deepEqual(f.Supplier_Selected_Supplier1.map((r) => r.Suppliers_Supplier1), ['Fenteng']);
  assert.equal(rec.Product_Image_PR, '/img/lamp.png', 'and the PR takes its item\'s photo');
});

test('no copies for Local PRs or PRs that came from a sales order', async () => {
  for (const extra of [{ Sourcing_Type: 'Local' }, { Source: 'SO' }]) {
    const rec = await read(await store.addRecord('Purchase_Request1', pr(extra)));
    assert.equal((await tonyCopies(rec.PR_No)).length + (await fentengCopies(rec.PR_No)).length, 0, JSON.stringify(extra));
  }
});

test('a PR from an inquiry goes only to the supplier whose quote was selected there', async () => {
  await raw.addRecord('Inquiry_Form', { INQ_No: 'INQ-1', Supplier_Quotes: [
    { Suppliers: 'Tony', Supplier_ID: `[${tony}]`, Selected: true, Availability: 'Confirmed', Initial_Price: '95', Final_Price: '90', Lead_Time: '7' },
    { Suppliers: 'Fenteng', Supplier_ID: `[${fenteng}]`, Selected: false },
  ] });
  const rec = await read(await store.addRecord('Purchase_Request1', pr({ inquiry_reference: 'INQ-1' })));
  assert.equal((await fentengCopies(rec.PR_No)).length, 0);
  const [t] = await tonyCopies(rec.PR_No);
  assert.equal(t.Response_Status, 'Selected');
  assert.deepEqual([t.Supplier_Selected_Supplier2[0].Final_Price_Supplier2, t.Supplier_Selected_Supplier2[0].Lead_Time_Supplier2, t.Supplier_Selected_Supplier2[0].Selected_Supplier2], ['90', '7', true]);

  await raw.addRecord('Inquiry_Form', { INQ_No: 'INQ-2', Supplier_Quotes: [{ Suppliers: 'Tony', Supplier_ID: `[${tony}]`, Selected: false }] });
  const open = await read(await store.addRecord('Purchase_Request1', pr({ inquiry_reference: 'INQ-2' })));
  assert.equal((await tonyCopies(open.PR_No)).length + (await fentengCopies(open.PR_No)).length, 2, 'nothing selected in the inquiry: both get it');
});

test('editing a PR updates the copies: changes reopen them, a selection decides who is Selected', async () => {
  const id = await store.addRecord('Purchase_Request1', pr());
  const no = (await read(id)).PR_No;
  await store.updateRecord('Purchase_Request1', id, { quantity: 7 }, { byForm: true });
  const [t1] = await tonyCopies(no);
  const [f1] = await fentengCopies(no);
  assert.deepEqual([t1.Response_Status, t1.quantity_Supplier2, f1.Response_Status, f1.quantity_Supplier1], ['Submit Response', '7', 'Submit Response', '7']);
  assert.match((await read(id)).Last_Update, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} (AM|PM)$/, 'Last_Update is stamped');

  const rec = await read(id);
  await store.updateRecord('Purchase_Request1', id, { Supplier_Selected: rec.Supplier_Selected.map((r) => (r.Suppliers === 'Tony' ? { ...r, Selected: true, Final_Price: '50', Lead_Time: '3' } : r)) }, { byForm: true });
  const [t2] = await tonyCopies(no);
  const [f2] = await fentengCopies(no);
  assert.deepEqual([t2.Response_Status, t2.edit_counter, f2.Response_Status, f2.edit_counter], ['Selected', '1', 'Not Selected', '0']);
});

test('deleting a PR removes the suppliers\' copies', async () => {
  const id = await store.addRecord('Purchase_Request1', pr());
  const no = (await read(id)).PR_No;
  assert.equal((await tonyCopies(no)).length + (await fentengCopies(no)).length, 2);
  await store.deleteRecord('Purchase_Request1', id);
  assert.equal((await tonyCopies(no)).length + (await fentengCopies(no)).length, 0);
});
