// create_receiving_from_shipment and clone_shipment_for_replacement
// (server/modules/procurement/receiving-buttons.mjs & clone-shipment.mjs), run on PGlite through the
// real custom-API dispatch with the RAW store (custom APIs write through rawStore, no hook re-fire).
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { invokeCustomApi } from '../server/custom-apis.mjs';
import { idOf } from '../server/workflows/deluge.mjs';

const FORMS = ['Purchase_Order', 'Shipments', 'Receiving', 'Exceptions', 'Exception_Control1', 'Purchase_Request1',
  'Replacement_Request', 'Tony_Fan_Replacement_Request', 'Fenteng_Lighting_Replacement_Request',
  'Tony_Shipment', 'Fenteng_Shipment', 'Sales_Order_Fulfillment', 'Pre_Order_FF', 'Sales_Order'];
let db, raw;
const ctx = { user: 'tester@homecartel.com' };
const text = (v) => (v == null ? '' : String(v));
const read = (form, id) => raw.getRecordById(form, id, { raw: true });
const call = (name, payload) => invokeCustomApi(name, payload, raw, ctx);

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of FORMS) await db.query(`DELETE FROM "${f}"`); await db.query('DELETE FROM _number_series'); });

// A PO + a shipment with two lines, added through the RAW store so no Receiving workflow fires.
async function seedShipment(extra = {}) {
  const po = await raw.addRecord('Purchase_Order', { PO_No: 'PO-00001', Customer: 'ACME' });
  const ship = await raw.addRecord('Shipments', {
    Shipment_No: 'SHP-00001', PO_No: po, Sales_Order: 'SO-1', Customer: 'ACME', Supplier: 'Tony',
    Shipment_Status: 'In Transit', Sales_Owner: 'HC Sales 1',
    PO_Shipments: [
      { PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Shipment_QTY: 3, Shipping_Mode: 'Sea' },
      { PR_No: 'PR-2', SKU: 'S-1', Item_Name: 'Switch', Shipment_QTY: 2, Shipping_Mode: 'Sea' },
    ],
    ...extra,
  });
  return { po, ship };
}

// ---------- create_receiving_from_shipment ----------
test('create_receiving_from_shipment builds RCV with lines from the shipment', async () => {
  const { ship } = await seedShipment();
  const out = await call('create_receiving_from_shipment', { shipmentId: ship });
  assert.equal(out.status, 'success');
  assert.match(out.receiveNo, /^RCV-\d{5}$/);
  const r = await read('Receiving', out.receivingId);
  assert.equal(r.Receive_No1, out.receiveNo);
  assert.equal(idOf(r.Shipments), String(ship));
  assert.equal(r.Receiving_Line_Items.length, 2);
  assert.deepEqual(r.Receiving_Line_Items.map((l) => Number(l.Expected_Qty)), [3, 2]);
  assert.ok(r.Receiving_Line_Items.every((l) => l.Bin_location === 'Receiving Area'));
  assert.equal((await read('Shipments', ship)).Receiving_Record_Created, true);
});

test('second call for the same shipment returns already, no duplicate', async () => {
  const { ship } = await seedShipment();
  const first = await call('create_receiving_from_shipment', { shipmentId: ship });
  const second = await call('create_receiving_from_shipment', { shipmentId: ship });
  assert.equal(second.status, 'already');
  assert.equal(String(second.receivingId), String(first.receivingId));
  assert.equal((await raw.find('Receiving')).length, 1);
});

test('unknown shipment id returns error', async () => {
  const out = await call('create_receiving_from_shipment', { shipmentId: '4662244000099999999' });
  assert.equal(out.status, 'error');
  assert.match(out.message, /Shipment not found/);
});

// ---------- clone_shipment_for_replacement ----------
// An acknowledged Tony RR traced to a PO that already has a shipment AND a receiving record.
async function seedReplacement({ supplier = 'Tony', sourceModule = 'Receiving', rrStatus = 'Acknowledged', poNo = 'PO-00001', excNo = 'EXC-1', qty = 2, existingRecv = true } = {}) {
  const po = await raw.addRecord('Purchase_Order', { PO_No: poNo, Customer: 'ACME' });
  const origShip = await raw.addRecord('Shipments', {
    Shipment_No: 'SHP-00001', PO_No: po, Sales_Order: 'SO-1', Customer: 'ACME', Supplier: supplier,
    Shipment_Status: 'Delivered', Sales_Owner: 'HC Sales 1', Target_Date: '2026-11-01', Supplier_Target_Date: '2026-10-20',
    PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Shipment_QTY: 5, Shipping_Mode: 'Sea' }],
  });
  let recv = null;
  if (existingRecv) {
    recv = await raw.addRecord('Receiving', {
      Receive_No1: 'RCV-00001', Shipments: origShip, SO_No: 'SO-1', PO_No: poNo, Customer_Name: 'ACME', Supplier: supplier,
      Receiving_Line_Items: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Expected_Qty: 5, Accepted_Qty: 3 }],
    });
  }
  await raw.addRecord('Exceptions', { Exception_No: excNo, PO_No: poNo, Source_Module: 'Receiving' });
  const rrNo = 'RR-00001';
  const rr = await raw.addRecord('Replacement_Request', {
    RR_No: rrNo, RR_Supplier: supplier, Source_Module: sourceModule, Source_Exception_No: excNo,
    RR_SKU: 'L-1', RR_Item_Name: 'Lamp', RR_Qty_Value: qty, RR_PR_No: 'PR-1', RR_SO: 'SO-1',
    Expected_Ship_Date: '2026-12-01', ETA: '2026-12-10', RR_Status: rrStatus,
  });
  const copyForm = supplier.includes('Fenteng') ? 'Fenteng_Lighting_Replacement_Request' : 'Tony_Fan_Replacement_Request';
  await raw.addRecord(copyForm, { RR_No: rrNo, RR_Status: rrStatus, Shipment_Mode: supplier.includes('Fenteng') ? 'Air' : 'Sea' });
  return { po, origShip, recv, rr, rrNo };
}

test('clone_shipment_for_replacement creates a replacement shipment reusing the RCV', async () => {
  const { recv, rr } = await seedReplacement();
  const out = await call('clone_shipment_for_replacement', { rrRecordId: rr });
  assert.equal(out.status, 'success');
  const newShip = await read('Shipments', out.shipmentId);
  assert.match(newShip.Shipment_No, /^SHP-\d{5}$/);
  assert.equal(newShip.Shipment_Status, 'Pending');
  assert.equal(newShip.Supplier, 'Tony');
  assert.equal(newShip.ETD, '2026-12-01');
  assert.equal(newShip.ETA, '2026-12-10');
  assert.equal(newShip.PO_Shipments.length, 1);
  assert.equal(Number(newShip.PO_Shipments[0].Shipment_QTY), 2);
  assert.equal(newShip.PO_Shipments[0].Shipping_Mode, 'Sea');
  assert.equal(newShip.Receiving_Record_Created, true);
  // the SAME receiving record is re-pointed at the new shipment; its Expected_Qty is left alone
  const r = await read('Receiving', recv);
  assert.equal(idOf(r.Shipments), String(out.shipmentId));
  assert.equal(Number(r.Receiving_Line_Items[0].Expected_Qty), 5);
  assert.equal((await raw.find('Receiving')).length, 1);
  // the RR remembers the cloned shipment, and the supplier gets its own copy
  assert.equal((await read('Replacement_Request', rr)).Cloned_Shipment_No, newShip.Shipment_No);
  const copies = await raw.find('Tony_Shipment', (c) => text(c.Parent_Shipment_ID) === String(out.shipmentId));
  assert.equal(copies.length, 1);
  assert.equal(copies[0].Supplier2_Shipment_Details.length, 1);
});

test('cloning twice for one RR is refused (already logged)', async () => {
  const { rr } = await seedReplacement();
  await call('clone_shipment_for_replacement', { rrRecordId: rr });
  const second = await call('clone_shipment_for_replacement', { rrRecordId: rr });
  assert.equal(second.status, 'error');
  assert.match(second.message, /already logged/);
  assert.equal((await raw.find('Shipments')).length, 2); // original + one clone, no third
});

test('an RR the supplier has not acknowledged cannot be cloned', async () => {
  const { rr } = await seedReplacement({ rrStatus: 'Open' });
  const out = await call('clone_shipment_for_replacement', { rrRecordId: rr });
  assert.equal(out.status, 'error');
  assert.match(out.message, /Acknowledged/);
  assert.equal((await raw.find('Shipments')).length, 1); // only the original
});

test('a Fulfillment EXC clone makes a NEW receiving with explicit totals and the supplier copy', async () => {
  const { rr } = await seedReplacement({ supplier: 'Fenteng', sourceModule: 'Fulfillment EXC', poNo: 'PO-00002', excNo: 'EXC-2', qty: 4, existingRecv: false });
  const out = await call('clone_shipment_for_replacement', { rrRecordId: rr });
  assert.equal(out.status, 'success');
  const recvs = await raw.find('Receiving', (r) => idOf(r.Shipments) === String(out.shipmentId));
  assert.equal(recvs.length, 1);
  const nr = recvs[0];
  assert.match(nr.Receive_No1, /^RCV-\d{5}$/);
  assert.equal(Number(nr.Total_Expected_Qty), 4);
  assert.equal(Number(nr.Total_Accepted_Qty), 0);
  assert.equal(Number(nr.Total_Lines), 1);
  assert.equal(Number(nr.Incomplete_Lines), 1);
  assert.equal(nr.Receive_Status, 'Pending');
  assert.equal(nr.Source_Module, 'Fulfillment EXC');
  assert.equal(nr.Receiving_Line_Items[0].Shipment_Mode_When_Received, 'Air');
  const copies = await raw.find('Fenteng_Shipment', (c) => text(c.Parent_Shipment_ID) === String(out.shipmentId));
  assert.equal(copies.length, 1);
});

test('an unknown RR id returns error', async () => {
  const out = await call('clone_shipment_for_replacement', { rrRecordId: '4662244000099999999' });
  assert.equal(out.status, 'error');
  assert.match(out.message, /Replacement Request not found/);
});