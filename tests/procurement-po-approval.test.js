// Create PO (approve_po_main, approve_po_tony / fenteng) and the supplier portal actions (acknowledge a PO, approve an RR),
// server/modules/procurement/po-approval.mjs and supplier-portal.mjs, on PGlite with the raw store (these handlers run without hooks).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { approvePOMain, approveSupplierPO } from '../server/modules/procurement/po-approval.mjs';
import { acknowledgePO, approveRR } from '../server/modules/procurement/supplier-portal.mjs';

const FORMS = ['Exceptions', 'Purchase_Request1', 'Purchase_Order', 'Sales_Order', 'Items', 'Customer', 'Suppliers', 'Tony_Fan_Purchase_Order', 'Fenteng_Lighting_Purchase_Order', 'Shipments',
  'Tony_Shipment', 'Fenteng_Shipment', 'Receiving', 'Replacement_Request', 'Tony_Fan_Replacement_Request', 'Fenteng_Lighting_Replacement_Request'];
let db, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); });

async function seed(supplier = 'Tony') {
  const customer = await store.addRecord('Customer', { customer_name: 'Sample Customer' });
  const lamp = await store.addRecord('Items', { item_name: 'Lamp', SKU: 'L-1', Rate: 150 });
  const shade = await store.addRecord('Items', { item_name: 'Shade', SKU: 'S-1', Rate: 0 });
  await store.addRecord('Suppliers', { Supplier_Name: { first_name: `${supplier} Fan`, last_name: '' }, Active_PO_Count: 0 });
  const pr = (no, item, sku, qty, extra = {}) => store.addRecord('Purchase_Request1', {
    PR_No: no, Sales_Order: 'SO-A', PR_Approved: false, PR_READY_FOR_PO: true, Selected_Supplier: supplier, Customer: customer, Items: item, sku, quantity: qty, unit: 'pcs',
    Selcted_Final_Cost: 100, Shipment_Mode: 'Air', Followed_Recommendation: 'Yes', Sales_Owner: 'HC Sales 1', Customer_Type: 'customer', ...extra,
  });
  await pr('PR-1', lamp, 'L-1', 2);
  await pr('PR-2', shade, 'S-1', 1);
  return { customer };
}
const prs = () => store.find('Purchase_Request1');

test('Create PO: the ready PRs of the sales order become ONE PO with their lines, the PRs are approved, nothing is made twice', async () => {
  await seed();
  const res = await approvePOMain({ soNo: 'SO-A' }, store);
  assert.equal(res.status, 'success', JSON.stringify(res));
  const pos = await store.find('Purchase_Order');
  assert.equal(pos.length, 1);
  assert.equal(pos[0].PO_No, 'PO-00001');
  assert.equal(pos[0].PO_Status, 'Draft');
  assert.equal(pos[0].Customer, 'Sample Customer');
  assert.deepEqual(pos[0].PO_Line_Items.map((l) => [l.PR_No, l.SKU, Number(l.QTY), Number(l.Line_Total)]), [['PR-1', 'L-1', 2, 200], ['PR-2', 'S-1', 1, 100]]);
  assert.equal(Number(pos[0].Total_PO_Value), 300);
  assert.equal(Number(pos[0].Total_Lines), 2);
  assert.equal(pos[0].Is_Locked === true || pos[0].Is_Locked === 'true', true);
  assert.deepEqual((await prs()).map((p) => [p.PR_Status, p.Link_PO_No, p.PR_Approved === true || p.PR_Approved === 'true']), [['Converted to PO', 'PO-00001', true], ['Converted to PO', 'PO-00001', true]]);
  assert.equal((await store.find('Sales_Order')).length, 1);
  assert.equal(Number((await store.find('Suppliers'))[0].Active_PO_Count), 2);
  // again: nothing eligible, nothing added
  const again = await approvePOMain({ soNo: 'SO-A' }, store);
  assert.equal(again.status, 'empty');
  assert.equal((await store.find('Purchase_Order')).length, 1);
  assert.equal((await store.find('Purchase_Order'))[0].PO_Line_Items.length, 2);
});

test('Create PO: a PR on hold, or one that did not follow the recommendation without a reason, is skipped and said so', async () => {
  const { customer } = await seed();
  const item = await store.addRecord('Items', { item_name: 'Base', SKU: 'B-1' });
  const mk = (no, extra) => store.addRecord('Purchase_Request1', { PR_No: no, Sales_Order: 'SO-A', PR_Approved: false, PR_READY_FOR_PO: true, Selected_Supplier: 'Tony', Customer: customer, Items: item, sku: 'B-1', quantity: 1, Selcted_Final_Cost: 5, ...extra });
  await mk('PR-3', { Hold_Status: 'On Hold' });
  await mk('PR-4', { Followed_Recommendation: 'No', Override_Reason: '' });
  const res = await approvePOMain({ soNo: 'SO-A' }, store);
  assert.match(res.message, /Skipped/);
  assert.match(res.message, /PR-3 \(On Hold\)/);
  assert.match(res.message, /PR-4/);
  assert.equal((await store.find('Purchase_Order'))[0].PO_Line_Items.length, 2);
  assert.equal((await prs()).filter((p) => p.PR_Approved === true || p.PR_Approved === 'true').length, 2);
});

test('Create PO for the supplier: its copy of the PO, one Pending shipment with the supplier copy, and one Receiving record, once', async () => {
  await seed();
  await approvePOMain({ soNo: 'SO-A' }, store);
  const res = await approveSupplierPO('Tony', { soNo: 'SO-A' }, store);
  assert.equal(res.status, 'success', JSON.stringify(res));
  assert.equal(res.processed, 2);
  const [copy] = await store.find('Tony_Fan_Purchase_Order');
  assert.equal(copy.PO_No_Supplier2, 'PO-00001');
  assert.equal(copy.PO_Status_Supplier2, 'Draft');
  assert.equal(Number(copy.Total_PO_Value_Supplier2), 300);
  assert.deepEqual(copy.PO_Line_Items_Supplier2.map((l) => [l.PR_No_Supplier2, Number(l.QTY_Supplier2), l.Item_Price_Supplier2]), [['PR-1', 2, '150'], ['PR-2', 1, '0']]);
  const ships = await store.find('Shipments');
  assert.equal(ships.length, 1);
  assert.equal(ships[0].Shipment_No, 'SHP-00001');
  assert.equal(ships[0].Shipment_Status, 'Pending');
  assert.equal(ships[0].Supplier, 'Tony');
  assert.equal(ships[0].Sales_Order, 'SO-A');
  assert.equal(ships[0].PO_Shipments.length, 2);
  const [tonyShip] = await store.find('Tony_Shipment');
  assert.equal(tonyShip.Shipment_No, 'SHP-00001');
  assert.equal(tonyShip.Supplier2_Shipment_Details.length, 2);
  const [rcv] = await store.find('Receiving');
  assert.equal(rcv.Receive_No1, 'RCV-00001');
  assert.deepEqual(rcv.Receiving_Line_Items.map((l) => [l.PR_No, Number(l.Expected_Qty), l.Line_Result]), [['PR-1', 2, 'Incomplete'], ['PR-2', 1, 'Incomplete']]);
  assert.equal(rcv.Receive_Status, 'Pending');
  // again: nothing is made a second time
  const again = await approveSupplierPO('Tony', { soNo: 'SO-A' }, store);
  assert.equal(again.processed, 0);
  for (const [form, n] of [['Tony_Fan_Purchase_Order', 1], ['Shipments', 1], ['Tony_Shipment', 1], ['Receiving', 1]]) assert.equal((await store.find(form)).length, n, form);
  assert.equal((await store.find('Receiving'))[0].Receiving_Line_Items.length, 2);
});

test('the other supplier\'s PRs do not go to Tony; Fenteng has its own copy', async () => {
  await seed('Fenteng');
  await approvePOMain({ soNo: 'SO-A' }, store);
  assert.equal((await approveSupplierPO('Tony', { soNo: 'SO-A' }, store)).processed, 0);
  assert.equal((await store.find('Tony_Fan_Purchase_Order')).length, 0);
  assert.equal((await approveSupplierPO('Fenteng', { soNo: 'SO-A' }, store)).processed, 2);
  const [copy] = await store.find('Fenteng_Lighting_Purchase_Order');
  assert.equal(copy.PO_No_Supplier1, 'PO-00001');
  assert.equal(copy.PO_Line_Items_Supplier1.length, 2);
  assert.equal((await store.find('Fenteng_Shipment')).length, 1);
});

test('the supplier acknowledges the PO: Confirmed on both POs, ETD / ETA on the shipment; a second try says already', async () => {
  await seed();
  await approvePOMain({ soNo: 'SO-A' }, store);
  await approveSupplierPO('Tony', { soNo: 'SO-A' }, store);
  assert.equal((await acknowledgePO('Tony', { poNoSupplier2: 'PO-00001', etd: '' , eta: '2026-12-10' }, store)).status, 'error');
  const res = await acknowledgePO('Tony', { poNoSupplier2: 'PO-00001', etd: '2026-12-01', eta: '2026-12-10' }, store);
  assert.equal(res.status, 'success', JSON.stringify(res));
  const [copy] = await store.find('Tony_Fan_Purchase_Order');
  assert.equal(copy.PO_Status_Supplier2, 'Confirmed');
  assert.ok(copy.Acknowledge_On_Supplier2);
  const [po] = await store.find('Purchase_Order');
  assert.equal(po.PO_Status, 'Confirmed');
  assert.ok(po.Acknowledge_On);
  const [ship] = await store.find('Shipments');
  assert.deepEqual([ship.ETD, ship.ETA], ['2026-12-01', '2026-12-10']);
  assert.equal((await acknowledgePO('Tony', { poNoSupplier2: 'PO-00001', etd: '2026-12-01', eta: '2026-12-10' }, store)).status, 'already');
  assert.equal((await acknowledgePO('Tony', { poNoSupplier2: 'PO-99999', etd: 'x', eta: 'y' }, store)).status, 'error');
  for (const [form, n] of [['Shipments', 1], ['Receiving', 1], ['Tony_Shipment', 1]]) assert.equal((await store.find(form)).length, n, form);
});

test('the supplier approves a Replacement Request: both copies become Acknowledged with the dates, once', async () => {
  const main = await store.addRecord('Replacement_Request', { RR_No: 'RR-00001', RR_Status: 'Open' });
  const copy = await store.addRecord('Tony_Fan_Replacement_Request', { RR_No: 'RR-00001', RR_Status: 'Open' });
  assert.equal((await approveRR('Tony', { rrRecordId: String(copy), expectedShipDate: '', eta: '2026-12-10' }, store)).status, 'error');
  const res = await approveRR('Tony', { rrRecordId: String(copy), expectedShipDate: '2026-12-05', eta: '2026-12-10' }, store);
  assert.equal(res.status, 'success', JSON.stringify(res));
  for (const [form, id] of [['Tony_Fan_Replacement_Request', copy], ['Replacement_Request', main]]) {
    const r = await store.getRecordById(form, id, { raw: true });
    assert.equal(r.RR_Status, 'Acknowledged', form);
    assert.equal(r.Expected_Ship_Date, '2026-12-05');
    assert.equal(r.ETA, '2026-12-10');
    assert.ok(r.Supplier_Acknowledge_Date);
  }
  const again = await approveRR('Tony', { rrRecordId: String(copy), expectedShipDate: '2026-12-05', eta: '2026-12-10' }, store);
  assert.equal(again.message, 'Already approved.');
  assert.equal((await approveRR('Tony', { rrRecordId: '99999999', expectedShipDate: 'a', eta: 'b' }, store)).message, 'Replacement Request not found.');
});

// ---------- Create RR from an exception ----------
import { createRRMain, createRRSupplier } from '../server/modules/procurement/replacement-requests.mjs';

async function exception(extra = {}) {
  await store.addRecord('Purchase_Order', { PO_No: 'PO-00001' });
  await store.addRecord('Tony_Fan_Purchase_Order', { PO_No_Supplier2: 'PO-00001' });
  return store.addRecord('Exceptions', {
    Exception_No: 'EXC-00001', Source_Module: 'Receiving', Exception_Status: 'Open', Sales_Order: 'SO-A', PO_No: 'PO-00001', Receiving_Line_ID: 'PR-1',
    Product_Context1: [
      { SKU: 'L-1', Item: 'Lamp', Supplier: 'Tony', Type_field: 'Damage', Qty: 1, Repairable: 'No', Quantity_of_damage_spare_s: 'Shade: 2, Others: 1', Spare_Part_Type_Other: 'Cable' },
      { SKU: 'L-1', Item: 'Lamp', Supplier: 'Tony', Type_field: 'Damage', Qty: 1, Repairable: 'No' },
      { SKU: 'S-1', Item: 'Shade', Supplier: 'Tony', Type_field: 'Missing', Qty: 2 },
      { SKU: 'B-1', Item: 'Base', Supplier: 'Tony', Type_field: 'Damage', Qty: 1, Repairable: 'Yes', Repair_Outcome: 'Pending' },
    ], ...extra,
  });
}

test('Create RR (main): one RR per SKU + type, repairable damage that is not "Not Fixed" is left out, the PO is stamped, nothing is made twice', async () => {
  const id = await exception();
  const res = await createRRMain({ exceptionId: String(id) }, store);
  assert.equal(res.created, 2, JSON.stringify(res));
  const rrs = await store.find('Replacement_Request');
  assert.deepEqual(rrs.map((r) => [r.RR_No, r.Source_Type, r.RR_SKU, Number(r.RR_Qty_Value), r.RR_Status]), [['RR-00001', 'Receiving Damage', 'L-1', 2, 'Open'], ['RR-00002', 'Receiving Missing', 'S-1', 2, 'Open']]);
  assert.equal(rrs[0].RR_Item_to_Replace, 'Shade, Cable');
  assert.equal(rrs[0].RR_Spare_Parts, 'Shade: 2, Cable: 1');
  assert.equal(rrs[0].Replacement_Summary[0].SO_No, 'SO-A');
  const [po] = await store.find('Purchase_Order');
  assert.equal(po.Damage_SKUs, 'L-1');
  assert.equal(po.Missing_SKUs, 'S-1');
  assert.equal((await store.find('Exceptions'))[0].Exception_Status, 'Under Review');
  const again = await createRRMain({ exceptionId: String(id) }, store);
  assert.equal(again.created, 0);
  assert.match(again.message, /No new RR needed/);
  assert.equal((await store.find('Replacement_Request')).length, 2);
});

test('Create RR (Tony): the copy takes the number of its main RR, once, and stamps the supplier PO; a different supplier gets none', async () => {
  const id = await exception();
  await createRRMain({ exceptionId: String(id) }, store);
  const res = await createRRSupplier('Tony', { exceptionId: String(id) }, store);
  assert.equal(res.created, 2, JSON.stringify(res));
  const copies = await store.find('Tony_Fan_Replacement_Request');
  assert.deepEqual(copies.map((r) => [r.RR_No, r.Source_Type, r.RR_Status]), [['RR-00001', 'Receiving Damage', 'Open'], ['RR-00002', 'Receiving Missing', 'Open']]);
  const [spo] = await store.find('Tony_Fan_Purchase_Order');
  assert.deepEqual([spo.Damage_SKUs_Supplier2, spo.Missing_SKUs_Supplier2], ['L-1', 'S-1']);
  assert.equal((await createRRSupplier('Tony', { exceptionId: String(id) }, store)).created, 0);
  assert.equal((await store.find('Tony_Fan_Replacement_Request')).length, 2);
  assert.equal((await createRRSupplier('Fenteng', { exceptionId: String(id) }, store)).created, 0);
  assert.equal((await store.find('Fenteng_Lighting_Replacement_Request')).length, 0);
});

test('Create RR: an exception that does not exist is refused', async () => {
  assert.equal((await createRRMain({ exceptionId: '99999999' }, store)).message, 'Exception not found.');
});
