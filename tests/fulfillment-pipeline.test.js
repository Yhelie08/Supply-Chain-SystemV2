// Fulfillment pipeline, first part (server/modules/fulfillment/pipeline.mjs), run on PGlite with the hooked store:
// paid + package -> Order Readiness (one Gate record per item). Release -> Pick -> Mark Picked -> Pack & QC. QC approve and later are not ported yet.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../server/pg/schema.mjs';
import { createStore } from '../server/pg/store.mjs';
import { createHookedStore } from '../server/workflows/index.mjs';
import { workflows } from '../server/workflows/all.mjs';

const SOF = 'Sales_Order_Fulfillment', GATE = 'Sales_Order_Readiness_Gate', PICK = 'Pick1', QC = 'Checker_Checklist';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SOF, GATE, PICK, QC, 'Pick_Notifications', 'Customer']) await db.query(`DELETE FROM "${f}"`); });

const lamp = { Item: 'Lamp', SKU: 'L-1', Quantity: '2', Bin_Location: 'A-01' };
const shade = { Item: 'Shade', SKU: 'S-1', Quantity: '4', Bin_Location: 'B-02' };
const addPackage = async (extra = {}) => {
  const customer = await raw.addRecord('Customer', { customer_name: 'Sample Customer' });
  return store.addRecord(SOF, {
    SO_No: 'SO-1', Fulfillment_Stage: 'Waiting For Package', Package: 'PAC-1', Status: 'Yes', Customer: customer, Customer_Type: 'Corporate', Delivery_Type: 'Delivery Only',
    order_type: 'Normal', Shipping_Address: '1 Main St', Item_Details1: [lamp, shade], ...extra,
  });
};
const sof = async (id) => raw.getRecordById(SOF, id, { raw: true });
const rows = (form) => raw.find(form);

test('paid + package: the Order Readiness stage and one Gate record per item, with the customer and address', async () => {
  const id = await addPackage();
  assert.equal((await sof(id)).Fulfillment_Stage, 'Order Readiness');
  const gate = await rows(GATE);
  assert.deepEqual(gate.map((g) => g.SKU).sort(), ['L-1', 'S-1']);
  const g = gate.find((r) => r.SKU === 'L-1');
  assert.equal(g.sales_order_number, 'SO-1');
  assert.equal(g.Package_Order, 'PAC-1');
  assert.equal(g.payment_status, 'Yes');
  assert.equal(g.customer_name, 'Sample Customer');
  assert.equal(g.customer_address, '1 Main St');
  assert.equal(g.Quantity, '2');
  assert.equal(g.Bin_Location, 'A-01');
});

test('a package number is enough for the Gate, paid or not (the payment is copied); no package number: it waits and has none', async () => {
  for (const extra of [{ Status: 'No' }, { Status: 'Partial' }, { Package: '' }]) {
    await db.query(`DELETE FROM "${SOF}"`);
    await db.query(`DELETE FROM "${GATE}"`);
    const id = await addPackage(extra);
    assert.equal((await sof(id)).Fulfillment_Stage, extra.Package === '' ? 'Waiting For Package' : 'Order Readiness', JSON.stringify(extra));
    assert.equal((await rows(GATE)).length, extra.Package === '' ? 0 : 2, JSON.stringify(extra));
  }
});

test('paying later updates the Gate records (payment status); saving again does not duplicate them', async () => {
  const id = await addPackage({ Status: 'No' });
  assert.deepEqual((await rows(GATE)).map((g) => g.payment_status), ['No', 'No']);
  await store.updateRecord(SOF, id, { Status: 'Yes' }, { byForm: true });
  assert.equal((await sof(id)).Fulfillment_Stage, 'Order Readiness');
  assert.deepEqual((await rows(GATE)).map((g) => g.payment_status), ['Yes', 'Yes']);
  await store.updateRecord(SOF, id, { Shipping_Address: '2 Side St' }, { byForm: true });
  const gate = await rows(GATE);
  assert.equal(gate.length, 2);
  assert.ok(gate.every((g) => g.customer_address === '2 Side St'), 'an existing Gate record is refreshed, not duplicated');
});

test('Release creates the Pick1 record and a notification and the package is in Picking; an unreleased sibling stays out', async () => {
  const id = await addPackage();
  const [lampGate] = (await rows(GATE)).filter((g) => g.SKU === 'L-1');
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  const picks = await rows(PICK);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].SKU, 'L-1');
  assert.equal(picks[0].SO, 'SO-1');
  assert.equal(picks[0].Picker, 'Hendel');
  assert.equal(picks[0].Quantity_to_Pick, '2');
  assert.equal(picks[0].Package_Order, 'PAC-1');
  assert.equal(picks[0].Customer_Name, 'Sample Customer');
  assert.equal((await rows('Pick_Notifications')).length, 1);
  assert.equal((await sof(id)).Fulfillment_Stage, 'Picking');
});

test('saving a released Gate record again updates its Pick1 record, never duplicates it or its notification', async () => {
  await addPackage();
  const [lampGate] = (await rows(GATE)).filter((g) => g.SKU === 'L-1');
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Jayvon' }, { byForm: true });
  const picks = await rows(PICK);
  assert.equal(picks.length, 1);
  assert.equal(picks[0].Picker, 'Jayvon');
  assert.equal((await rows('Pick_Notifications')).length, 1);
});

test('a package that is further along is not pulled back by saving its Gate record, and releasing alone creates no QC record', async () => {
  const id = await addPackage();
  const [lampGate] = (await rows(GATE)).filter((g) => g.SKU === 'L-1');
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  await store.updateRecord(SOF, id, { Fulfillment_Stage: 'Pack & QC' }, { byForm: true });
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Kurt' }, { byForm: true });
  assert.equal((await sof(id)).Fulfillment_Stage, 'Pack & QC');
  assert.equal((await rows('Checker_Checklist')).length, 0);
});

test('nothing changes on the way from Sales Order to Readiness to Pick: SO, PR, RR, Demo, package, item, quantity, customer, forecast', async () => {
  const id = await addPackage({
    SO_No: 'SO-16468', PR_No: 'PR-0042', RR_No: 'RR-0007', order_type: 'Pre Order', Delivery_Type: 'Delivery and Installation', For_Crate: true,
    target_delivery_date: '2026-12-05', Billing_Address: '9 Bill St', Shipping_Address: '',
    Forecast_Delivery: '2026-11-30', Forecast_Window: 'Nov 28 – Dec 2', Forecast_Status: 'At Risk',
  });
  const sofRow = await sof(id);
  const gate = (await rows(GATE)).find((g) => g.SKU === 'L-1');
  assert.deepEqual(
    [gate.sales_order_number, gate.pr_number, gate.rr_number, gate.Package_Order, gate.Order_Type, gate.Delivery_Type, gate.For_Crate, gate.Target_Delivery_Date, gate.customer_type, gate.customer_address, gate.Item_Name, gate.Quantity, gate.Bin_Location, gate.Forecast_Delivery, gate.Forecast_Window, gate.Forecast_Status],
    [sofRow.SO_No, sofRow.PR_No, sofRow.RR_No, sofRow.Package, sofRow.order_type, sofRow.Delivery_Type, sofRow.For_Crate, sofRow.target_delivery_date, sofRow.Customer_Type, '9 Bill St', 'Lamp', '2', 'A-01', '2026-11-30', 'Nov 28 – Dec 2', 'At Risk'],
  );
  // a Demo number set on the Gate is carried on too
  await store.updateRecord(GATE, gate.ID, { Demo: 'DEMO-9', Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  const [pick] = await rows(PICK);
  assert.deepEqual(
    [pick.SO, pick.PR_if_any, pick.RR, pick.Demo, pick.Package_Order, pick.Order_Type, pick.Delivery_Type, pick.For_Crate, pick.Target_Delivery_Date, pick.Customer_Name, pick.Customer_Type, pick.Customer_Address, pick.Item_Name, pick.SKU, pick.Quantity_to_Pick, pick.Bin_Location, pick.Forecast_Delivery, pick.Forecast_Window, pick.Forecast_Status],
    ['SO-16468', 'PR-0042', 'RR-0007', 'DEMO-9', 'PAC-1', 'Pre Order', 'Delivery and Installation', true, '2026-12-05', 'Sample Customer', 'Corporate', '9 Bill St', 'Lamp', 'L-1', '2', 'A-01', '2026-11-30', 'Nov 28 – Dec 2', 'At Risk'],
  );
});

test('a later save of the Sales Order never blanks the customer name, address or forecast already on the Gate and Pick', async () => {
  const id = await addPackage({ Forecast_Delivery: '2026-11-30', Forecast_Window: 'Nov 28 – Dec 2', Forecast_Status: 'On Track' });
  const [lampGate] = (await rows(GATE)).filter((g) => g.SKU === 'L-1');
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  await db.query(`DELETE FROM "Customer"`); // the customer lookup now finds nothing
  await store.updateRecord(SOF, id, { Shipping_Address: '', Billing_Address: '', Forecast_Delivery: '', Forecast_Window: '', Forecast_Status: '', Status: 'Yes' }, { byForm: true });
  const gate = (await rows(GATE)).find((g) => g.SKU === 'L-1');
  assert.equal(gate.customer_name, 'Sample Customer');
  assert.equal(gate.customer_address, '1 Main St');
  assert.equal(gate.Forecast_Delivery, '2026-11-30');
  const [pick] = await rows(PICK);
  assert.equal(pick.Customer_Name, 'Sample Customer');
  assert.equal(pick.Customer_Address, '1 Main St');
  assert.equal(pick.Forecast_Status, 'On Track');
});

const toPick = async (extra = {}) => {
  const id = await addPackage(extra);
  const [lampGate] = (await rows(GATE)).filter((g) => g.SKU === 'L-1');
  await store.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  const [pick] = await rows(PICK);
  return { id, pick };
};

test('Mark Picked creates one pending QC record with the same values, and the package is in Pack & QC', async () => {
  const { id, pick } = await toPick({ PR_No: 'PR-0042', RR_No: 'RR-0007', target_delivery_date: '2026-12-05', Forecast_Delivery: '2026-11-30', Forecast_Window: 'Nov 28 – Dec 2', Forecast_Status: 'At Risk' });
  assert.equal((await rows(QC)).length, 0, 'nothing in QC before the item is picked');
  await store.updateRecord(PICK, pick.ID, { Marked: true }, { byForm: true });
  const qc = await rows(QC);
  assert.equal(qc.length, 1);
  assert.deepEqual(
    [qc[0].SO, qc[0].PAC, qc[0].PR, qc[0].RR, qc[0].SKU, qc[0].Item_Name, qc[0].Quantity, qc[0].Bin_Location, qc[0].Target_Delivery_Date, qc[0].Customer_Name, qc[0].Customer_Address, qc[0].Forecast_Delivery, qc[0].Forecast_Window, qc[0].Forecast_Status, qc[0].QC_Status, qc[0].Quality_Checker],
    ['SO-1', 'PAC-1', 'PR-0042', 'RR-0007', 'L-1', 'Lamp', '2', 'A-01', '2026-12-05', 'Sample Customer', '1 Main St', '2026-11-30', 'Nov 28 – Dec 2', 'At Risk', '', ''],
  );
  assert.equal((await sof(id)).Fulfillment_Stage, 'Pack & QC');
  assert.equal((await raw.getRecords('All_Qc_Reports1')).length, 1, 'the Pack & QC page report lists it');
});

test('marking again updates the pending QC record; an approved one is history and a new pick gets its own', async () => {
  const { pick } = await toPick();
  await store.updateRecord(PICK, pick.ID, { Marked: true }, { byForm: true });
  await store.updateRecord(PICK, pick.ID, { Bin_Location: 'A-02' }, { byForm: true });
  let qc = await rows(QC);
  assert.equal(qc.length, 1);
  assert.equal(qc[0].Bin_Location, 'A-02');
  await store.updateRecord(QC, qc[0].ID, { QC_Status: 'Approved' }, { byForm: true });
  await store.updateRecord(PICK, pick.ID, { Quantity_to_Pick: '3' }, { byForm: true });
  qc = await rows(QC);
  assert.equal(qc.length, 2, 'the approved record is not reopened');
});

test('an unmarked Pick save adds no QC record, and a package already in Pack & QC is not pulled back to Picking', async () => {
  const { id, pick } = await toPick();
  await store.updateRecord(PICK, pick.ID, { Picker: 'Kurt' }, { byForm: true });
  assert.equal((await rows(QC)).length, 0);
  assert.equal((await sof(id)).Fulfillment_Stage, 'Picking');
  await store.updateRecord(PICK, pick.ID, { Marked: true }, { byForm: true });
  await store.updateRecord(PICK, pick.ID, { Marked: false }, { byForm: true });
  assert.equal((await sof(id)).Fulfillment_Stage, 'Pack & QC');
});

// ---- the catch-up sweep: data that was written without any hook (a custom API, an import, a direct write) ----
import { reconcileFulfillment } from '../server/modules/fulfillment/pipeline.mjs';

test('reconcile: data written with no hook is carried all the way, with the customer contact, and a second run changes nothing', async () => {
  const customer = await raw.addRecord('Customer', { customer_name: 'Sample Customer', Email: 'c@example.test', Phone_Number: '+63 900 000 0000', Billing_Address: { district_city: 'Makati' } });
  const paid = await raw.addRecord(SOF, { SO_No: 'SO-7', Fulfillment_Stage: 'Waiting For Package', Package: 'PAC-7', Status: 'Yes', Customer: customer, Customer_Type: 'Corporate', order_type: 'Normal', Delivery_Type: 'Delivery Only', Item_Details1: [lamp, shade], PR_No: 'PR-7' });
  const unpaid = await raw.addRecord(SOF, { SO_No: 'SO-8', Fulfillment_Stage: 'Waiting For Package', Package: 'PAC-8', Status: 'Partial', Customer: customer, Item_Details1: [lamp] });
  const noPackage = await raw.addRecord(SOF, { SO_No: 'SO-9', Fulfillment_Stage: 'Waiting For Package', Package: '', Status: 'Yes', Customer: customer, Item_Details1: [lamp] });

  let done = await reconcileFulfillment(raw);
  assert.equal(done.gate, 2);
  assert.equal((await rows(GATE)).length, 3, 'SO-7 has two items, SO-8 one; the package-less order has none');
  assert.equal((await sof(paid)).Fulfillment_Stage, 'Order Readiness');
  assert.equal((await sof(unpaid)).Fulfillment_Stage, 'Order Readiness');
  assert.equal((await sof(noPackage)).Fulfillment_Stage, 'Waiting For Package');

  const lampGate = (await rows(GATE)).find((g) => g.SKU === 'L-1');
  await raw.updateRecord(GATE, lampGate.ID, { Assign_Picker: 'Hendel', Release: true }, { byForm: true });
  done = await reconcileFulfillment(raw);
  assert.equal(done.pick, 1);
  assert.equal((await rows(PICK)).length, 1);
  assert.equal((await sof(paid)).Fulfillment_Stage, 'Picking');

  const [pick] = await rows(PICK);
  await raw.updateRecord(PICK, pick.ID, { Marked: true }, { byForm: true });
  done = await reconcileFulfillment(raw);
  assert.equal(done.qc, 1);
  const [qc] = await rows(QC);
  assert.deepEqual([qc.SO, qc.PAC, qc.PR, qc.SKU, qc.Quantity, qc.Customer_Name, qc.City, qc.Email, qc.Contact], ['SO-7', 'PAC-7', 'PR-7', 'L-1', '2', 'Sample Customer', 'Makati', 'c@example.test', '+63 900 000 0000']);
  assert.equal((await sof(paid)).Fulfillment_Stage, 'Pack & QC');

  assert.deepEqual(await reconcileFulfillment(raw), { gate: 0, pick: 0, qc: 0, stage: 0 }, 'nothing left to do');
});
