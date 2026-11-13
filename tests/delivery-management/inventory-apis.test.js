// Delivery Management, D4: create_shipment_order and create_sales_return_books
// (server/modules/delivery-management/inventory-apis.mjs), run on PGlite. Zoho Inventory is a stand-in object, so no
// test ever reaches Zoho. Tests marked "mirrors Zoho" follow the Deluge function literally.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { BooksError } from '../../server/books/client.mjs';
import { customApis } from '../../server/modules/index.mjs';
import { truthy } from '../../server/workflows/deluge.mjs';

let db, store;
before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  store = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
});
beforeEach(async () => { for (const f of ['Service_Appointment_Form', 'Package_Shipments', 'Sales_Returns_Form']) await db.query(`DELETE FROM "${f}"`); });

// A stand-in Inventory: `routes` maps "METHOD /path" to an answer (or a function of the request); every call is recorded.
function inventory(routes) {
  const calls = [];
  const call = (method) => async (path, a, b) => {
    const opts = method === 'GET' ? a : b;
    const body = method === 'GET' ? undefined : a;
    calls.push({ method, path, query: opts?.query, body });
    const answer = routes[`${method} ${path}`];
    if (answer === undefined) throw new BooksError(`no route ${method} ${path}`, { status: 404 });
    const out = typeof answer === 'function' ? answer({ query: opts?.query, body }) : answer;
    if (out instanceof Error) throw out;
    return out;
  };
  return { calls, books: { inventory: { get: call('GET'), post: call('POST') } } };
}

// ----- create_shipment_order -----
const shipmentSetup = async (ps = {}) => {
  const sa = await store.addRecord('Service_Appointment_Form', { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only' });
  const pack = await store.addRecord('Package_Shipments', { Service_Appointment_ID: sa, Sales_Order: 'SO-1', Package_Number: 'PAC-1', Shipment_Created: false, ...ps });
  return { sa, pack };
};
const shipmentPayload = (sa, pack, extra = {}) => ({ recordId: sa, packageShipmentId: pack, shipDate: '2026-12-01', deliveryDate: '2026-12-02', carrier: 'Own Fleet', shippingCharge: '0', ceilingMaterial: 'Gypsum', ceilingHeight: '3m', siteWiringReady: 'Yes', preparedBy: 'Maria', deliveryTeam: 'A', ...extra });
const goodShipmentRoutes = {
  'GET /packages': { packages: [{ package_number: 'PAC-0', package_id: 'p0', salesorder_id: 's0' }, { package_number: 'PAC-1', package_id: 'p1', salesorder_id: 's1' }] },
  'POST /shipmentorders': { shipmentorder: { shipment_id: '999', shipment_number: 'SH-0001' } },
};

test('shipment order: finds the package in Inventory, creates the shipment with the 7 custom fields, and marks the package', async () => {
  const { sa, pack } = await shipmentSetup();
  const inv = inventory(goodShipmentRoutes);
  const out = await customApis.create_shipment_order(shipmentPayload(sa, pack), store, { books: inv.books });
  assert.deepEqual(out, { status: 'success', message: 'Shipment Order SH-0001 created.', shipmentorder_id: '999', shipmentorder_no: 'SH-0001' });
  assert.deepEqual(inv.calls[0].query, { salesorder_number: 'SO-1' });
  const create = inv.calls[1];
  assert.equal(create.path, '/shipmentorders');
  assert.deepEqual(create.query, { salesorder_id: 's1', package_ids: 'p1' });
  assert.equal(create.body.delivery_method, 'Own Fleet');
  assert.equal(create.body.send_notification, false);
  assert.deepEqual(create.body.shipmentorder_custom_fields.map((f) => f.value), ['2026-12-02', 'Delivery Only', 'Gypsum', '3m', 'Yes', 'Maria', 'A']);
  const row = await store.getRecordById('Package_Shipments', pack, { raw: true });
  assert.ok(truthy(row.Shipment_Created));
  assert.deepEqual([row.Shipment_Order_No, row.Shipment_Order_ID], ['SH-0001', '999']);
});

test('shipment order: a type of delivery sent by the widget wins over the appointment\'s; the shipment id stands in for a missing number', async () => {
  const { sa, pack } = await shipmentSetup();
  const inv = inventory({ ...goodShipmentRoutes, 'POST /shipmentorders': { shipmentorder: { shipment_id: '999' } } });
  const out = await customApis.create_shipment_order(shipmentPayload(sa, pack, { typeOfDelivery: 'With Installation' }), store, { books: inv.books });
  assert.equal(out.shipmentorder_no, '999');
  assert.equal(inv.calls[1].body.shipmentorder_custom_fields[1].value, 'With Installation');
});

test('shipment order: refuses a missing package or appointment, a second shipment, and a package with no number', async () => {
  const { sa, pack } = await shipmentSetup();
  const books = inventory(goodShipmentRoutes).books;
  assert.equal((await customApis.create_shipment_order(shipmentPayload(sa, '4662244000099999999'), store, { books })).message, 'Package Shipment record not found.');
  assert.equal((await customApis.create_shipment_order(shipmentPayload('4662244000099999999', pack), store, { books })).message, 'Service Appointment record not found.');
  const sent = await shipmentSetup({ Shipment_Created: true, Shipment_Order_No: 'SH-7' });
  assert.equal((await customApis.create_shipment_order(shipmentPayload(sent.sa, sent.pack), store, { books })).message, 'Already sent — Shipment Order SH-7 already exists for this delivery.');
  const noNumber = await shipmentSetup({ Package_Number: '' });
  assert.match((await customApis.create_shipment_order(shipmentPayload(noNumber.sa, noNumber.pack), store, { books })).message, /^No Package Number on this record/);
});

test('shipment order: a package that Inventory does not have, an Inventory refusal and an Inventory error are answered, not thrown', async () => {
  const { sa, pack } = await shipmentSetup();
  let out = await customApis.create_shipment_order(shipmentPayload(sa, pack), store, { books: inventory({ 'GET /packages': { packages: [] } }).books });
  assert.equal(out.message, "Package 'PAC-1' not found in Inventory for Sales Order SO-1 — cannot create a Shipment without it.");
  out = await customApis.create_shipment_order(shipmentPayload(sa, pack), store, { books: inventory({ ...goodShipmentRoutes, 'POST /shipmentorders': new BooksError('Invalid value passed for package_ids', { code: 4 }) }).books });
  assert.equal(out.status, 'error');
  assert.match(out.message, /^Inventory rejected the create — Invalid value/);
  out = await customApis.create_shipment_order(shipmentPayload(sa, pack), store, { books: inventory({ 'GET /packages': new BooksError('Zoho Books is not configured', { code: 'not_configured' }) }).books });
  assert.equal(out.message, 'Zoho Books is not configured');
  assert.equal((await customApis.create_shipment_order(shipmentPayload(sa, pack), store, {})).message, 'Zoho Books is not available in this backend.');
  assert.ok(!truthy((await store.getRecordById('Package_Shipments', pack, { raw: true })).Shipment_Created));
});

// ----- create_sales_return_books -----
const returnSetup = (extra = {}) => store.addRecord('Sales_Returns_Form', { Sales_Order: 'SO-1', RMA: 'RMA-1', SR_CREATION_STATUS: 'PENDING', ...extra });
const returnPayload = (recordId, items, extra = {}) => ({ recordId, salesOrderNo: 'SO-1', rmaVal: 'RMA-1', dateVal: '2026-12-03', reasonVal: 'Damaged', subReasonVal: 'Damaged Item', returnedByVal: 'Maria', itemsJson: JSON.stringify({ items }), ...extra });
const goodReturnRoutes = {
  'GET /salesorders': { salesorders: [{ salesorder_id: 'so1' }] },
  'GET /salesorders/so1': { salesorder: { line_items: [{ line_item_id: 'l1', item_id: 'i1', sku: 'L-1' }, { line_item_id: 'l2', item_id: 'i1', sku: 'L-1' }, { line_item_id: 'l3', item_id: 'i3', sku: 'S-1' }] } },
  'POST /salesreturns': { salesreturn: { salesreturn_id: 'sr1', salesreturn_number: 'SR-0001', line_items: [{ line_item_id: 'r1', quantity: 2 }] } },
  'POST /salesreturnreceives': { salesreturnreceive: { id: 'rec1' } },
};

test('sales return: matches each SKU to an unused order line, creates the return, receives the stock, and writes the Books ids back', async () => {
  const id = await returnSetup();
  const inv = inventory(goodReturnRoutes);
  const items = [{ SKU: 'L-1', Return_Quantity: 2 }, { SKU: 'L-1', Return_Quantity: '1' }, { SKU: 'S-1', Return_Quantity: 0 }, { SKU: '', Return_Quantity: 1 }];
  const out = await customApis.create_sales_return_books(returnPayload(id, items), store, { books: inv.books });
  assert.deepEqual(out, { status: 'success', message: 'Sales Return SR-0001 created and stock received back into Inventory.', salesreturn_id: 'sr1', salesreturn_no: 'SR-0001', receive_status: 'success' });
  const create = inv.calls.find((c) => c.path === '/salesreturns');
  assert.deepEqual(create.query, { salesorder_id: 'so1' });
  assert.deepEqual(create.body.line_items, [{ item_id: 'i1', salesorder_item_id: 'l1', quantity: 2 }, { item_id: 'i1', salesorder_item_id: 'l2', quantity: 1 }]);
  assert.deepEqual(create.body.custom_fields.map((f) => f.value), ['Damaged Item', 'Maria']);
  assert.equal(create.body.reason, 'Damaged');
  const receive = inv.calls.find((c) => c.path === '/salesreturnreceives');
  assert.deepEqual([receive.query, receive.body], [{ salesreturn_id: 'sr1' }, { line_items: [{ line_item_id: 'r1', quantity: 2 }] }]);
  const row = await store.getRecordById('Sales_Returns_Form', id, { raw: true });
  assert.deepEqual([row.Books_SalesReturn_ID, row.Books_SalesReturn_No, row.RMA, row.SR_CREATION_STATUS], ['sr1', 'SR-0001', 'SR-0001', 'CREATED']);
});

test('sales return: unmatched SKUs are reported; none matching refuses; a failed stock receive does not undo the return', async () => {
  const id = await returnSetup();
  let out = await customApis.create_sales_return_books(returnPayload(id, [{ SKU: 'X-9', Return_Quantity: 1 }]), store, { books: inventory(goodReturnRoutes).books });
  assert.equal(out.message, 'No returned item matched a real line on Sales Order SO-1. Unmatched SKUs: [X-9]');

  out = await customApis.create_sales_return_books(returnPayload(id, [{ SKU: 'S-1', Return_Quantity: 1 }, { SKU: 'X-9', Return_Quantity: 1 }]), store, { books: inventory({ ...goodReturnRoutes, 'POST /salesreturnreceives': new BooksError('stock error') }).books });
  assert.equal(out.status, 'success');
  assert.equal(out.receive_status, 'failed');
  assert.equal(out.message, 'Sales Return SR-0001 created in Books — but the stock Receive step failed (stock error). Return is still valid; receive stock manually in Books.');
  assert.equal(out.unmatched_skus, '[X-9]');
  assert.equal((await store.getRecordById('Sales_Returns_Form', id, { raw: true })).SR_CREATION_STATUS, 'CREATED');
});

test('sales return: refuses a missing record, one already sent, an order Inventory does not have, and an Inventory refusal', async () => {
  const books = inventory(goodReturnRoutes).books;
  assert.equal((await customApis.create_sales_return_books(returnPayload('4662244000099999999', []), store, { books })).message, 'Sales Return record not found.');
  const sent = await returnSetup({ Books_SalesReturn_ID: 'sr0', Books_SalesReturn_No: 'SR-0000' });
  assert.equal((await customApis.create_sales_return_books(returnPayload(sent, []), store, { books })).message, 'Already sent to Books (Sales Return SR-0000).');
  const id = await returnSetup();
  assert.equal((await customApis.create_sales_return_books(returnPayload(id, [{ SKU: 'L-1', Return_Quantity: 1 }]), store, { books: inventory({ 'GET /salesorders': { salesorders: [] } }).books })).message, "Sales Order 'SO-1' not found in Inventory — cannot resolve item references.");
  const refused = await customApis.create_sales_return_books(returnPayload(id, [{ SKU: 'L-1', Return_Quantity: 1 }]), store, { books: inventory({ ...goodReturnRoutes, 'POST /salesreturns': new BooksError('Return quantity exceeds the shipped quantity') }).books });
  assert.match(refused.message, /^Inventory rejected the create — Return quantity exceeds/);
  assert.equal((await store.getRecordById('Sales_Returns_Form', id, { raw: true })).SR_CREATION_STATUS, 'PENDING');
});

test('both APIs are ported handlers now, not placeholders', () => {
  assert.equal(customApis.create_shipment_order.notPorted, undefined);
  assert.equal(customApis.create_sales_return_books.notPorted, undefined);
});
