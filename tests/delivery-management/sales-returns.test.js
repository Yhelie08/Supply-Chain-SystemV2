// Sales Returns (spec v1.4, Delivery 07 §1, RT-R1/R3/R6): server/modules/delivery-management/sales-returns.mjs.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { ensureSchema } from '../../server/pg/schema.mjs';
import { createStore } from '../../server/pg/store.mjs';
import { createHookedStore } from '../../server/workflows/index.mjs';
import { workflows } from '../../server/workflows/all.mjs';
import {
  computeReturnStatus, stampReturnStatus, createPulloutFromRefusal, confirmReturnReceived,
} from '../../server/modules/delivery-management/sales-returns.mjs';

const SA = 'Service_Appointment_Form';
const RETURNS = 'Sales_Returns_Form';
const EVENTS = 'Stage_Events';
const EXC = 'DMS_Exception_Queue';
let db, raw, store;

before(async () => {
  db = new PGlite();
  await ensureSchema(db);
  raw = createStore({ query: (sql, params) => db.query(sql, params), transaction: (fn) => db.transaction(fn) });
  store = createHookedStore(raw, workflows);
});
beforeEach(async () => { for (const f of [SA, RETURNS, EVENTS, EXC]) await db.query(`DELETE FROM "${f}"`); });

test('computeReturnStatus: the six stages, in order', () => {
  assert.equal(computeReturnStatus({}, null), 'requested');
  assert.equal(computeReturnStatus({ Pullout_Appointment_ID: '5' }, null), 'scheduled');
  assert.equal(computeReturnStatus({}, { Confirmed_Schedule_Date: '2027-01-01' }), 'scheduled');
  assert.equal(computeReturnStatus({}, { Appointment_Status: 'Completed' }), 'picked_up');
  assert.equal(computeReturnStatus({ Received_At: 'x' }, { Appointment_Status: 'Completed' }), 'received_back');
  assert.equal(computeReturnStatus({ Received_At: 'x', Books_SalesReturn_No: 'SR-1' }, null), 'closed');
});

test('createPulloutFromRefusal (RT-R1): pre-fills the same lines and customer details, and creates a linked Pullout appointment', async () => {
  const id = await raw.addRecord(SA, {
    Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Failed',
    Customer_Name: { first_name: 'Ana', last_name: 'Reyes' }, Customer_Address: '123 St', City: 'Pasig', Contact: '0917',
    Item_Details: [{ Item_Name: 'Sofa', SKU: 'SKU-1', Quantity: 2 }],
  });
  const { returnId, pulloutAppointmentId } = await createPulloutFromRefusal(raw, id, { reason: 'Wrong finish' });

  const ret = await raw.getRecordById(RETURNS, returnId, { raw: true });
  assert.equal(ret.Sales_Order, 'SO-1');
  assert.equal(ret.Customer_Address, '123 St');
  assert.equal(ret.Source_SA_ID, String(id));
  assert.equal(String(ret.Pullout_Appointment_ID), String(pulloutAppointmentId));
  assert.deepEqual(ret.Item_Details.map((i) => [i.SKU, i.Quantity, i.Return_Quantity]), [['SKU-1', 2, 2]]);
  assert.equal(ret.Return_Status, 'scheduled'); // a Pullout_Appointment_ID is already set

  const pullout = await raw.getRecordById(SA, pulloutAppointmentId, { raw: true });
  assert.equal(pullout.Type_of_Delivery, 'Pullout');
  assert.equal(pullout.Sales_Order, 'SO-1');

  const [event] = await raw.find(EVENTS, (e) => String(e.Record_Id) === String(returnId));
  assert.equal(event.Event, 'return.scheduled');
});

test('RT-R6: the return status follows its linked Pullout appointment as it is Scheduled, then Completed', async () => {
  const id = await raw.addRecord(SA, { Sales_Order: 'SO-1', Type_of_Delivery: 'Delivery Only', Appointment_Status: 'Failed' });
  const { returnId, pulloutAppointmentId } = await createPulloutFromRefusal(raw, id, {});
  await store.updateRecord(SA, pulloutAppointmentId, { Confirmed_Schedule_Date: '2027-01-01', Calendar_Entry_Created: true }, { byForm: true });
  assert.equal((await raw.getRecordById(RETURNS, returnId, { raw: true })).Return_Status, 'scheduled');

  await store.updateRecord(SA, pulloutAppointmentId, { Appointment_Status: 'Completed' }, { byForm: true });
  assert.equal((await raw.getRecordById(RETURNS, returnId, { raw: true })).Return_Status, 'picked_up');
});

test('confirmReturnReceived (RT-R3): Good condition just stamps received_back, no exception', async () => {
  const returnId = await raw.addRecord(RETURNS, { Sales_Order: 'SO-1' });
  await confirmReturnReceived(raw, returnId, { condition: 'Good' });
  const ret = await raw.getRecordById(RETURNS, returnId, { raw: true });
  assert.equal(ret.Received_Condition, 'Good');
  assert.ok(ret.Received_At);
  assert.equal(ret.Return_Status, 'received_back');
  assert.equal((await raw.find(EXC)).length, 0);
});

test('confirmReturnReceived (RT-R3): Damaged raises an exception with the fault-origin note', async () => {
  const returnId = await raw.addRecord(RETURNS, { Sales_Order: 'SO-1', Customer_Name: { first_name: 'Ana', last_name: 'Reyes' } });
  await confirmReturnReceived(raw, returnId, { condition: 'Damaged', notes: 'Crushed corner' });
  const [exc] = await raw.find(EXC);
  assert.equal(exc.Exception_Stage, 'Returns');
  assert.match(exc.Exception_Reason, /Damaged on receipt/);
  assert.match(exc.Exception_Reason, /Crushed corner/);
});

test('confirmReturnReceived: refuses a condition that is not Good or Damaged', async () => {
  const returnId = await raw.addRecord(RETURNS, { Sales_Order: 'SO-1' });
  await assert.rejects(confirmReturnReceived(raw, returnId, { condition: 'Fine' }), /Condition must be/);
});

test('RT-R6: Return_Status becomes closed once Books_SalesReturn_No is set', async () => {
  const returnId = await raw.addRecord(RETURNS, { Sales_Order: 'SO-1' });
  await raw.updateRecord(RETURNS, returnId, { Books_SalesReturn_No: 'SR-9001' }, { byForm: true });
  await stampReturnStatus(raw, returnId);
  assert.equal((await raw.getRecordById(RETURNS, returnId, { raw: true })).Return_Status, 'closed');
  const [event] = await raw.find(EVENTS, (e) => String(e.Record_Id) === String(returnId) && e.Event === 'return.closed');
  assert.ok(event);
});
