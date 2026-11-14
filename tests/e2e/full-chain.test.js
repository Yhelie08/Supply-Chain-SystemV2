// The whole chain through the REAL server (child process, in-memory Postgres, HTTP API as a signed-in admin), the way the widgets write:
//   Procurement (PO -> Shipment -> Receiving)
//   -> Fulfillment (package -> Readiness Gate -> Pick -> Pack & QC (2 pass, 1 fails) -> Exception -> repair -> QC again -> To Ship -> Dispatch)
//   -> Delivery (Initial Scheduling -> Service Request -> Appointment -> Dispatched -> In Transit -> Delivered -> Completed = Archived page)
//   and the To Ship "Archive" of the order.
// The two links that need Zoho Books / Inventory (the package number of a sales order, and receiving -> pre-order) are written by hand, as
// the on-hold sync would. Everything else runs on the app's own workflows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startE2EHarness } from './helpers/e2e-harness.mjs';

let harness, api;
const ok = (res, what) => assert.equal(res.data?.code, 3000, `${what}: ${JSON.stringify(res.data)}`);
const rows = async (report, criteria) => { const r = await api.getRecords(report, criteria); return r.data?.data || []; };
const one = async (report, criteria) => { const r = await rows(report, criteria); assert.equal(r.length, 1, `${report} ${criteria}: ${r.length} rows`); return r[0]; };
const isTrue = (v) => v === true || v === 'true';
const SO = 'SO-CHAIN';
const PAC = 'PAC-CHAIN';
const state = {};

before(async () => {
  harness = await startE2EHarness({ backend: 'pg' });
  await harness.seedUser({ email: 'admin@chain.local', password: 'AdminPassword123!', role: 'admin' });
  api = (await harness.login('admin@chain.local', 'AdminPassword123!')).client;
});
after(async () => { if (harness) await harness.stop(); });

// ---------------- 1. Procurement ----------------
test('1. Procurement: PO -> Shipment -> Receiving, all 3 lamps counted in', async () => {
  const so = await api.addRecords('Sales_Order', { Sales_Order_Number: SO });
  ok(so, 'sales order');
  const po = await api.addRecords('Purchase_Order', { SO_No: so.data.data.ID, Customer: 'Chain Customer', PO_Line_Items: [{ PR_No: 'PR-C1', SKU: 'LAMP-1', Item: 'Chain Lamp', QTY: 3, Supplier: 'Tony', Line_Total: 300, Shipping_Mode: 'Air' }] });
  ok(po, 'purchase order');
  const ship = await api.addRecords('Shipments', { PO_No: po.data.data.ID, PO_Shipments: [{ PR_No: 'PR-C1', SKU: 'LAMP-1', Item_Name: 'Chain Lamp', Ordered_QTY: 3, Shipment_QTY: 3 }] });
  ok(ship, 'shipment');
  const rcv = await one('Receiving');
  assert.equal((await one('Shipments')).Sales_Order, SO);
  const lines = rcv.Receiving_Line_Items.map((l) => ({ ...l, Accepted_Qty: 3 }));
  ok(await api.updateRecordById('Receiving', rcv.ID, { Receiving_Line_Items: lines }), 'receiving count');
  const done = await one('Receiving');
  assert.equal(done.Receive_Status, 'Received');
  assert.equal((await one('Shipments')).Shipment_Status, 'Delivered');
  assert.equal((await rows('Exceptions')).length, 0);
});

// ---------------- 2. Fulfillment ----------------
test('2. Fulfillment: the package (written by hand: Books is on hold) -> Order Readiness with its Gate record', async () => {
  const customer = await api.addRecords('Customer', { customer_name: 'Chain Customer', Email: 'chain@example.test', Phone_Number: '+63 900 111 2222', Billing_Address: { district_city: 'Makati' } });
  ok(customer, 'customer');
  const sof = await api.addRecords('Sales_Order_Fulfillment', {
    SO_No: SO, Fulfillment_Stage: 'Waiting For Package', Package: PAC, Status: 'Yes', Customer: customer.data.data.ID, Customer_Type: 'customer', order_type: 'Normal',
    Delivery_Type: 'Delivery Only', target_delivery_date: '2026-12-20', Shipping_Address: '1 Chain St, Makati',
    Item_Details1: [{ Item: 'Chain Lamp', SKU: 'LAMP-1', Quantity: '3', Bin_Location: 'A-01' }],
  });
  ok(sof, 'sales order fulfillment');
  state.sof = sof.data.data.ID;
  assert.equal((await one('Sales_Order_Fulfillment')).Fulfillment_Stage, 'Order Readiness');
  const gate = await one('Sales_Order_Readiness_Gate');
  assert.equal(gate.Package_Order, PAC);
  assert.equal(gate.payment_status, 'Yes');
  assert.equal(String(gate.Quantity), '3');
  state.gate = gate.ID;
});

test('3. Release -> Pick -> Mark Picked -> Pack & QC', async () => {
  ok(await api.updateRecordById('Sales_Order_Readiness_Gate', state.gate, { Assign_Picker: 'Hendel', Release: true }), 'release');
  const pick = await one('Pick1');
  assert.equal(pick.Package_Order, PAC);
  assert.equal(String(pick.Quantity_to_Pick), '3');
  assert.equal((await one('Sales_Order_Fulfillment')).Fulfillment_Stage, 'Picking');
  ok(await api.updateRecordById('Pick1', pick.ID, { Marked: true }), 'mark picked');
  const qc = await one('Checker_Checklist');
  assert.equal(qc.PAC, PAC);
  assert.equal(String(qc.Quantity), '3');
  assert.equal((await one('Sales_Order_Fulfillment')).Fulfillment_Stage, 'Pack & QC');
  state.qc = qc.ID;
});

test('4. QC: 2 pass go to To Ship, the 1 that fails goes to Exception Control (no duplicates)', async () => {
  // the Pack & QC page writes a split as two saves on the same record: the rejected share, then the approved share
  ok(await api.updateRecordById('Checker_Checklist', state.qc, { Quality_Checker: 'Kurt', QC_Status: 'Rejected', Quantity: '1', Quantity_of_Damage_Items: '1', Item_to_Replace: 'Whole Fixture' }), 'reject share');
  ok(await api.updateRecordById('Checker_Checklist', state.qc, { QC_Status: 'Approved', Quantity: '2' }), 'approve share');
  const exc = await rows('Exception_Control1');
  assert.equal(exc.length, 1);
  assert.match(exc[0].Exception_Number, /^EXC-FF-\d{5}$/);
  assert.equal(exc[0].Sales_Order, SO);
  const agg = await one('Order_Aggregation1');
  assert.deepEqual(agg.Item_Details.map((r) => [r.SKU, Number(r.QTY), r.PAC]), [['LAMP-1', 2, PAC]]);
  assert.equal((await one('Sales_Order_Fulfillment')).Fulfillment_Stage, 'Order Aggregation');
  // saving the same decision again changes nothing
  ok(await api.updateRecordById('Checker_Checklist', state.qc, { QC_Status: 'Approved', Quantity: '2' }), 'same decision again');
  assert.equal((await rows('Exception_Control1')).length, 1);
  assert.equal((await rows('Order_Aggregation1')).length, 1);
  state.exc = exc[0].ID;
});

test('5. Exception repaired -> back to QC with only that 1 unit -> approved -> To Ship has all 3', async () => {
  ok(await api.updateRecordById('Exception_Control1', state.exc, { Status: 'Completed' }), 'complete the exception');
  const recheck = (await rows('Checker_Checklist')).filter((c) => Array.isArray(c.Recheck_Exceptions));
  assert.equal(recheck.length, 1);
  assert.equal(String(recheck[0].Quantity), '1');
  ok(await api.updateRecordById('Checker_Checklist', recheck[0].ID, { QC_Status: 'Approved', Quantity: '1' }), 'approve the re-check');
  const agg = await one('Order_Aggregation1');
  assert.deepEqual(agg.Item_Details.map((r) => [r.SKU, Number(r.QTY)]), [['LAMP-1', 3]]);
  assert.equal((await rows('Exception_Control1')).length, 1, 'still the one exception');
  state.agg = agg.ID;
});

test('6. To Ship: select the item and dispatch it to Delivery (Initial Scheduling), the order is fully dispatched', async () => {
  let agg = await one('Order_Aggregation1');
  const selected = agg.Item_Details.map((r) => ({ ...r, Select1: true }));
  ok(await api.updateRecordById('Order_Aggregation1', agg.ID, { Item_Details: selected }), 'select the item');
  agg = await one('Order_Aggregation1');
  const sched = await api.addRecords('Delivery_Scheduling', {
    SO, Schedule_Status: 'New', Order_Aggregation_ID: String(agg.ID), Customer_Name: 'Chain Customer', Customer_Address: '1 Chain St, Makati', Delivery_City: 'Makati',
    Package_Number: PAC, Item_Details: [{ Item_Name: 'Chain Lamp', Qty: '3', SKU: 'LAMP-1', PAC }], Item_Detail: 'Chain Lamp', Qty: '3', Completed: 'Not Yet', Rescheduled: 'No',
    Type_of_Delivery: 'Delivery Only', Date_field: '2026-12-20',
  });
  ok(sched, 'initial scheduling');
  state.sched = sched.data.data.ID;
  const dispatched = agg.Item_Details.map((r) => ({ Item_Name: r.Item_Name, SKU: r.SKU, QTY: r.QTY, Bin_Location: r.Bin_Location, PAC: r.PAC, Select1: false, Dispatched: true }));
  ok(await api.updateRecordById('Order_Aggregation1', agg.ID, { Item_Details: dispatched, Dispatch_Selected: true }), 'mark dispatched');
  assert.equal((await one('Sales_Order_Fulfillment')).Fulfillment_Stage, 'For Delivery');
  assert.equal(isTrue((await one('Order_Aggregation1')).Dispatch_Selected), true);
});

// ---------------- 3. Delivery ----------------
test('7. Delivery: Initial Scheduling hand-off -> Service Request -> Appointment (Queued) with its package', async () => {
  const sr = await api.addRecords('Service_Request1', {
    Sales_Order: SO, Package_Number: PAC, Customer_Name: 'Chain Customer', Customer_Address: '1 Chain St, Makati', City: 'Makati', Delivery_Type: 'Delivery Only',
    Initial_Schedule_ID: String(state.sched), Order_Aggregation_ID: String(state.agg), Delivery_Date: '2026-12-20', Priority_Level: 'Normal', Email: 'chain@example.test', Phone_Number: '+63 900 111 2222',
    Item_Details: [{ Item_Name: 'Chain Lamp', SKU: 'LAMP-1', Quantity: 3, PAC }],
  });
  ok(sr, 'service request');
  ok(await api.updateRecordById('Delivery_Scheduling', state.sched, { Schedule_Status: 'Handed Off' }), 'hand off');
  const appt = await one('Service_Appointment');
  assert.equal(appt.Appointment_Status, 'Queued');
  assert.equal(appt.Sales_Order, SO);
  assert.equal(appt.Item_Details.length, 1);
  assert.equal(String(appt.Item_Details[0].PAC), PAC);
  state.appt = appt.ID;
  const ships = await rows('Package_Shipments');
  assert.equal(ships.length, 1);
  assert.equal(ships[0].Package_Number, PAC);
  assert.equal(String((await one('Service_Request1')).Service_Appointment_ID), String(appt.ID));
});

test('8. Appointment: site confirmed, scheduled, dispatched, in transit, delivered, completed -> it is on the Archived page', async () => {
  ok(await api.updateRecordById('Service_Appointment', state.appt, { Site_Confirmation_Status: 'Confirmed', Confirmation_Method: 'Phone', Site_Confirmation_Notes: 'Customer said ok' }), 'site confirmation');
  ok(await api.updateRecordById('Service_Appointment', state.appt, { Confirmed_Schedule_Date: '2026-12-20', Confirmed_Time_Slot: '09:00 AM - 12:00 PM', Calendar_Entry_Created: true, Appointment_Status: 'Scheduled' }), 'scheduled');
  for (const status of ['Dispatched', 'In Transit']) ok(await api.updateRecordById('Service_Appointment', state.appt, { Appointment_Status: status }), status);
  ok(await api.updateRecordById('Service_Appointment', state.appt, { Appointment_Status: 'Delivered', Actual_Delivery_Date: '2026-12-20' }), 'delivered');
  assert.equal((await one('Service_Appointment')).Appointment_Status, 'Delivered');
  ok(await api.updateRecordById('Service_Appointment', state.appt, { Appointment_Status: 'Completed' }), 'completed');

  // what the Archived page lists: appointments whose status is Completed or Failed
  const archived = (await rows('Service_Appointment')).filter((r) => ['Completed', 'Failed'].includes(r.Appointment_Status));
  assert.equal(archived.length, 1);
  assert.equal(archived[0].Sales_Order, SO);
  assert.equal(archived[0].Actual_Delivery_Date, '2026-12-20');
  const pkg = await rows('Package_Shipments', `(Service_Appointment_ID == "${state.appt}")`);
  assert.equal(pkg.length, 1, 'the Archived detail finds its package shipment');
});

test('9. The To Ship order is archived once it is fully dispatched', async () => {
  const agg = await one('Order_Aggregation1');
  assert.ok(agg.Item_Details.every((r) => isTrue(r.Dispatched)));
  ok(await api.updateRecordById('Order_Aggregation1', agg.ID, { Archived: true }), 'archive the order');
  assert.equal(isTrue((await one('Order_Aggregation1')).Archived), true);
  assert.equal((await one('Sales_Order_Fulfillment')).Fulfillment_Stage, 'For Delivery', 'archiving does not move the stage');
});

test('10. No duplicates anywhere, and the server logged no errors', async () => {
  assert.equal((await rows('Purchase_Order')).length, 1);
  assert.equal((await rows('Shipments')).length, 1);
  assert.equal((await rows('Receiving')).length, 1);
  assert.equal((await rows('Sales_Order_Readiness_Gate')).length, 1);
  assert.equal((await rows('Pick1')).length, 1);
  assert.equal((await rows('Order_Aggregation1')).length, 1);
  assert.equal((await rows('Exception_Control1')).length, 1);
  assert.equal((await rows('Service_Request1')).length, 1);
  assert.equal((await rows('Service_Appointment')).length, 1);
  assert.equal((await rows('Package_Shipments')).length, 1);
  assert.equal((await rows('Checker_Checklist')).length, 2, 'the original QC record and the one re-check');
  const errors = harness.logs.filter((l) => /Error|ECONN|UnhandledPromise|TypeError|ReferenceError/i.test(l));
  assert.deepEqual(errors, []);
});
