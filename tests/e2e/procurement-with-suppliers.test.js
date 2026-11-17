// The whole Procurement process WITH the suppliers (Tony Fan and Fenteng Lighting portals), through the real server (child process, in-memory Postgres,
// signed-in admin, HTTP API). No Zoho Books / Inventory (on hold).
//   Purchase Request -> both supplier portals get a copy -> each supplier answers -> the buyer picks Tony -> Create PO -> Tony's copy of the PO,
//   shipment and Receiving -> Tony acknowledges -> Tony ships a line -> the buyer's shipment follows -> Receiving counts (1 damaged) -> Exception ->
//   Create RR (main + Tony's copy) -> Tony approves -> RR and Exception closed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startE2EHarness } from './helpers/e2e-harness.mjs';

let harness, api;
const isTrue = (v) => v === true || v === 'true';
const ok = (res, what) => assert.equal(res.data?.code, 3000, `${what}: ${JSON.stringify(res.data)}`);
const rows = async (report, criteria) => { const r = await api.getRecords(report, criteria); return r.data?.data || []; };
const call = async (name, payload) => { const r = await api.invokeCustomApi(name, payload); assert.equal(r.data?.code, 3000, `${name}: ${JSON.stringify(r.data)}`); return r.data.result; };
const S = {}; // ids and numbers carried from step to step

before(async () => {
  harness = await startE2EHarness({ backend: 'pg' });
  await harness.seedUser({ email: 'admin@suppliers.local', password: 'AdminPassword123!', role: 'admin' });
  api = (await harness.login('admin@suppliers.local', 'AdminPassword123!')).client;
});
after(async () => { if (harness) await harness.stop(); });

test('1. Purchase Request: both supplier portals get a copy, waiting for an answer', async () => {
  ok(await api.addRecords('Suppliers', { Supplier_Name: { first_name: 'Tony Fan', last_name: '' }, Handles_All: true, Max_Capacity: 50, Supplier_ID: '2680178000002735078' }), 'Tony');
  ok(await api.addRecords('Suppliers', { Supplier_Name: { first_name: 'Fenteng Lighting', last_name: '' }, Handles_All: true, Max_Capacity: 50, Supplier_ID: '2680178000049168001' }), 'Fenteng');
  const cust = await api.addRecords('Customer', { customer_name: 'Supplier Test Customer' });
  const item = await api.addRecords('Items', { item_name: 'Pendant Lamp', SKU: 'PL-1', Rate: 120, category: 'Lighting' });
  ok(cust, 'customer'); ok(item, 'item');
  const pr = await api.addRecords('Purchase_Request1', {
    Sales_Order: 'SO-SUP', Customer: cust.data.data.ID, Items: item.data.data.ID, sku: 'PL-1', quantity: 3, unit: 'pcs', category: 'Lighting', Target_Delivery: '2027-01-30',
    Shipment_Mode: 'Air', Customer_Type: 'customer', Sales_Owner: 'HC Sales 1',
  });
  ok(pr, 'purchase request');
  const [row] = await rows('Purchase_Request1');
  S.prNo = row.PR_No;
  assert.match(S.prNo, /^PR-\d{5}$/);
  assert.equal(row.Supplier_Selected.length, 2, 'one response row per supplier');
  const tony = await rows('Tony_Fan_Purchase_Request');
  const fenteng = await rows('Fenteng_Lighting_Purchase_Request');
  assert.equal(tony.length, 1);
  assert.equal(fenteng.length, 1);
  assert.equal(tony[0].PR_No_Supplier2, S.prNo);
  assert.equal(tony[0].Response_Status, 'Waiting');
  assert.equal(fenteng[0].PR_No_Supplier1, S.prNo);
  S.tonyPr = tony[0].ID; S.fentengPr = fenteng[0].ID;
});

test('2. Both suppliers answer (the form refuses an incomplete answer), their answers appear on the buyer\'s PR', async () => {
  // Tony: incomplete first, then complete
  const bad = await api.updateRecordById('Tony_Fan_Purchase_Request', S.tonyPr, { Response_Status: 'Submit Response', Supplier_Selected_Supplier2: [{ Suppliers_Supplier2: 'Tony', Availability_Supplier2: 'Available', Initial_Price_Supplier2: 0, Final_Price_Supplier2: 0, Lead_Time_Supplier2: 0 }] });
  assert.notEqual(bad.data.code, 3000);
  assert.match(JSON.stringify(bad.data), /Required fields missing/);
  ok(await api.updateRecordById('Tony_Fan_Purchase_Request', S.tonyPr, { Response_Status: 'Submit Response', Supplier_Selected_Supplier2: [{ Suppliers_Supplier2: 'Tony', Availability_Supplier2: 'Available', Initial_Price_Supplier2: 90, Negotiated_Supplier2: 85, Final_Price_Supplier2: 80, Lead_Time_Supplier2: 14 }] }), 'Tony answers');
  // Fenteng cannot produce: needs no prices
  ok(await api.updateRecordById('Fenteng_Lighting_Purchase_Request', S.fentengPr, { Response_Status: 'Submit Response', Supplier_Selected_Supplier1: [{ Suppliers_Supplier1: 'Fenteng', Availability_Supplier1: 'Cannot Produce', Initial_Price_Supplier1: 0, Final_Price_Supplier1: 0, Lead_Time_Supplier1: 0 }] }), 'Fenteng answers');
  const [pr] = await rows('Purchase_Request1');
  const tonyRow = pr.Supplier_Selected.find((r) => String(r.Suppliers).includes('Tony'));
  const fentengRow = pr.Supplier_Selected.find((r) => String(r.Suppliers).includes('Fenteng'));
  assert.deepEqual([tonyRow.Availability, Number(tonyRow.Initial_Price), Number(tonyRow.Final_Price), Number(tonyRow.Lead_Time)], ['Available', 90, 80, 14]);
  assert.equal(fentengRow.Availability, 'Cannot Produce');
});

test('3. The buyer picks Tony: the PR is ready for a PO, Tony\'s copy is Selected, Fenteng\'s is Not Selected', async () => {
  const [pr] = await rows('Purchase_Request1');
  const picked = pr.Supplier_Selected.map((r) => ({ ...r, Selected: String(r.Suppliers).includes('Tony') }));
  ok(await api.updateRecordById('Purchase_Request1', pr.ID, { Supplier_Selected: picked }), 'select Tony');
  const [after1] = await rows('Purchase_Request1');
  assert.match(after1.Selected_Supplier, /Tony/);
  assert.equal(Number(after1.Selcted_Final_Cost), 80);
  assert.equal(isTrue(after1.PR_READY_FOR_PO), true, 'ready for PO');
  assert.equal((await rows('Tony_Fan_Purchase_Request'))[0].Response_Status, 'Selected');
  assert.equal((await rows('Fenteng_Lighting_Purchase_Request'))[0].Response_Status, 'Not Selected');
  S.prId = after1.ID;
});

test('4. Create PO: the PO, then Tony\'s copy of it with a Pending shipment and a Receiving record; clicking again makes nothing more', async () => {
  const main = await call('approve_po_main', { soNo: 'SO-SUP' });
  assert.equal(main.status, 'success', JSON.stringify(main));
  const [po] = await rows('Purchase_Order');
  S.poNo = po.PO_No;
  assert.equal(po.PO_Line_Items.length, 1);
  assert.equal(po.PO_Line_Items[0].PR_No, S.prNo);
  assert.equal(Number(po.PO_Line_Items[0].QTY), 3);
  assert.equal(Number(po.Total_PO_Value), 240);
  const [pr] = await rows('Purchase_Request1');
  assert.equal(pr.PR_Status, 'Converted to PO');
  assert.equal(pr.Link_PO_No, S.poNo);

  const tony = await call('approve_po_tony', { soNo: 'SO-SUP' });
  assert.equal(tony.processed, 1, JSON.stringify(tony));
  assert.equal((await call('approve_po_fenteng', { soNo: 'SO-SUP' })).processed, 0, 'Fenteng was not selected');
  const [copy] = await rows('Tony_Fan_Purchase_Order');
  assert.equal(copy.PO_No_Supplier2, S.poNo);
  assert.equal(copy.PO_Line_Items_Supplier2.length, 1);
  assert.equal((await rows('Fenteng_Lighting_Purchase_Order')).length, 0);
  const [ship] = await rows('Shipments');
  assert.equal(ship.Shipment_Status, 'Pending');
  assert.equal(ship.Supplier, 'Tony');
  S.shipId = ship.ID; S.shipNo = ship.Shipment_No;
  const [rcv] = await rows('Receiving');
  assert.equal(rcv.Receive_Status, 'Pending');
  assert.equal(rcv.Receiving_Line_Items.length, 1);
  S.rcvId = rcv.ID;
  // again
  assert.equal((await call('approve_po_main', { soNo: 'SO-SUP' })).status, 'empty');
  assert.equal((await call('approve_po_tony', { soNo: 'SO-SUP' })).processed, 0);
  for (const f of ['Purchase_Order', 'Tony_Fan_Purchase_Order', 'Shipments', 'Tony_Shipment', 'Receiving']) assert.equal((await rows(f)).length, 1, f);
});

test('5. Tony acknowledges the PO with ETD / ETA; a second try does nothing', async () => {
  assert.equal((await call('acknowledge_po_tony', { poNoSupplier2: S.poNo, etd: '', eta: '2027-01-10' })).status, 'error');
  assert.equal((await call('acknowledge_po_tony', { poNoSupplier2: S.poNo, etd: '2027-01-02', eta: '2027-01-10' })).status, 'success');
  assert.equal((await call('acknowledge_po_tony', { poNoSupplier2: S.poNo, etd: '2027-01-02', eta: '2027-01-10' })).status, 'already');
  assert.equal((await rows('Tony_Fan_Purchase_Order'))[0].PO_Status_Supplier2, 'Confirmed');
  assert.equal((await rows('Purchase_Order'))[0].PO_Status, 'Confirmed');
  const [ship] = await rows('Shipments');
  assert.deepEqual([ship.ETD, ship.ETA], ['2027-01-02', '2027-01-10']);
  assert.equal((await rows('Shipments')).length, 1);
});

test('6. Tony ships: the line is added to the buyer\'s shipment In Transit with its dates; the buyer\'s line status goes back to Tony', async () => {
  const [tonyShip] = await rows('Tony_Shipment');
  assert.equal(tonyShip.Parent_Shipment_ID, String(S.shipId));
  const lines = tonyShip.Supplier2_Shipment_Details.map((r) => ({ ...r, Select_To_Ship: true, Shipment_Mode: 'Airfreight', Date_Shipped: '2027-01-03' }));
  ok(await api.updateRecordById('Tony_Shipment', tonyShip.ID, { Supplier2_Shipment_Details: lines }), 'ship');
  let [ship] = await rows('Shipments');
  assert.equal(ship.Supplier_Shipment_Details.length, 1);
  assert.equal(ship.Supplier_Shipment_Details[0].Status, 'In Transit');
  assert.match(ship.Supplier_Shipment_Details[0].Shipment_ID, /^SHP-AIR-\d{5}$/);
  assert.equal(ship.Ship_Out_Date, '2027-01-03');
  assert.equal(ship.Estimated_Warehouse_Arrival, '2027-01-15');
  // saving the supplier's shipment again adds nothing
  ok(await api.updateRecordById('Tony_Shipment', tonyShip.ID, { Added_User1: 'tony' }), 'save again');
  assert.equal((await rows('Shipments'))[0].Supplier_Shipment_Details.length, 1);
  // the buyer marks the line Arrived: the supplier's copy follows
  const poLines = ship.PO_Shipments.map((l) => ({ ...l, Line_Status: 'Arrived' }));
  ok(await api.updateRecordById('Shipments', ship.ID, { PO_Shipments: poLines, Shipment_Status: 'In Transit' }), 'line arrived');
  assert.equal((await rows('Tony_Shipment'))[0].Supplier2_Shipment_Details[0].Status, 'Arrived');
});

test('7. Receiving counts 2 good and 1 damaged, asks for an exception: Delivered, one exception, never twice', async () => {
  const [rcv] = await rows('Receiving');
  const lines = rcv.Receiving_Line_Items.map((l) => ({ ...l, Accepted_Qty: 2, Damage_Qty: 1 }));
  const bad = await api.updateRecordById('Receiving', rcv.ID, { Receiving_Line_Items: lines.map((l) => ({ ...l, Accepted_Qty: 3 })) });
  assert.notEqual(bad.data.code, 3000);
  ok(await api.updateRecordById('Receiving', rcv.ID, { Receiving_Line_Items: lines, Create_Exception_Requested: true }), 'count');
  const [after1] = await rows('Receiving');
  assert.equal(after1.Receive_Status, 'Partial Received');
  assert.equal(Number(after1.Exception_Count), 1);
  assert.equal(after1.Damage_Missing_Details.filter((d) => d.Type_field === 'Damage').length, 1);
  assert.equal((await rows('Shipments'))[0].Shipment_Status, 'Delivered');
  const exc = await rows('Exceptions');
  assert.equal(exc.length, 1);
  assert.equal(exc[0].Exception_Status, 'Open');
  assert.equal(exc[0].Product_Context1.length, 1);
  assert.equal(exc[0].Product_Context1[0].Type_field, 'Damage');
  ok(await api.updateRecordById('Receiving', rcv.ID, { Receiving_Notes: 'again', Create_Exception_Requested: true }), 'ask again');
  assert.equal((await rows('Exceptions')).length, 1);
  assert.equal((await rows('App_Notifications')).filter((n) => n.Notification_Type === 'Receiving Quantity Mismatch').length, 1, 'one notice only');
  S.excId = exc[0].ID;
});

test('8. Create RR for the damaged lamp: the RR, Tony\'s copy with the same number, then Tony approves it', async () => {
  // the damage rows need the supplier on them for the supplier routing
  const [exc] = await rows('Exceptions');
  ok(await api.updateRecordById('Exceptions', exc.ID, { Product_Context1: exc.Product_Context1.map((p) => ({ ...p, Supplier: 'Tony', Repairable: 'No' })) }), 'exception detail');
  assert.equal((await call('create_rr_main', { exceptionId: String(exc.ID) })).created, 1);
  assert.equal((await call('create_rr_main', { exceptionId: String(exc.ID) })).created, 0, 'no second RR');
  assert.equal((await call('create_rr_tony', { exceptionId: String(exc.ID) })).created, 1);
  assert.equal((await call('create_rr_fenteng', { exceptionId: String(exc.ID) })).created, 0);
  const [main] = await rows('Replacement_Request');
  const [copy] = await rows('Tony_Fan_Replacement_Request');
  assert.equal(main.RR_Status, 'Open');
  assert.equal(copy.RR_No, main.RR_No);
  assert.equal((await rows('Exceptions'))[0].Exception_Status, 'Under Review');
  assert.equal((await rows('Purchase_Order'))[0].Damage_SKUs, 'PL-1');
  assert.equal((await rows('Tony_Fan_Purchase_Order'))[0].Damage_SKUs_Supplier2, 'PL-1');
  assert.equal((await call('approve_rr_tony', { rrRecordId: String(copy.ID), expectedShipDate: '', eta: '2027-02-01' })).status, 'error');
  assert.equal((await call('approve_rr_tony', { rrRecordId: String(copy.ID), expectedShipDate: '2027-01-25', eta: '2027-02-01' })).status, 'success');
  assert.equal((await call('approve_rr_tony', { rrRecordId: String(copy.ID), expectedShipDate: '2027-01-25', eta: '2027-02-01' })).message, 'Already approved.');
  const [m2] = await rows('Replacement_Request');
  assert.equal(m2.RR_Status, 'Acknowledged');
  assert.equal(m2.ETA, '2027-02-01');
  S.rrId = m2.ID;
});

test('9. The buyer closes the RR and the exception, following the rules; the PO completes', async () => {
  const noNotes = await api.updateRecordById('Replacement_Request', S.rrId, { RR_Status: 'Closed' });
  assert.notEqual(noNotes.data.code, 3000);
  ok(await api.updateRecordById('Replacement_Request', S.rrId, { RR_Status: 'Closed', Closure_Notes: 'Replacement arrived', RR_Reason: 'Damaged on arrival' }), 'close RR');
  assert.ok((await rows('Replacement_Request'))[0].Closed_At);
  const noAction = await api.updateRecordById('Exceptions', S.excId, { Exception_Status: 'Resolved' });
  assert.notEqual(noAction.data.code, 3000);
  const notResolved = await api.updateRecordById('Exceptions', S.excId, { Exception_Status: 'Closed' });
  assert.notEqual(notResolved.data.code, 3000);
  ok(await api.updateRecordById('Exceptions', S.excId, { Exception_Status: 'Resolved', Resolution_Action: 'Replaced by Tony' }), 'resolve');
  ok(await api.updateRecordById('Exceptions', S.excId, { Exception_Status: 'Closed' }), 'close exception');
  const [po] = await rows('Purchase_Order');
  ok(await api.updateRecordById('Purchase_Order', po.ID, { PO_Status: 'Completed' }), 'complete the PO');
  assert.ok((await rows('Purchase_Order'))[0].Completed_On);
});

test('10. Nothing was made twice anywhere, and the server logged no errors', async () => {
  for (const [form, n] of [['Purchase_Request1', 1], ['Tony_Fan_Purchase_Request', 1], ['Fenteng_Lighting_Purchase_Request', 1], ['Purchase_Order', 1], ['Tony_Fan_Purchase_Order', 1], ['Shipments', 1], ['Tony_Shipment', 1],
    ['Receiving', 1], ['Exceptions', 1], ['Replacement_Request', 1], ['Tony_Fan_Replacement_Request', 1], ['Fenteng_Lighting_Replacement_Request', 0]]) {
    assert.equal((await rows(form)).length, n, form);
  }
  const errors = harness.logs.filter((l) => /Error|ECONN|UnhandledPromise|TypeError|ReferenceError/i.test(l));
  assert.deepEqual(errors, []);
});

// ---------- the same journey with Fenteng as the chosen supplier (its own field names end in _Supplier1) ----------
test('11. The same process when Fenteng is chosen: PO copy, acknowledge, ship, receive, RR, approve', async () => {
  const item = (await rows('Items'))[0];
  const cust = (await rows('Customer'))[0];
  ok(await api.addRecords('Purchase_Request1', { Sales_Order: 'SO-FEN', Customer: cust.ID, Items: item.ID, sku: 'PL-1', quantity: 2, unit: 'pcs', category: 'Lighting', Target_Delivery: '2027-02-15', Shipment_Mode: 'Air', Customer_Type: 'customer', Sales_Owner: 'HC Sales 1' }), 'second PR');
  const pr = (await rows('Purchase_Request1')).find((p) => p.Sales_Order === 'SO-FEN');
  const fen = (await rows('Fenteng_Lighting_Purchase_Request')).find((c) => c.PR_No_Supplier1 === pr.PR_No);
  ok(await api.updateRecordById('Fenteng_Lighting_Purchase_Request', fen.ID, { Response_Status: 'Submit Response', Supplier_Selected_Supplier1: [{ Suppliers_Supplier1: 'Fenteng', Availability_Supplier1: 'Available', Initial_Price_Supplier1: 70, Negotiated_Supplier1: 65, Final_Price_Supplier1: 60, Lead_Time_Supplier1: 10 }] }), 'Fenteng answers');
  const answered = (await rows('Purchase_Request1')).find((p) => p.Sales_Order === 'SO-FEN');
  ok(await api.updateRecordById('Purchase_Request1', answered.ID, { Supplier_Selected: answered.Supplier_Selected.map((r) => ({ ...r, Selected: String(r.Suppliers).includes('Fenteng') })) }), 'select Fenteng');

  assert.equal((await call('approve_po_main', { soNo: 'SO-FEN' })).status, 'success');
  assert.equal((await call('approve_po_fenteng', { soNo: 'SO-FEN' })).processed, 1);
  const po = (await rows('Purchase_Order')).find((p) => p.PO_Line_Items.some((l) => l.Supplier.includes('Fenteng')));
  const copy = (await rows('Fenteng_Lighting_Purchase_Order'))[0];
  assert.equal(copy.PO_No_Supplier1, po.PO_No);
  assert.equal(Number(copy.Total_PO_Value_Supplier1), 120);
  assert.equal((await call('acknowledge_po_fenteng', { poNoSupplier1: po.PO_No, etd: '2027-02-01', eta: '2027-02-12' })).status, 'success');
  assert.equal((await call('acknowledge_po_fenteng', { poNoSupplier1: po.PO_No, etd: '2027-02-01', eta: '2027-02-12' })).status, 'already');
  const ship = (await rows('Shipments')).find((s) => s.Supplier === 'Fenteng');
  assert.deepEqual([ship.ETD, ship.ETA], ['2027-02-01', '2027-02-12']);

  const fs = (await rows('Fenteng_Shipment'))[0];
  ok(await api.updateRecordById('Fenteng_Shipment', fs.ID, { Supplier1_Shipment_Details: fs.Supplier1_Shipment_Details.map((r) => ({ ...r, Select_To_Ship: true, Shipment_Mode: 'FCL', Date_Shipped: '2027-02-02' })) }), 'Fenteng ships');
  const shipped = (await rows('Shipments')).find((s) => s.Supplier === 'Fenteng');
  assert.match(shipped.Supplier_Shipment_Details[0].Shipment_ID, /^SHP-FCL-\d{5}$/);
  assert.equal(shipped.Estimated_Warehouse_Arrival, '2027-03-21', 'FCL: +47 days');

  const rcv = (await rows('Receiving')).find((r) => r.Supplier === 'Fenteng');
  ok(await api.updateRecordById('Receiving', rcv.ID, { Receiving_Line_Items: rcv.Receiving_Line_Items.map((l) => ({ ...l, Accepted_Qty: 1, Missing_Qty: 1 })), Create_Exception_Requested: true }), 'count');
  const exc = (await rows('Exceptions')).find((e) => e.Receive_No === rcv.Receive_No1);
  assert.ok(exc, 'a missing unit raises an exception');
  ok(await api.updateRecordById('Exceptions', exc.ID, { Product_Context1: exc.Product_Context1.map((p) => ({ ...p, Supplier: 'Fenteng' })) }), 'exception detail');
  assert.equal((await call('create_rr_main', { exceptionId: String(exc.ID) })).created, 1);
  assert.equal((await call('create_rr_fenteng', { exceptionId: String(exc.ID) })).created, 1);
  assert.equal((await call('create_rr_tony', { exceptionId: String(exc.ID) })).created, 0);
  const rr = (await rows('Fenteng_Lighting_Replacement_Request'))[0];
  assert.equal(rr.Source_Type, 'Receiving Missing');
  assert.equal((await call('approve_rr_fenteng', { rrRecordId: String(rr.ID), expectedShipDate: '2027-02-20', eta: '2027-03-01' })).status, 'success');
  assert.equal((await rows('Replacement_Request')).find((r) => r.RR_No === rr.RR_No).RR_Status, 'Acknowledged');
  assert.equal((await rows('Purchase_Order')).find((p) => p.PO_No === po.PO_No).Missing_SKUs, 'PL-1');
  const errors = harness.logs.filter((l) => /Error|ECONN|UnhandledPromise|TypeError|ReferenceError/i.test(l));
  assert.deepEqual(errors, []);
});
