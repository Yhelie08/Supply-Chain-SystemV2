// End-to-end check of the Procurement data process through the REAL server (child process, in-memory Postgres, signed-in admin, HTTP API):
// Purchase Order -> Shipment -> Receiving -> Exception, Replacement Request, and the pages that show them. Fails on any server error.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startE2EHarness } from './helpers/e2e-harness.mjs';

let harness, api;
const rec = (res) => res.data?.data;
const rows = async (form, criteria) => { const r = await api.getRecords(form, criteria); return r.data?.data || []; };

before(async () => {
  harness = await startE2EHarness({ backend: 'pg' });
  await harness.seedUser({ email: 'admin@flow.local', password: 'AdminPassword123!', role: 'admin' });
  api = (await harness.login('admin@flow.local', 'AdminPassword123!')).client;
});
after(async () => { if (harness) await harness.stop(); });

test('server started on the in-memory database (not on a real one)', () => {
  assert.match(harness.logs.join(''), /schema ready/);
});

test('Purchase Order -> Shipment -> Receiving, through the API', async () => {
  const so = await api.addRecords('Sales_Order', { Sales_Order_Number: 'SO-E2E' });
  assert.equal(so.data.code, 3000, JSON.stringify(so.data));
  const po = await api.addRecords('Purchase_Order', {
    SO_No: so.data.data.ID, Customer: 'E2E Customer',
    PO_Line_Items: [{ PR_No: 'PR-1', SKU: 'L-1', Item: 'Lamp', QTY: 2, Supplier: 'Tony', Line_Total: 20, Shipping_Mode: 'Air' }, { PR_No: 'PR-2', SKU: 'S-1', Item: 'Shade', QTY: 1, Supplier: 'Tony', Line_Total: 5, Shipping_Mode: 'Sea' }],
  });
  assert.equal(po.data.code, 3000, JSON.stringify(po.data));
  const [poRow] = await rows('Purchase_Order');
  assert.equal(poRow.PO_No, 'PO-00001');
  assert.equal(Number(poRow.Total_PO_Value), 25);
  assert.equal(Number(poRow.Total_Lines), 2);
  assert.equal(poRow.Mixed_Shipping === true || poRow.Mixed_Shipping === 'true', true);

  const ship = await api.addRecords('Shipments', { PO_No: po.data.data.ID, PO_Shipments: [{ PR_No: 'PR-1', SKU: 'L-1', Item_Name: 'Lamp', Ordered_QTY: 2, Shipment_QTY: 2 }, { PR_No: 'PR-2', SKU: 'S-1', Item_Name: 'Shade', Ordered_QTY: 1, Shipment_QTY: 1 }] });
  assert.equal(ship.data.code, 3000, JSON.stringify(ship.data));
  const [shipRow] = await rows('Shipments');
  assert.equal(shipRow.Shipment_No, 'SHP-00001');
  assert.equal(shipRow.Sales_Order, 'SO-E2E');
  assert.equal(shipRow.Supplier, 'Tony');

  const receivings = await rows('Receiving');
  assert.equal(receivings.length, 1, 'exactly one Receiving record');
  assert.equal(receivings[0].Receive_No1, 'RCV-00001');
  assert.equal(receivings[0].Receiving_Line_Items.length, 2);

  // count the goods: one lamp damaged, the shade complete; ask for the exception
  const lines = receivings[0].Receiving_Line_Items.map((l) => (l.SKU === 'L-1' ? { ...l, Accepted_Qty: 1, Damage_Qty: 1 } : { ...l, Accepted_Qty: 1 }));
  const upd = await api.updateRecordById('Receiving', receivings[0].ID, { Receiving_Line_Items: lines, Create_Exception_Requested: true });
  assert.equal(upd.data.code, 3000, JSON.stringify(upd.data));
  const [after1] = await rows('Receiving');
  assert.equal(after1.Receive_Status, 'Partial Received');
  assert.equal(Number(after1.Exception_Count), 1);
  const exc = await rows('Exceptions');
  assert.equal(exc.length, 1);
  assert.equal(exc[0].Exception_No, 'EXC-00001');
  assert.equal(exc[0].Exception_Status, 'Open');
  assert.equal(exc[0].Product_Context1.length, 1);
  assert.equal((await rows('Shipments'))[0].Shipment_Status, 'Delivered');

  // saving again, and asking again, adds no second exception
  await api.updateRecordById('Receiving', receivings[0].ID, { Receiving_Notes: 'again', Create_Exception_Requested: true });
  assert.equal((await rows('Exceptions')).length, 1);

  // an over-count is refused with a message
  const bad = await api.updateRecordById('Receiving', receivings[0].ID, { Receiving_Line_Items: lines.map((l) => ({ ...l, Accepted_Qty: 99 })) });
  assert.notEqual(bad.data.code, 3000);
  assert.match(JSON.stringify(bad.data), /cannot exceed Expected/);
});

test('Exception and Replacement Request status rules through the API', async () => {
  const [exc] = await rows('Exceptions');
  const noAction = await api.updateRecordById('Exceptions', exc.ID, { Exception_Status: 'Resolved' });
  assert.notEqual(noAction.data.code, 3000);
  const ok = await api.updateRecordById('Exceptions', exc.ID, { Exception_Status: 'Resolved', Resolution_Action: 'Replaced' });
  assert.equal(ok.data.code, 3000, JSON.stringify(ok.data));

  const rr = await api.addRecords('Replacement_Request', { RR_Status: 'Closed' });
  assert.equal(rr.data.code, 3000, JSON.stringify(rr.data));
  const [rrRow] = await rows('Replacement_Request');
  assert.equal(rrRow.RR_No, 'RR-00001');
  assert.equal(rrRow.RR_Status, 'Open');
  const noNotes = await api.updateRecordById('Replacement_Request', rrRow.ID, { RR_Status: 'Closed' });
  assert.notEqual(noNotes.data.code, 3000);
});

test('the Procurement and Fulfillment pages open', async () => {
  for (const [section, tab] of [['Procurement', 'Purchase Order'], ['Procurement', 'Shipments'], ['Procurement', 'Receiving'], ['Procurement', 'Replacement Request'], ['Procurement', 'Exceptions'], ['Fulfillment', 'Pre-Order'], ['Fulfillment', 'Order Readiness'], ['Fulfillment', 'To Ship']]) {
    const res = await api.getWidget(section, tab, tab === 'Purchase Order' ? 'PO.html' : 'index.html'); // the PO widget's page is PO.html
    assert.equal(res.status, 200, `${section}/${tab} -> ${res.status}`);
  }
});

test('the server logged no errors during the whole flow', () => {
  const errors = harness.logs.filter((l) => /Error|ECONN|UnhandledPromise|TypeError|ReferenceError|failed/i.test(l) && !/schema ready/.test(l));
  assert.deepEqual(errors, []);
});
